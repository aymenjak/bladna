// Campaigns module (spec §58–§62).
//
// Organization-owned campaigns with the local CAMPAIGN_TRANSITIONS state
// machine: status only changes through POST .../transition, public reads never
// expose DRAFT campaigns, participation is scoped to the authenticated
// volunteer, and the participant roster is organization-only (there is no
// public volunteer list).

import { getPrisma, type Prisma } from '@bladna/database';
import { assertTransition, type TransitionMap } from '@bladna/domain';
import { AppError } from '@bladna/types';
import {
  buildPageMeta,
  maskEmail,
  maskName,
  normalizePageParams,
  slugify,
  uniqueSlug,
} from '@bladna/utils';
import {
  campaignFiltersSchema,
  campaignStatusActionSchema,
  contributionActionSchema,
  contributionListSchema,
  createCampaignSchema,
  createContributionSchema,
  idParamsSchema,
  joinCampaignSchema,
  paginationQuerySchema,
  updateCampaignSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireAuth, requireOrgMembership, requireSystemPermission } from '../guards';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

type CampaignStatusLiteral = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';

type ParticipationStatusLiteral = 'REGISTERED' | 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN';

/**
 * Campaign lifecycle (spec §107): a campaign is drafted, activated, paused,
 * completed or cancelled, and only finished campaigns may be archived.
 * ARCHIVED is terminal; CANCELLED/COMPLETED must be finished before archiving.
 */
export const CAMPAIGN_TRANSITIONS: TransitionMap<CampaignStatusLiteral> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

type CampaignAction = z.infer<typeof campaignStatusActionSchema>['action'];

const ACTION_TARGET: Record<CampaignAction, CampaignStatusLiteral> = {
  ACTIVATE: 'ACTIVE',
  PAUSE: 'PAUSED',
  COMPLETE: 'COMPLETED',
  CANCEL: 'CANCELLED',
};

/** Statuses the anonymous public surface may ever see. */
const PUBLIC_CAMPAIGN_STATUSES: CampaignStatusLiteral[] = ['ACTIVE', 'PAUSED', 'COMPLETED'];

type ContributionStatusLiteral = 'PENDING' | 'CONFIRMED' | 'REJECTED';

/**
 * Contribution lifecycle (spec §33): a recorded bank-transfer contribution is
 * PENDING until the organization confirms or rejects it. CONFIRMED and REJECTED
 * are terminal — the platform never moves money and never issues refunds.
 */
export const CONTRIBUTION_TRANSITIONS: TransitionMap<ContributionStatusLiteral> = {
  PENDING: ['CONFIRMED', 'REJECTED'],
  CONFIRMED: [],
  REJECTED: [],
};

/** :id = campaign, :cid = contribution. */
const contributionParamsSchema = z.object({
  id: z.string().uuid(),
  cid: z.string().uuid(),
});

const participantsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['REGISTERED', 'ACTIVE', 'COMPLETED', 'WITHDRAWN']).optional(),
});

const orgCampaignListSchema = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED']).optional(),
  q: z.string().trim().max(120).optional(),
});

const CAMPAIGN_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  goal: true,
  startDate: true,
  endDate: true,
  status: true,
  volunteerTarget: true,
  hourTarget: true,
  beneficiaryTarget: true,
  budget: true,
  currency: true,
  coverImage: true,
  createdAt: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      verificationStatus: true,
      trustLevel: true,
    },
  },
  _count: { select: { participants: true, opportunities: true } },
} as const satisfies Prisma.CampaignSelect;

const CAMPAIGN_DETAIL_SELECT = {
  ...CAMPAIGN_LIST_SELECT,
  organizationId: true,
  updatedAt: true,
} as const satisfies Prisma.CampaignSelect;

// ── Public surface (never exposes DRAFT) ────────────────────────

