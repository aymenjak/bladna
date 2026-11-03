// Sponsors module (spec §64–§67).
//
// Sponsors are created by the platform (`POST /admin/sponsors`) or
// self-registered (`POST /sponsors`); both land `PENDING` because only the
// platform can move a sponsor to ACTIVE (SPONSOR_TRANSITIONS). Self-registrants
// are seated as SPONSOR_ADMIN of their own workspace. Workspaces run through
// `:sponsorId` paths guarded by SPONSOR_ROLE_PERMISSIONS, and fund campaigns or
// CSR programs through Sponsorship rows that only move through the
// SPONSORSHIP_TRANSITIONS state machine. Sponsor status changes: the workspace
// may only archive/restore, while ACTIVATE/SUSPEND are platform decisions.

import { getPrisma, type Prisma } from '@bladna/database';
import { assertTransition, hasSystemPermission, type TransitionMap } from '@bladna/domain';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams, slugify, uniqueSlug } from '@bladna/utils';
import {
  createSponsorSchema,
  createSponsorshipSchema,
  idParamsSchema,
  inviteSponsorMemberSchema,
  paginationQuerySchema,
  registerSponsorSchema,
  sponsorshipActionSchema,
  sponsorFiltersSchema,
  sponsorStatusActionSchema,
  updateSponsorSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { env } from '../env';
import {
  getSessionUser,
  requireAuth,
  requireOrgMembership,
  requireSponsorPermission,
  requireSystemPermission,
  requireVerifiedEmail,
} from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

type SponsorStatusLiteral = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

/** Sponsor lifecycle (spec §107). PENDING is platform-approved; ARCHIVED keeps history. */
export const SPONSOR_TRANSITIONS: TransitionMap<SponsorStatusLiteral> = {
  PENDING: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
};

type SponsorshipStatusLiteral = 'PROPOSED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

/** Sponsorship lifecycle: a proposal is activated, completed or cancelled. */
export const SPONSORSHIP_TRANSITIONS: TransitionMap<SponsorshipStatusLiteral> = {
  PROPOSED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

type SponsorAction = z.infer<typeof sponsorStatusActionSchema>['action'];

const SPONSOR_ACTION_TARGET: Record<SponsorAction, SponsorStatusLiteral> = {
  ACTIVATE: 'ACTIVE',
  SUSPEND: 'SUSPENDED',
  ARCHIVE: 'ARCHIVED',
  RESTORE: 'ACTIVE',
};

type SponsorshipAction = z.infer<typeof sponsorshipActionSchema>['action'];

const SPONSORSHIP_ACTION_TARGET: Record<SponsorshipAction, SponsorshipStatusLiteral> = {
  ACTIVATE: 'ACTIVE',
  COMPLETE: 'COMPLETED',
  CANCEL: 'CANCELLED',
};

const sponsorParamsSchema = z.object({ sponsorId: z.string().uuid() });
const memberParamsSchema = z.object({ sponsorId: z.string().uuid(), memberId: z.string().uuid() });
const sponsorshipParamsSchema = z.object({ sponsorId: z.string().uuid(), id: z.string().uuid() });

const publicSponsorListSchema = sponsorFiltersSchema;

const sponsorshipListSchema = paginationQuerySchema.extend({
  status: z.enum(['PROPOSED', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
});

const SPONSOR_PUBLIC_SELECT = {
  id: true,
  commercialName: true,
  slug: true,
  logo: true,
  description: true,
  website: true,
  industry: true,
  status: true,
  createdAt: true,
} as const satisfies Prisma.SponsorSelect;

const SPONSOR_WORKSPACE_SELECT = {
  ...SPONSOR_PUBLIC_SELECT,
  legalName: true,
  contactEmail: true,
  contactPhone: true,
  verificationStatus: true,
  updatedAt: true,
} as const satisfies Prisma.SponsorSelect;

const MEMBER_SELECT = {
  id: true,
  role: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profileImage: true,
      status: true,
    },
  },
} as const satisfies Prisma.SponsorMemberSelect;

const SPONSORSHIP_SELECT = {
  id: true,
  sponsorId: true,
  campaignId: true,
  csrProgramId: true,
  amount: true,
  currency: true,
  kind: true,
  description: true,
  status: true,
  startDate: true,
  endDate: true,
  createdAt: true,
  updatedAt: true,
  campaign: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      organization: { select: { id: true, name: true, slug: true } },
    },
  },
  csrProgram: { select: { id: true, title: true, status: true } },
} as const satisfies Prisma.SponsorshipSelect;