export async function publicList(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, campaignFiltersSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.CampaignWhereInput = {};
  if (f.status) {
    // A DRAFT filter from the public surface yields an empty page instead of
    // confirming or exposing unpublished campaigns.
    where.status = f.status === 'DRAFT' ? { in: [] } : f.status;
  } else {
    where.status = { in: PUBLIC_CAMPAIGN_STATUSES };
  }
  if (f.organizationId) where.organizationId = f.organizationId;
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: 'insensitive' } },
      { description: { contains: f.q, mode: 'insensitive' } },
      { goal: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      select: CAMPAIGN_LIST_SELECT,
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function publicDetail(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();
  const campaign = await prisma.campaign.findFirst({
    where: { id, status: { in: PUBLIC_CAMPAIGN_STATUSES } },
    select: CAMPAIGN_DETAIL_SELECT,
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');

  // Honest funding totals: aggregates only — no donor PII on the public surface.
  const [confirmed, pending] = await Promise.all([
    prisma.campaignContribution.aggregate({
      where: { campaignId: id, status: 'CONFIRMED' },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.campaignContribution.aggregate({
      where: { campaignId: id, status: 'PENDING' },
      _sum: { amount: true },
      _count: true,
    }),
  ]);
  const funding = {
    confirmedAmount: Number(confirmed._sum.amount ?? 0),
    confirmedCount: confirmed._count,
    pendingAmount: Number(pending._sum.amount ?? 0),
    pendingCount: pending._count,
    budget: campaign.budget === null ? null : Number(campaign.budget),
    currency: campaign.currency,
  };
  return { campaign, funding };
}

// ── Platform reads ──────────────────────────────────────────────

async function adminList(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'campaign.read:platform');
  const f = query(ctx, orgCampaignListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.CampaignWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: 'insensitive' } },
      { slug: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      select: CAMPAIGN_DETAIL_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function adminDetail(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'campaign.read:platform');
  const { id } = pathParams(ctx, idParamsSchema);
  const campaign = await getPrisma().campaign.findUnique({
    where: { id },
    select: CAMPAIGN_DETAIL_SELECT,
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');
  return { campaign };
}

// ── Organization (tenant) side ──────────────────────────────────

async function orgList(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const f = query(ctx, orgCampaignListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.CampaignWhereInput = { organizationId: org.orgId };
  if (f.status) where.status = f.status;
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: 'insensitive' } },
      { slug: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where,
      select: CAMPAIGN_DETAIL_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function orgDetail(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const { id } = pathParams(ctx, idParamsSchema);
  const campaign = await getPrisma().campaign.findFirst({
    where: { id, organizationId: org.orgId },
    select: CAMPAIGN_DETAIL_SELECT,
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');
  return { campaign };
}

async function allocateCampaignSlug(name: string): Promise<string> {
  const base = slugify(name, 80);
  const rows = await getPrisma().campaign.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
    take: 100,
  });
  return uniqueSlug(base, new Set(rows.map((row) => row.slug)));
}

async function create(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'campaign.create');
  const input = await body(ctx, createCampaignSchema);
  const prisma = getPrisma();

  if (input.opportunityIds.length > 0) {
    const found = await prisma.opportunity.count({
      where: { id: { in: input.opportunityIds }, organizationId: org.orgId, deletedAt: null },
    });
    if (found !== input.opportunityIds.length) {
      throw AppError.validation('One or more opportunities do not belong to this organization.');
    }
  }

  const slug = await allocateCampaignSlug(input.name);
  try {
    const campaign = await prisma.$transaction(async (tx) => {
      const created = await tx.campaign.create({
        data: {
          organizationId: org.orgId,
          name: input.name,
          slug,
          description: input.description ?? null,
          goal: input.goal ?? null,
          startDate: input.startDate,
          endDate: input.endDate,
          status: 'DRAFT' as const,
          volunteerTarget: input.volunteerTarget ?? null,
          hourTarget: input.hourTarget ?? null,
          beneficiaryTarget: input.beneficiaryTarget ?? null,
          budget: input.budget ?? null,
          currency: input.currency,
          coverImage: input.coverImage ?? null,
        },
      });
      if (input.opportunityIds.length > 0) {
        await tx.opportunity.updateMany({
          where: { id: { in: input.opportunityIds }, organizationId: org.orgId, deletedAt: null },
          data: { campaignId: created.id },
        });
      }
      return created;
    });

    await audit({
      actorUserId: org.user.userId,
      organizationId: org.orgId,
      action: 'campaign.create',
      entityType: 'campaign',
      entityId: campaign.id,
      after: { slug: campaign.slug, status: campaign.status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { campaign };
  } catch (error) {
    if (isUniqueViolation(error))
      throw AppError.conflict('A campaign with this slug already exists.');
    if (isForeignKeyViolation(error))
      throw AppError.validation('One or more referenced records do not exist.');
    throw error;
  }
}

const SCALAR_UPDATE_KEYS = [
  'name',
  'description',
  'goal',
  'startDate',
  'endDate',
  'volunteerTarget',
  'hourTarget',
  'beneficiaryTarget',
  'budget',
  'currency',
  'coverImage',
] as const;

async function update(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'campaign.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, updateCampaignSchema);
  const prisma = getPrisma();

  if (input.startDate && input.endDate && input.endDate.getTime() < input.startDate.getTime()) {
    throw AppError.validation('endDate must not be before startDate.', [
      { path: 'endDate', code: 'invalid_order', message: 'endDate must not be before startDate.' },
    ]);
  }

  const existing = await prisma.campaign.findFirst({
    where: { id, organizationId: org.orgId },
    select: { id: true, name: true, status: true },
  });
  if (!existing) throw AppError.notFound('Campaign not found.');

  if (input.opportunityIds !== undefined && input.opportunityIds.length > 0) {
    const found = await prisma.opportunity.count({
      where: { id: { in: input.opportunityIds }, organizationId: org.orgId, deletedAt: null },
    });
    if (found !== input.opportunityIds.length) {
      throw AppError.validation('One or more opportunities do not belong to this organization.');
    }
  }

  const data: Record<string, unknown> = {};
  for (const key of SCALAR_UPDATE_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) data[key] = value;
  }
  // The slug is a stable public identifier: renaming never rewrites it.

  try {
    const campaign = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.campaign.update({ where: { id }, data: data as Prisma.CampaignUpdateInput });
      }
      if (input.opportunityIds !== undefined) {
        const nextIds = input.opportunityIds;
        await tx.opportunity.updateMany({
          where: { campaignId: id, organizationId: org.orgId, id: { notIn: nextIds } },
          data: { campaignId: null },
        });
        if (nextIds.length > 0) {
          await tx.opportunity.updateMany({
            where: { id: { in: nextIds }, organizationId: org.orgId, deletedAt: null },
            data: { campaignId: id },
          });
        }
      }
      return tx.campaign.findUnique({ where: { id }, select: CAMPAIGN_DETAIL_SELECT });
    });
    if (!campaign) throw AppError.notFound('Campaign not found.');

    await audit({
      actorUserId: org.user.userId,
      organizationId: org.orgId,
      action: 'campaign.update',
      entityType: 'campaign',
      entityId: id,
      before: { status: existing.status },
      after: {
        fields: [
          ...Object.keys(data),
          ...(input.opportunityIds !== undefined ? ['opportunityIds'] : []),
        ],
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { campaign };
  } catch (error) {
    if (isForeignKeyViolation(error))
      throw AppError.validation('One or more referenced records do not exist.');
    throw error;
  }
}

async function transition(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'campaign.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, campaignStatusActionSchema);
  const prisma = getPrisma();

  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId: org.orgId },
    select: { id: true, status: true },
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');

  if (input.action === 'CANCEL' && !input.reason?.trim()) {
    throw AppError.validation('A reason is required to cancel a campaign.', [
      { path: 'reason', code: 'required', message: 'Provide a reason.' },
    ]);
  }

  const target = ACTION_TARGET[input.action];
  assertTransition(CAMPAIGN_TRANSITIONS, campaign.status, target, 'campaign');

  const updated = await prisma.campaign.update({ where: { id }, data: { status: target } });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'campaign.transition',
    entityType: 'campaign',
    entityId: id,
    before: { status: campaign.status },
    after: { status: target, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { campaign: updated };
}

// ── Participation (organization roster + self join/leave) ───────

async function orgParticipants(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'application.read');
  const { id } = pathParams(ctx, idParamsSchema);
  const f = query(ctx, participantsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId: org.orgId },
    select: { id: true },
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');

  const where: Prisma.CampaignParticipantWhereInput = { campaignId: id };
  if (f.status) where.status = f.status;

  const [total, items] = await Promise.all([
    prisma.campaignParticipant.count({ where }),
    prisma.campaignParticipant.findMany({
      where,
      select: {
        id: true,
        status: true,
        hours: true,
        opportunityId: true,
        participationDate: true,
        createdAt: true,
        volunteerProfile: {
          select: {
            id: true,
            volunteerId: true,
            verificationStatus: true,
            user: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function join(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, joinCampaignSchema);
  const prisma = getPrisma();

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');
  if (campaign.status !== 'ACTIVE') {
    throw AppError.businessRule('You can only join an active campaign.');
  }

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      select: { campaignId: true, deletedAt: true },
    });
    if (!opportunity || opportunity.deletedAt) {
      throw AppError.validation('opportunityId does not exist.', [
        {
          path: 'opportunityId',
          code: 'not_found',
          message: 'Referenced opportunity does not exist.',
        },
      ]);
    }
    if (opportunity.campaignId !== campaign.id) {
      throw AppError.businessRule('That opportunity does not belong to this campaign.');
    }
  }

  const existing = await prisma.campaignParticipant.findFirst({
    where: { campaignId: id, volunteerProfileId: profile.id, status: { not: 'WITHDRAWN' } },
    select: { id: true },
  });
  if (existing) throw AppError.conflict('You have already joined this campaign.');

  try {
    const participant = await prisma.campaignParticipant.create({
      data: {
        campaignId: id,
        volunteerProfileId: profile.id,
        opportunityId: input.opportunityId ?? null,
        status: 'REGISTERED' as const,
        participationDate: new Date(),
      },
    });
    await audit({
      actorUserId: user.userId,
      action: 'campaign.join',
      entityType: 'campaign',
      entityId: id,
      after: { participantId: participant.id },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { participant };
  } catch (error) {
    if (isForeignKeyViolation(error))
      throw AppError.validation('One or more referenced records do not exist.');
    throw error;
  }
}

async function leave(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const participant = await prisma.campaignParticipant.findFirst({
    where: { campaignId: id, volunteerProfileId: profile.id, status: { not: 'WITHDRAWN' } },
    select: { id: true, status: true },
  });
  if (!participant) throw AppError.notFound('You are not a participant of this campaign.');

  const updated = await prisma.campaignParticipant.update({
    where: { id: participant.id },
    data: { status: 'WITHDRAWN' as ParticipationStatusLiteral },
  });
  await audit({
    actorUserId: user.userId,
    action: 'campaign.leave',
    entityType: 'campaign',
    entityId: id,
    before: { status: participant.status },
    after: { status: 'WITHDRAWN' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { participant: updated };
}

// ── Contributions (bank-transfer pledges recorded on the platform) ──
// The money moves bank → organization; BLADNA only records the pledge and
// tracks the organization's confirmation (spec §33). No payment gateway,
// no electronic money, no automatic refunds.

/** Record one donor's contribution — PENDING until the organization decides. */
async function createContribution(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createContributionSchema);
  const prisma = getPrisma();

  const campaign = await prisma.campaign.findFirst({
    where: { id, status: { in: PUBLIC_CAMPAIGN_STATUSES } },
    select: { id: true, status: true, currency: true },
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');
  // Contributions only while the campaign is running; finished campaigns stay
  // readable but never accept new pledges.
  if (campaign.status !== 'ACTIVE') {
    throw AppError.businessRule('Contributions are only accepted while the campaign is active.');
  }
  if (input.currency && input.currency.toUpperCase() !== campaign.currency.toUpperCase()) {
    throw AppError.validation('currency does not match the campaign currency.', [
      {
        path: 'currency',
        code: 'invalid',
        message: `The campaign currency is ${campaign.currency}.`,
      },
    ]);
  }

  try {
    const contribution = await prisma.campaignContribution.create({
      data: {
        campaignId: id,
        userId: user.userId,
        amount: input.amount,
        currency: campaign.currency,
        reference: input.reference?.trim() || null,
        note: input.note?.trim() || null,
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        reference: true,
        createdAt: true,
      },
    });
    await audit({
      actorUserId: user.userId,
      action: 'campaign.contribute',
      entityType: 'campaign_contribution',
      entityId: contribution.id,
      after: {
        campaignId: id,
        amount: input.amount,
        currency: campaign.currency,
        reference: contribution.reference,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return {
      contribution: { ...contribution, amount: Number(contribution.amount) },
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict(
        'A contribution with this transfer reference already exists for this campaign.',
      );
    }
    throw error;
  }
}

/** Donor-side withdrawal of their own still-PENDING contribution. */
async function cancelContribution(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id, cid } = pathParams(ctx, contributionParamsSchema);
  const prisma = getPrisma();

  const contribution = await prisma.campaignContribution.findFirst({
    where: { id: cid, campaignId: id, userId: user.userId },
    select: { id: true, status: true, amount: true, currency: true },
  });
  if (!contribution) throw AppError.notFound('Contribution not found.');
  if (contribution.status !== 'PENDING') {
    throw AppError.businessRule('Only a pending contribution can be cancelled.');
  }

  // The pledge never left PENDING, so removing it frees the transfer reference
  // for a corrected re-submission; the audit log keeps the full trail.
  await prisma.campaignContribution.delete({ where: { id: cid } });
  await audit({
    actorUserId: user.userId,
    action: 'campaign.contribution.cancel',
    entityType: 'campaign_contribution',
    entityId: cid,
    before: {
      campaignId: id,
      status: 'PENDING',
      amount: Number(contribution.amount),
      currency: contribution.currency,
    },
    after: null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { cancelled: true };
}

/** Organization-only contribution ledger — donor identity masked (spec §29). */
async function orgContributions(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.billing.manage');
  const { id } = pathParams(ctx, idParamsSchema);
  const f = query(ctx, contributionListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId: org.orgId },
    select: { id: true },
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');

  const where: Prisma.CampaignContributionWhereInput = { campaignId: id };
  if (f.status) where.status = f.status;

  const [total, items] = await Promise.all([
    prisma.campaignContribution.count({ where }),
    prisma.campaignContribution.findMany({
      where,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        reference: true,
        note: true,
        reason: true,
        decidedAt: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  // Donor identity is masked at the boundary (spec §29) — name + email only.
  return {
    items: items.map((contribution) => ({
      id: contribution.id,
      amount: Number(contribution.amount),
      currency: contribution.currency,
      status: contribution.status,
      reference: contribution.reference,
      note: contribution.note,
      reason: contribution.reason,
      decidedAt: contribution.decidedAt,
      createdAt: contribution.createdAt,
      donor: {
        id: contribution.user.id,
        name: maskName(contribution.user.firstName, contribution.user.lastName),
        email: maskEmail(contribution.user.email),
      },
    })),
    meta: buildPageMeta(total, { page, limit }),
  };
}

/** Confirm or reject one PENDING contribution (both transitions terminal). */
async function decideContribution(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.billing.manage');
  const { id, cid } = pathParams(ctx, contributionParamsSchema);
  const input = await body(ctx, contributionActionSchema);
  const prisma = getPrisma();

  const campaign = await prisma.campaign.findFirst({
    where: { id, organizationId: org.orgId },
    select: { id: true },
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');

  const contribution = await prisma.campaignContribution.findFirst({
    where: { id: cid, campaignId: id },
    select: { id: true, status: true },
  });
  if (!contribution) throw AppError.notFound('Contribution not found.');

  const target: ContributionStatusLiteral = input.action === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
  assertTransition(CONTRIBUTION_TRANSITIONS, contribution.status, target, 'contribution');

  const updated = await prisma.campaignContribution.update({
    where: { id: cid },
    data: {
      status: target,
      reason: input.reason?.trim() || null,
      decidedById: org.user.userId,
      decidedAt: new Date(),
    },
    select: { id: true, status: true, reason: true, decidedAt: true },
  });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'campaign.contribution.decide',
    entityType: 'campaign_contribution',
    entityId: cid,
    before: { status: contribution.status },
    after: { status: target, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { contribution: updated };
}

// ── Route table ─────────────────────────────────────────────────

export const campaignRoutes: AppRoute[] = [
  // public (DRAFT never visible)
  {
    method: 'GET',
    path: '/campaigns',
    handler: publicList,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List public campaigns (never DRAFT)',
  },
  {
    method: 'GET',
    path: '/campaigns/:id',
    handler: publicDetail,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Public campaign detail',
  },
  {
    method: 'POST',
    path: '/campaigns/:id/participants',
    handler: join,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Join a campaign as a volunteer',
  },
  {
    method: 'POST',
    path: '/campaigns/:id/participants/leave',
    handler: leave,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Withdraw from a campaign',
  },
  {
    method: 'POST',
    path: '/campaigns/:id/contributions',
    handler: createContribution,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Record a bank-transfer contribution (PENDING)',
  },
  {
    method: 'POST',
    path: '/campaigns/:id/contributions/:cid/cancel',
    handler: cancelContribution,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Cancel your own pending contribution',
  },
  // platform
  {
    method: 'GET',
    path: '/admin/campaigns',
    handler: adminList,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform campaign list (all statuses)',
  },
  {
    method: 'GET',
    path: '/admin/campaigns/:id',
    handler: adminDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform campaign detail',
  },
  // organization
  {
    method: 'GET',
    path: '/orgs/:orgId/campaigns',
    handler: orgList,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "List the organization's campaigns",
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/campaigns',
    handler: create,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Create a campaign (DRAFT)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/campaigns/:id',
    handler: orgDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Campaign detail (org view)',
  },
  {
    method: 'PATCH',
    path: '/orgs/:orgId/campaigns/:id',
    handler: update,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Update a campaign',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/campaigns/:id/transition',
    handler: transition,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Status transition (state machine)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/campaigns/:id/participants',
    handler: orgParticipants,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Campaign participant roster (org only)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/campaigns/:id/contributions',
    handler: orgContributions,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Campaign contribution ledger (org only, donors masked)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/campaigns/:id/contributions/:cid',
    handler: decideContribution,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Confirm or reject a pending contribution',
  },
];