/** Fetch the sponsor behind a workspace path (404 before any mutation). */
async function loadWorkspaceSponsor(sponsorId: string) {
  const sponsor = await getPrisma().sponsor.findFirst({
    where: { id: sponsorId, deletedAt: null },
    select: { id: true, status: true, slug: true, commercialName: true },
  });
  if (!sponsor) throw AppError.notFound('Sponsor not found.');
  return sponsor;
}

// ── Public surface (ACTIVE sponsors only) ──────────────────────

async function publicList(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, publicSponsorListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SponsorWhereInput = { deletedAt: null };
  // An explicit non-ACTIVE filter yields an empty page instead of confirming
  // sponsors that are not published yet.
  where.status = !f.status || f.status === 'ACTIVE' ? 'ACTIVE' : { in: [] };
  if (f.q) {
    where.OR = [
      { commercialName: { contains: f.q, mode: 'insensitive' } },
      { legalName: { contains: f.q, mode: 'insensitive' } },
      { description: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.sponsor.count({ where }),
    prisma.sponsor.findMany({
      where,
      select: SPONSOR_PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** Dual-mode detail: workspace members/platform see every status, the public only ACTIVE. */
async function detail(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  const prisma = getPrisma();
  const user = await getSessionUser(ctx);

  if (user) {
    const isPlatform = hasSystemPermission(user.roles, 'sponsor.read:platform');
    const membership = isPlatform
      ? null
      : await prisma.sponsorMember.findUnique({
          where: { sponsorId_userId: { sponsorId, userId: user.userId } },
          select: { id: true },
        });
    if (isPlatform || membership) {
      const sponsor = await prisma.sponsor.findFirst({
        where: { id: sponsorId, deletedAt: null },
        select: SPONSOR_WORKSPACE_SELECT,
      });
      if (!sponsor) throw AppError.notFound('Sponsor not found.');
      return { sponsor, access: 'workspace' };
    }
  }

  const sponsor = await prisma.sponsor.findFirst({
    where: { id: sponsorId, status: 'ACTIVE', deletedAt: null },
    select: SPONSOR_PUBLIC_SELECT,
  });
  if (!sponsor) throw AppError.notFound('Sponsor not found.');
  return { sponsor, access: 'public' };
}

// ── Sponsor workspace ──────────────────────────────────────────

async function workspaceUpdate(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'sponsor.manage');
  const input = await body(ctx, updateSponsorSchema);
  const sponsor = await loadWorkspaceSponsor(sponsorId);

  const data: Prisma.SponsorUpdateInput = {};
  if (input.legalName !== undefined) data.legalName = input.legalName;
  if (input.commercialName !== undefined) data.commercialName = input.commercialName;
  if (input.description !== undefined) data.description = input.description;
  if (input.website !== undefined) data.website = input.website;
  if (input.industry !== undefined) data.industry = input.industry;
  if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;
  if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;

  const updated = await getPrisma().sponsor.update({ where: { id: sponsorId }, data });
  await audit({
    actorUserId: user.userId,
    action: 'sponsor.update',
    entityType: 'sponsor',
    entityId: sponsor.id,
    after: { fields: Object.keys(data) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { sponsor: updated };
}

async function workspaceStatus(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'sponsor.manage');
  const input = await body(ctx, sponsorStatusActionSchema);
  const sponsor = await loadWorkspaceSponsor(sponsorId);

  // Activation/suspension are platform decisions — the workspace may only
  // archive itself and restore an archived profile.
  if (input.action === 'ACTIVATE' || input.action === 'SUSPEND') {
    throw AppError.forbidden(
      'Platform approval is required for this change — use POST /admin/sponsors/:id/status.',
    );
  }

  const target = SPONSOR_ACTION_TARGET[input.action];
  assertTransition(SPONSOR_TRANSITIONS, sponsor.status, target, 'sponsor');

  const updated = await getPrisma().sponsor.update({
    where: { id: sponsorId },
    data: { status: target },
  });
  await audit({
    actorUserId: user.userId,
    action: 'sponsor.status',
    entityType: 'sponsor',
    entityId: sponsorId,
    before: { status: sponsor.status },
    after: { status: target, reason: input.reason ?? null, surface: 'workspace' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { sponsor: updated };
}

async function listMembers(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  await requireSponsorPermission(ctx, 'sponsor.manage');
  await loadWorkspaceSponsor(sponsorId);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });

  const [total, items] = await Promise.all([
    getPrisma().sponsorMember.count({ where: { sponsorId } }),
    getPrisma().sponsorMember.findMany({
      where: { sponsorId },
      select: MEMBER_SELECT,
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function addMember(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'sponsor.manage');
  const input = await body(ctx, inviteSponsorMemberSchema);
  await loadWorkspaceSponsor(sponsorId);
  const prisma = getPrisma();

  // Invite-by-email is not wired in this build: only accounts that already
  // exist on the platform can be added to a sponsor workspace.
  const target = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, firstName: true, lastName: true, email: true, deletedAt: true },
  });
  if (!target || target.deletedAt) {
    throw AppError.businessRule(
      'No active account uses this email address. Ask them to register first, then add them.',
    );
  }

  const existing = await prisma.sponsorMember.findUnique({
    where: { sponsorId_userId: { sponsorId, userId: target.id } },
    select: { id: true },
  });
  if (existing) throw AppError.conflict('This user is already a member of the sponsor workspace.');

  try {
    const member = await prisma.sponsorMember.create({
      data: { sponsorId, userId: target.id, role: input.role },
      select: MEMBER_SELECT,
    });
    await audit({
      actorUserId: user.userId,
      action: 'sponsor.member_add',
      entityType: 'sponsor',
      entityId: sponsorId,
      after: { userId: target.id, role: input.role },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { member };
  } catch (error) {
    if (isUniqueViolation(error))
      throw AppError.conflict('This user is already a member of the sponsor workspace.');
    throw error;
  }
}

async function removeMember(ctx: RequestContext): Promise<unknown> {
  const { sponsorId, memberId } = pathParams(ctx, memberParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'sponsor.manage');
  await loadWorkspaceSponsor(sponsorId);
  const prisma = getPrisma();

  const member = await prisma.sponsorMember.findFirst({
    where: { id: memberId, sponsorId },
    select: { id: true, userId: true, role: true },
  });
  if (!member) throw AppError.notFound('Sponsor member not found.');

  if (member.role === 'SPONSOR_ADMIN') {
    const admins = await prisma.sponsorMember.count({
      where: { sponsorId, role: 'SPONSOR_ADMIN' },
    });
    if (admins <= 1) {
      throw AppError.businessRule(
        'The last administrator cannot be removed — promote another member first.',
      );
    }
  }

  await prisma.sponsorMember.delete({ where: { id: memberId } });
  await audit({
    actorUserId: user.userId,
    action: 'sponsor.member_remove',
    entityType: 'sponsor',
    entityId: sponsorId,
    before: { userId: member.userId, role: member.role },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { removed: true };
}

// ── Sponsorships ───────────────────────────────────────────────

async function listSponsorships(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  await requireSponsorPermission(ctx, 'sponsor.read');
  await loadWorkspaceSponsor(sponsorId);
  const f = query(ctx, sponsorshipListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SponsorshipWhereInput = { sponsorId };
  if (f.status) where.status = f.status;

  const [total, items] = await Promise.all([
    prisma.sponsorship.count({ where }),
    prisma.sponsorship.findMany({
      where,
      select: SPONSORSHIP_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function createSponsorship(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'sponsorship.create');
  const input = await body(ctx, createSponsorshipSchema);
  await loadWorkspaceSponsor(sponsorId);
  const prisma = getPrisma();

  if (input.campaignId && input.csrProgramId) {
    throw AppError.validation('A sponsorship targets exactly one campaign or CSR program.', [
      {
        path: 'csrProgramId',
        code: 'exclusive',
        message: 'Provide campaignId or csrProgramId, not both.',
      },
    ]);
  }
  if (input.campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: input.campaignId },
      select: { id: true, name: true, organization: { select: { id: true } } },
    });
    if (!campaign) {
      throw AppError.validation('campaignId does not exist.', [
        { path: 'campaignId', code: 'not_found', message: 'Referenced campaign does not exist.' },
      ]);
    }
  }
  if (input.csrProgramId) {
    const program = await prisma.cSRProgram.findFirst({
      where: { id: input.csrProgramId, sponsorId },
      select: { id: true },
    });
    if (!program) throw AppError.notFound('CSR program not found in this sponsor workspace.');
  }

  try {
    const sponsorship = await prisma.sponsorship.create({
      data: {
        sponsorId,
        campaignId: input.campaignId ?? null,
        csrProgramId: input.csrProgramId ?? null,
        amount: input.amount,
        currency: input.currency,
        kind: input.kind,
        description: input.description?.trim() || null,
        status: 'PROPOSED' as const,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
      },
      select: SPONSORSHIP_SELECT,
    });
    await audit({
      actorUserId: user.userId,
      action: 'sponsorship.create',
      entityType: 'sponsorship',
      entityId: sponsorship.id,
      after: {
        sponsorId,
        campaignId: input.campaignId ?? null,
        csrProgramId: input.csrProgramId ?? null,
        amount: input.amount,
        kind: input.kind,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { sponsorship };
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('This sponsorship already exists.');
    throw error;
  }
}

async function transitionSponsorship(ctx: RequestContext): Promise<unknown> {
  const { sponsorId, id } = pathParams(ctx, sponsorshipParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'sponsorship.manage');
  const input = await body(ctx, sponsorshipActionSchema);
  await loadWorkspaceSponsor(sponsorId);
  const prisma = getPrisma();

  const sponsorship = await prisma.sponsorship.findFirst({
    where: { id, sponsorId },
    select: { id: true, status: true },
  });
  if (!sponsorship) throw AppError.notFound('Sponsorship not found.');

  const target = SPONSORSHIP_ACTION_TARGET[input.action];
  assertTransition(SPONSORSHIP_TRANSITIONS, sponsorship.status, target, 'sponsorship');

  const updated = await prisma.sponsorship.update({ where: { id }, data: { status: target } });
  await audit({
    actorUserId: user.userId,
    action: 'sponsorship.transition',
    entityType: 'sponsorship',
    entityId: id,
    before: { status: sponsorship.status },
    after: { status: target, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { sponsorship: updated };
}

/** Sponsorships proposed against this organization's campaigns (org view). */
async function orgSponsorships(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const f = query(ctx, sponsorshipListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SponsorshipWhereInput = { campaign: { organizationId: org.orgId } };
  if (f.status) where.status = f.status;
  const [total, items] = await Promise.all([
    prisma.sponsorship.count({ where }),
    prisma.sponsorship.findMany({
      where,
      select: SPONSORSHIP_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Platform surface ───────────────────────────────────────────

async function adminList(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'sponsor.read:platform');
  const f = query(ctx, sponsorFiltersSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SponsorWhereInput = { deletedAt: null };
  if (f.status) where.status = f.status;
  if (f.q) {
    where.OR = [
      { commercialName: { contains: f.q, mode: 'insensitive' } },
      { legalName: { contains: f.q, mode: 'insensitive' } },
      { slug: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.sponsor.count({ where }),
    prisma.sponsor.findMany({
      where,
      select: SPONSOR_WORKSPACE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function adminDetail(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'sponsor.read:platform');
  const { id } = pathParams(ctx, idParamsSchema);
  const sponsor = await getPrisma().sponsor.findFirst({
    where: { id, deletedAt: null },
    select: SPONSOR_WORKSPACE_SELECT,
  });
  if (!sponsor) throw AppError.notFound('Sponsor not found.');
  return { sponsor };
}

async function allocateSponsorSlug(commercialName: string): Promise<string> {
  const base = slugify(commercialName, 80) || 'sponsor';
  const rows = await getPrisma().sponsor.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
    take: 100,
  });
  return uniqueSlug(base, new Set(rows.map((row) => row.slug)));
}

async function adminCreate(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'sponsor.manage');
  const input = await body(ctx, createSponsorSchema);
  const slug = await allocateSponsorSlug(input.commercialName);

  try {
    const sponsor = await getPrisma().sponsor.create({
      data: {
        legalName: input.legalName,
        commercialName: input.commercialName,
        slug,
        description: input.description ?? null,
        website: input.website ?? null,
        industry: input.industry ?? null,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone ?? null,
        status: 'PENDING' as const,
      },
      select: SPONSOR_WORKSPACE_SELECT,
    });
    await audit({
      actorUserId: user.userId,
      action: 'sponsor.create',
      entityType: 'sponsor',
      entityId: sponsor.id,
      after: { slug: sponsor.slug, status: sponsor.status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { sponsor };
  } catch (error) {
    if (isUniqueViolation(error))
      throw AppError.conflict('A sponsor with this slug already exists.');
    throw error;
  }
}

async function adminUpdate(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'sponsor.manage');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, updateSponsorSchema);
  const prisma = getPrisma();

  const existing = await prisma.sponsor.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!existing) throw AppError.notFound('Sponsor not found.');

  const data: Prisma.SponsorUpdateInput = {};
  if (input.legalName !== undefined) data.legalName = input.legalName;
  if (input.commercialName !== undefined) data.commercialName = input.commercialName;
  if (input.description !== undefined) data.description = input.description;
  if (input.website !== undefined) data.website = input.website;
  if (input.industry !== undefined) data.industry = input.industry;
  if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;
  if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;

  const sponsor = await prisma.sponsor.update({ where: { id }, data });
  await audit({
    actorUserId: user.userId,
    action: 'sponsor.update',
    entityType: 'sponsor',
    entityId: id,
    after: { fields: Object.keys(data) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { sponsor };
}

async function adminStatus(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'sponsor.manage');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, sponsorStatusActionSchema);
  const prisma = getPrisma();

  const sponsor = await prisma.sponsor.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!sponsor) throw AppError.notFound('Sponsor not found.');

  if (input.action === 'SUSPEND' && !input.reason?.trim()) {
    throw AppError.validation('A reason is required to suspend a sponsor.', [
      { path: 'reason', code: 'required', message: 'Provide a reason.' },
    ]);
  }

  const target = SPONSOR_ACTION_TARGET[input.action];
  assertTransition(SPONSOR_TRANSITIONS, sponsor.status, target, 'sponsor');

  const updated = await prisma.sponsor.update({ where: { id }, data: { status: target } });
  await audit({
    actorUserId: user.userId,
    action: 'sponsor.status',
    entityType: 'sponsor',
    entityId: id,
    before: { status: sponsor.status },
    after: { status: target, reason: input.reason ?? null, surface: 'platform' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { sponsor: updated };
}

// ── Self-registration (spec §64, §54) ───────────────────────────

/**
 * Sponsor self-registration: creates the sponsor `PENDING` (the platform still
 * decides ACTIVATE per SPONSOR_TRANSITIONS — funding routes never bypass that),
 * seats the registrant as SPONSOR_ADMIN of the new workspace, and records the
 * §54 consents. Requires a confirmed email.
 */
async function selfRegister(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  requireVerifiedEmail(user);
  const input = await body(ctx, registerSponsorSchema);
  const slug = await allocateSponsorSlug(input.commercialName);
  const prisma = getPrisma();

  try {
    const sponsor = await prisma.$transaction(async (tx) => {
      const created = await tx.sponsor.create({
        data: {
          legalName: input.legalName,
          commercialName: input.commercialName,
          slug,
          description: input.description ?? null,
          website: input.website ?? null,
          industry: input.industry ?? null,
          contactEmail: input.contactEmail,
          contactPhone: input.contactPhone ?? null,
          status: 'PENDING',
          verificationStatus: 'PENDING',
        },
        select: SPONSOR_WORKSPACE_SELECT,
      });

      // The registrant administers their own workspace from the first write.
      await tx.sponsorMember.create({
        data: { sponsorId: created.id, userId: user.userId, role: 'SPONSOR_ADMIN' },
      });

      await tx.privacyConsent.createMany({
        data: input.consents.map((purpose) => ({
          userId: user.userId,
          purpose,
          policyVersion: env.policyVersion,
          ipAddress: ctx.ip === 'local' ? null : ctx.ip,
        })),
      });

      return created;
    });

    await audit({
      actorUserId: user.userId,
      action: 'sponsor.create',
      entityType: 'sponsor',
      entityId: sponsor.id,
      after: {
        slug: sponsor.slug,
        status: sponsor.status,
        memberRole: 'SPONSOR_ADMIN',
        consents: input.consents,
      },
      metadata: { source: 'self_registration' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return { sponsor };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('A sponsor with this slug already exists.');
    }
    throw error;
  }
}

// ── Route table ─────────────────────────────────────────────────

export const sponsorRoutes: AppRoute[] = [
  // public (ACTIVE only)
  {
    method: 'GET',
    path: '/sponsors',
    handler: publicList,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List active sponsors (paginated)',
  },
  {
    method: 'POST',
    path: '/sponsors',
    handler: selfRegister,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary:
      'Self-register a sponsor (PENDING until platform activation; registrant = SPONSOR_ADMIN)',
  },
  // workspace
  {
    method: 'GET',
    path: '/sponsors/:sponsorId',
    handler: detail,
    options: { rateLimit: 'public' },
    auth: 'sponsor',
    summary: 'Sponsor detail (dual-mode: workspace or public)',
  },
  {
    method: 'PATCH',
    path: '/sponsors/:sponsorId',
    handler: workspaceUpdate,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'Update sponsor profile (workspace)',
  },
  {
    method: 'POST',
    path: '/sponsors/:sponsorId/status',
    handler: workspaceStatus,
    options: { rateLimit: 'auth' },
    auth: 'sponsor',
    summary: 'Archive/restore own sponsor (state machine)',
  },
  {
    method: 'GET',
    path: '/sponsors/:sponsorId/members',
    handler: listMembers,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'List sponsor workspace members (paginated)',
  },
  {
    method: 'POST',
    path: '/sponsors/:sponsorId/members',
    handler: addMember,
    options: { rateLimit: 'auth' },
    auth: 'sponsor',
    summary: 'Add an existing user to the workspace',
  },
  {
    method: 'DELETE',
    path: '/sponsors/:sponsorId/members/:memberId',
    handler: removeMember,
    options: { rateLimit: 'auth' },
    auth: 'sponsor',
    summary: 'Remove a workspace member',
  },
  {
    method: 'GET',
    path: '/sponsors/:sponsorId/sponsorships',
    handler: listSponsorships,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'List sponsorships (paginated)',
  },
  {
    method: 'POST',
    path: '/sponsors/:sponsorId/sponsorships',
    handler: createSponsorship,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'Propose a sponsorship (PROPOSED)',
  },
  {
    method: 'POST',
    path: '/sponsors/:sponsorId/sponsorships/:id/transition',
    handler: transitionSponsorship,
    options: { rateLimit: 'auth' },
    auth: 'sponsor',
    summary: 'Sponsorship status transition (state machine)',
  },
  // organization view
  {
    method: 'GET',
    path: '/orgs/:orgId/sponsorships',
    handler: orgSponsorships,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Sponsorships targeting this organization’s campaigns',
  },
  // platform
  {
    method: 'GET',
    path: '/admin/sponsors',
    handler: adminList,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform sponsor list (all statuses, paginated)',
  },
  {
    method: 'POST',
    path: '/admin/sponsors',
    handler: adminCreate,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Create a sponsor (PENDING)',
  },
  {
    method: 'GET',
    path: '/admin/sponsors/:id',
    handler: adminDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform sponsor detail',
  },
  {
    method: 'PATCH',
    path: '/admin/sponsors/:id',
    handler: adminUpdate,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Update a sponsor (platform)',
  },
  {
    method: 'POST',
    path: '/admin/sponsors/:id/status',
    handler: adminStatus,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Sponsor status transition (state machine)',
  },
];
