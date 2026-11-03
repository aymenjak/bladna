// Partnership lifecycle (P34 — design §5/§7): requests, versioned proposals,
// partnerships, per-party obligations and numbered agreements. Every status
// change goes through @bladna/domain's state machines; every mutation lands
// an AuditLog row (notification fan-out wires up in M4). Access is two-sided —
// see lib/partnership-access for how the actor's side is resolved.

import { getPrisma, type Prisma } from '@bladna/database';
import {
  AGREEMENT_TRANSITIONS,
  OBLIGATION_TRANSITIONS,
  PARTNERSHIP_PROPOSAL_TRANSITIONS,
  PARTNERSHIP_REQUEST_TRANSITIONS,
  PARTNERSHIP_TRANSITIONS,
  assertTransition,
} from '@bladna/domain';
import { AppError } from '@bladna/types';
import type { ObligationParty, PartnershipProposalStatus, SupportNeedKind } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  agreementTransitionSchema,
  createAgreementSchema,
  createObligationSchema,
  createPartnershipRequestSchema,
  createPartnershipSchema,
  createProposalSchema,
  idParamsSchema,
  obligationTransitionSchema,
  partnershipListQuerySchema,
  partnershipRequestListQuerySchema,
  partnershipRequestTransitionSchema,
  partnershipProposalTransitionSchema,
  partnershipTransitionSchema,
  updateObligationSchema,
} from '@bladna/validation';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireAuth, requireOrgMembership } from '../guards';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prisma-errors';
import {
  loadPartnership,
  partnershipSides,
  requireScopedActor,
  sideScopes,
  type PartnershipScope,
} from '../lib/partnership-access';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

const REQUEST_LIVE_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'REQUEST_INFO',
  'SHORTLISTED',
  'NEGOTIATION',
] as const;

/** Targets the requester (the initiator) performs; everything else is the receiver's review. */
const REQUESTER_TARGETS = new Set(['SUBMITTED', 'CANCELLED']);

/** A proposal can only be revised while the conversation is still live. */
const PROPOSAL_TERMINAL = ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED'] as const;

const PROPOSAL_AUDIT: Record<PartnershipProposalStatus, string> = {
  DRAFT: 'PROPOSAL_TRANSITIONED', // no inbound edge — unreachable
  SUBMITTED: 'PROPOSAL_SUBMITTED',
  UNDER_REVIEW: 'PROPOSAL_REVIEW_OPENED',
  ACCEPTED: 'PROPOSAL_ACCEPTED',
  REJECTED: 'PROPOSAL_REJECTED',
  WITHDRAWN: 'PROPOSAL_WITHDRAWN',
  SUPERSEDED: 'PROPOSAL_SUPERSEDED',
};

/** Primary ask → partnership flavor (design §4: partnershipType derives from the proposal). */
const TYPE_BY_SUPPORT: Partial<Record<SupportNeedKind, 'SPONSORSHIP' | 'SERVICE' | 'IN_KIND'>> = {
  FINANCIAL: 'SPONSORSHIP',
  SERVICE: 'SERVICE',
  EQUIPMENT: 'IN_KIND',
  MATERIAL: 'IN_KIND',
};

interface RequestSides {
  requesterOrganizationId: string;
  receiverOrganizationId: string;
}

/**
 * Which side of the partnership each request party becomes (acceptance-time):
 * the initiative anchor wins when the request cites an opportunity; otherwise
 * the side holding an activated economic profile is the economic institution;
 * with both or neither profiled, the asker is the initiative side. Fully
 * deterministic — never inferred from names or heuristics.
 */
async function resolvePartnershipSides(
  request: RequestSides & { opportunityId: string | null },
): Promise<{ organizationId: string; economicOrganizationId: string }> {
  const prisma = getPrisma();
  if (request.opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: request.opportunityId },
      select: { organizationId: true },
    });
    if (opportunity && opportunity.organizationId !== request.requesterOrganizationId) {
      return {
        organizationId: opportunity.organizationId,
        economicOrganizationId: request.requesterOrganizationId,
      };
    }
    if (opportunity) {
      return {
        organizationId: opportunity.organizationId,
        economicOrganizationId: request.receiverOrganizationId,
      };
    }
  }
  const [requesterProfile, receiverProfile] = await Promise.all([
    prisma.economicInstitutionProfile.findUnique({
      where: { organizationId: request.requesterOrganizationId },
      select: { id: true },
    }),
    prisma.economicInstitutionProfile.findUnique({
      where: { organizationId: request.receiverOrganizationId },
      select: { id: true },
    }),
  ]);
  if (requesterProfile && !receiverProfile) {
    return {
      organizationId: request.receiverOrganizationId,
      economicOrganizationId: request.requesterOrganizationId,
    };
  }
  if (receiverProfile && !requesterProfile) {
    return {
      organizationId: request.requesterOrganizationId,
      economicOrganizationId: request.receiverOrganizationId,
    };
  }
  return {
    organizationId: request.requesterOrganizationId,
    economicOrganizationId: request.receiverOrganizationId,
  };
}

/** Light row + its request for scoped transition handlers. */
async function loadRequestRow(id: string) {
  const request = await getPrisma().partnershipRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      opportunityId: true,
      csrProgramId: true,
      requesterOrganizationId: true,
      receiverOrganizationId: true,
    },
  });
  if (!request) throw AppError.notFound('Partnership request not found.');
  return request;
}

async function loadProposalRow(id: string) {
  const proposal = await getPrisma().partnershipProposal.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      version: true,
      title: true,
      currency: true,
      supportType: true,
      requestedAmount: true,
      startDate: true,
      endDate: true,
      partnershipRequestId: true,
      partnershipRequest: {
        select: {
          id: true,
          status: true,
          opportunityId: true,
          csrProgramId: true,
          requesterOrganizationId: true,
          receiverOrganizationId: true,
        },
      },
    },
  });
  if (!proposal) throw AppError.notFound('Partnership proposal not found.');
  return proposal;
}

// ── Requests ──────────────────────────────────────────────────────

/**
 * Either party may open a conversation (design §7). Creation lands SUBMITTED
 * (house precedent: sponsorships land PROPOSED) so it enters the receiver's
 * queue immediately; DRAFT stays in the machine for compose-later UIs.
 */
async function createPartnershipRequest(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, createPartnershipRequestSchema);
  const org = await requireOrgMembership(ctx, 'partnership.request.create', {
    orgId: input.requesterOrganizationId,
  });
  const prisma = getPrisma();

  const receiver = await prisma.organization.findUnique({
    where: { id: input.receiverOrganizationId },
    select: { id: true, deletedAt: true },
  });
  if (!receiver || receiver.deletedAt) throw AppError.notFound('Receiver organization not found.');

  if (input.opportunityId) {
    const exists = await prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      select: { id: true },
    });
    if (!exists) throw AppError.validation('The referenced opportunity does not exist.');
  }
  if (input.supportNeedId) {
    const exists = await prisma.supportNeed.findUnique({
      where: { id: input.supportNeedId },
      select: { id: true },
    });
    if (!exists) throw AppError.validation('The referenced support need does not exist.');
  }
  if (input.csrProgramId) {
    const exists = await prisma.cSRProgram.findUnique({
      where: { id: input.csrProgramId },
      select: { id: true },
    });
    if (!exists) throw AppError.validation('The referenced CSR program does not exist.');
  }

  const now = new Date();
  const request = await prisma.partnershipRequest.create({
    data: {
      requesterOrganizationId: org.orgId,
      receiverOrganizationId: input.receiverOrganizationId,
      opportunityId: input.opportunityId,
      supportNeedId: input.supportNeedId,
      csrProgramId: input.csrProgramId,
      requestedAmount: input.requestedAmount,
      currency: input.currency,
      message: input.message,
      status: 'SUBMITTED',
      submittedAt: now,
      // Waiting deadline for the receiver's review (EXPIRED via cron, M4+).
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    },
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'PARTNERSHIP_REQUEST_CREATED',
    entityType: 'partnershipRequest',
    entityId: request.id,
    after: {
      status: request.status,
      receiverOrganizationId: request.receiverOrganizationId,
      requestedAmount: request.requestedAmount == null ? null : Number(request.requestedAmount),
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { request };
}

/** Every request touching any organization the caller is an active member of. */
async function listMyPartnershipRequests(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, partnershipRequestListQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.userId, status: 'ACTIVE' },
    select: { organizationId: true },
  });
  const orgIds = memberships.map((membership) => membership.organizationId);
  const sideClause: Prisma.PartnershipRequestWhereInput =
    f.side === 'requester'
      ? { requesterOrganizationId: { in: orgIds } }
      : f.side === 'receiver'
        ? { receiverOrganizationId: { in: orgIds } }
        : {
            OR: [
              { requesterOrganizationId: { in: orgIds } },
              { receiverOrganizationId: { in: orgIds } },
            ],
          };
  const where: Prisma.PartnershipRequestWhereInput = {
    ...sideClause,
    ...(f.status ? { status: f.status } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.partnershipRequest.count({ where }),
    prisma.partnershipRequest.findMany({
      where,
      include: {
        requesterOrganization: { select: { id: true, name: true, slug: true } },
        receiverOrganization: { select: { id: true, name: true, slug: true } },
        opportunity: {
          select: {
            id: true,
            slug: true,
            titleAr: true,
            titleFr: true,
            titleEn: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** One organization's inbox/outbox (org members). */
async function listOrgPartnershipRequests(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const f = query(ctx, partnershipRequestListQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const sideClause: Prisma.PartnershipRequestWhereInput =
    f.side === 'requester'
      ? { requesterOrganizationId: org.orgId }
      : f.side === 'receiver'
        ? { receiverOrganizationId: org.orgId }
        : {
            OR: [{ requesterOrganizationId: org.orgId }, { receiverOrganizationId: org.orgId }],
          };
  const where: Prisma.PartnershipRequestWhereInput = {
    ...sideClause,
    ...(f.status ? { status: f.status } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.partnershipRequest.count({ where }),
    prisma.partnershipRequest.findMany({
      where,
      include: {
        requesterOrganization: { select: { id: true, name: true, slug: true } },
        receiverOrganization: { select: { id: true, name: true, slug: true } },
        opportunity: {
          select: {
            id: true,
            slug: true,
            titleAr: true,
            titleFr: true,
            titleEn: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** State-machine transition: requester submits/cancels, receiver reviews. */
async function transitionPartnershipRequest(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, partnershipRequestTransitionSchema);
  const request = await loadRequestRow(id);

  const requesterSide = REQUESTER_TARGETS.has(input.action);
  const scope: PartnershipScope = requesterSide
    ? {
        orgId: request.requesterOrganizationId,
        permission: 'partnership.request.create',
        side: 'requester',
      }
    : {
        orgId: request.receiverOrganizationId,
        permission: 'partnership.request.review',
        side: 'receiver',
      };
  const actor = await requireScopedActor(ctx, [scope]);

  assertTransition(
    PARTNERSHIP_REQUEST_TRANSITIONS,
    request.status,
    input.action,
    'partnership request',
  );

  const now = new Date();
  const data: Prisma.PartnershipRequestUpdateInput = { status: input.action };
  if (input.action === 'SUBMITTED') {
    data.submittedAt = now;
    data.expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
  if (!requesterSide) {
    data.reviewedAt = now;
    data.reviewedById = actor.org.user.userId;
  }
  if (input.reason) data.decisionNote = input.reason;

  const updated = await getPrisma().partnershipRequest.update({ where: { id }, data });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: 'PARTNERSHIP_REQUEST_TRANSITIONED',
    entityType: 'partnershipRequest',
    entityId: id,
    before: { status: request.status },
    after: { status: updated.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { request: updated };
}

// ── Proposals (versioned) ─────────────────────────────────────────

/**
 * Issue a new proposal version: the live versions of the request are
 * superseded (preserved, never rewritten), the new row starts as DRAFT.
 */
async function createProposal(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createProposalSchema);
  const request = await loadRequestRow(id);

  if (!REQUEST_LIVE_STATUSES.includes(request.status as (typeof REQUEST_LIVE_STATUSES)[number])) {
    throw AppError.businessRule(
      'Proposals can only be revised while the request is under review or negotiation.',
    );
  }

  const actor = await requireScopedActor(ctx, [
    {
      orgId: request.requesterOrganizationId,
      permission: 'partnership.proposal.manage',
      side: 'requester',
    },
    {
      orgId: request.receiverOrganizationId,
      permission: 'partnership.proposal.manage',
      side: 'receiver',
    },
  ]);

  const prisma = getPrisma();
  const latest = await prisma.partnershipProposal.findFirst({
    where: { partnershipRequestId: id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const version = (latest?.version ?? 0) + 1;

  const stale = await prisma.partnershipProposal.findMany({
    where: { partnershipRequestId: id, status: { notIn: [...PROPOSAL_TERMINAL] } },
    select: { id: true, status: true },
  });
  for (const row of stale) {
    assertTransition(PARTNERSHIP_PROPOSAL_TRANSITIONS, row.status, 'SUPERSEDED', 'proposal');
  }

  const proposal = await prisma.partnershipProposal.create({
    data: {
      partnershipRequestId: id,
      version,
      title: input.title,
      description: input.description,
      requestedAmount: input.requestedAmount,
      currency: input.currency,
      supportType: input.supportType,
      implementationPlan: input.implementationPlan,
      expectedOutcomes: input.expectedOutcomes,
      beneficiaryTarget: input.beneficiaryTarget,
      volunteerTarget: input.volunteerTarget,
      hourTarget: input.hourTarget,
      startDate: input.startDate,
      endDate: input.endDate,
      createdById: actor.org.user.userId,
      status: 'DRAFT',
    },
  });
  for (const row of stale) {
    await prisma.partnershipProposal.update({
      where: { id: row.id },
      data: { status: 'SUPERSEDED' },
    });
  }

  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: 'PROPOSAL_VERSION_CREATED',
    entityType: 'partnershipProposal',
    entityId: proposal.id,
    after: { version, requestId: id, superseded: stale.map((row) => row.id) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { proposal };
}

/** Proposal transitions; ACCEPTED provisions the Partnership (design §7). */
async function transitionProposal(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, partnershipProposalTransitionSchema);
  const proposal = await loadProposalRow(id);
  const request = proposal.partnershipRequest;

  const actor = await requireScopedActor(ctx, [
    {
      orgId: request.requesterOrganizationId,
      permission: 'partnership.proposal.manage',
      side: 'requester',
    },
    {
      orgId: request.receiverOrganizationId,
      permission: 'partnership.proposal.manage',
      side: 'receiver',
    },
  ]);

  assertTransition(
    PARTNERSHIP_PROPOSAL_TRANSITIONS,
    proposal.status,
    input.action,
    'partnership proposal',
  );
  const prisma = getPrisma();

  if (input.action === 'ACCEPTED') {
    // An open partnership may exist at most once per (initiative, economic
    // org) — the design's partial-unique service rule, enforced in code.
    if (request.opportunityId) {
      const open = await prisma.partnership.findFirst({
        where: {
          opportunityId: request.opportunityId,
          status: { in: ['PROPOSED', 'ACTIVE'] },
        },
        select: { id: true },
      });
      if (open) {
        throw AppError.conflict('An open partnership already exists for this initiative.');
      }
    }
    const sides = await resolvePartnershipSides(request);
    const accepted = await prisma.partnershipProposal.update({
      where: { id },
      data: { status: 'ACCEPTED' },
    });
    const partnership = await prisma.partnership.create({
      data: {
        ...sides,
        opportunityId: request.opportunityId ?? undefined,
        csrProgramId: request.csrProgramId ?? undefined,
        proposalId: proposal.id,
        partnershipType:
          (proposal.supportType ? TYPE_BY_SUPPORT[proposal.supportType] : undefined) ??
          'COOPERATION',
        status: 'PROPOSED',
        startDate: proposal.startDate,
        endDate: proposal.endDate,
        totalValue: proposal.requestedAmount,
        currency: proposal.currency,
      },
    });
    // The request closes with the acceptance (terminal, never re-decided).
    await prisma.partnershipRequest.update({
      where: { id: request.id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedById: actor.org.user.userId },
    });

    const common = {
      actorUserId: actor.org.user.userId,
      organizationId: actor.org.orgId,
      entityType: 'partnershipProposal',
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    } as const;
    await audit({
      ...common,
      action: 'PROPOSAL_ACCEPTED',
      after: { version: proposal.version, requestStatus: 'APPROVED' },
    });
    await audit({
      ...common,
      entityType: 'partnership',
      entityId: partnership.id,
      action: 'PARTNERSHIP_CREATED',
      after: {
        partnershipId: partnership.id,
        organizationId: partnership.organizationId,
        economicOrganizationId: partnership.economicOrganizationId,
        opportunityId: partnership.opportunityId,
        proposalId: proposal.id,
      },
    });
    return { proposal: accepted, partnership };
  }

  const updated = await prisma.partnershipProposal.update({
    where: { id },
    data: { status: input.action },
  });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: PROPOSAL_AUDIT[input.action],
    entityType: 'partnershipProposal',
    entityId: id,
    before: { status: proposal.status },
    after: { status: updated.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { proposal: updated };
}

// ── Partnerships ──────────────────────────────────────────────────

/** Partnerships of the caller's organizations (or one explicit org scope). */
async function listPartnerships(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, partnershipListQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  let orgIds: string[];
  if (f.organizationId) {
    await requireOrgMembership(ctx, 'organization.read', { orgId: f.organizationId });
    orgIds = [f.organizationId];
  } else {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.userId, status: 'ACTIVE' },
      select: { organizationId: true },
    });
    orgIds = memberships.map((membership) => membership.organizationId);
  }

  const where: Prisma.PartnershipWhereInput = {
    OR: [{ organizationId: { in: orgIds } }, { economicOrganizationId: { in: orgIds } }],
    ...(f.status ? { status: f.status } : {}),
    ...(f.partnershipType ? { partnershipType: f.partnershipType } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.partnership.count({ where }),
    prisma.partnership.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        economicOrganization: { select: { id: true, name: true, slug: true } },
        opportunity: {
          select: {
            id: true,
            slug: true,
            titleAr: true,
            titleFr: true,
            titleEn: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** Direct creation (PROPOSED) — either side initiates; the other activates. */
async function createPartnership(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, createPartnershipSchema);
  const prisma = getPrisma();

  const actor = await requireScopedActor(ctx, [
    { orgId: input.organizationId, permission: 'partnership.manage', side: 'youth' },
    { orgId: input.economicOrganizationId, permission: 'partnership.manage', side: 'economic' },
  ]);

  const orgs = await prisma.organization.findMany({
    where: { id: { in: [input.organizationId, input.economicOrganizationId] } },
    select: { id: true, deletedAt: true },
  });
  if (orgs.some((organization) => organization.deletedAt)) {
    throw AppError.validation('One of the organizations is archived.');
  }
  if (orgs.length !== 2) throw AppError.validation('One of the organizations does not exist.');

  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: input.opportunityId },
      select: { id: true },
    });
    if (!opportunity) throw AppError.validation('The referenced opportunity does not exist.');
    const open = await prisma.partnership.findFirst({
      where: {
        opportunityId: input.opportunityId,
        economicOrganizationId: input.economicOrganizationId,
        status: { in: ['PROPOSED', 'ACTIVE'] },
      },
      select: { id: true },
    });
    if (open) throw AppError.conflict('An open partnership already exists for this initiative.');
  }

  try {
    const partnership = await prisma.partnership.create({
      data: {
        organizationId: input.organizationId,
        economicOrganizationId: input.economicOrganizationId,
        opportunityId: input.opportunityId,
        campaignId: input.campaignId,
        csrProgramId: input.csrProgramId,
        partnershipType: input.partnershipType,
        status: 'PROPOSED',
        startDate: input.startDate,
        endDate: input.endDate,
        totalValue: input.totalValue,
        currency: input.currency,
      },
    });
    await audit({
      actorUserId: actor.org.user.userId,
      organizationId: actor.org.orgId,
      action: 'PARTNERSHIP_CREATED',
      entityType: 'partnership',
      entityId: partnership.id,
      after: {
        organizationId: partnership.organizationId,
        economicOrganizationId: partnership.economicOrganizationId,
        opportunityId: partnership.opportunityId,
        direct: true,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { partnership };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw AppError.validation('One or more referenced records do not exist.');
    }
    throw error;
  }
}

/** Full relationship detail: both parties, agreements, obligations, funding, in-kind. */
async function getPartnership(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const partnership = await loadPartnership(id);
  await requireScopedActor(ctx, sideScopes(partnershipSides(partnership), 'organization.read'));

  const detail = await getPrisma().partnership.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
      economicOrganization: { select: { id: true, name: true, slug: true } },
      opportunity: {
        select: {
          id: true,
          slug: true,
          titleAr: true,
          titleFr: true,
          titleEn: true,
        },
      },
      proposal: { select: { id: true, version: true, title: true, status: true } },
      agreements: { orderBy: [{ createdAt: 'desc' }] },
      obligations: { orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] },
      commitments: {
        include: {
          installments: { orderBy: [{ number: 'asc' }] },
          disbursements: { orderBy: [{ createdAt: 'asc' }] },
        },
        orderBy: [{ createdAt: 'asc' }],
      },
      inKind: { orderBy: [{ createdAt: 'asc' }] },
    },
  });
  if (!detail) throw AppError.notFound('Partnership not found.');
  return { partnership: detail };
}

/** Lifecycle transitions — either side (partnership.manage), machine-validated. */
async function transitionPartnership(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, partnershipTransitionSchema);
  const partnership = await loadPartnership(id);
  const actor = await requireScopedActor(
    ctx,
    sideScopes(partnershipSides(partnership), 'partnership.manage'),
  );

  assertTransition(PARTNERSHIP_TRANSITIONS, partnership.status, input.action, 'partnership');
  const updated = await getPrisma().partnership.update({
    where: { id },
    data: { status: input.action },
  });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: input.action === 'TERMINATED' ? 'PARTNERSHIP_TERMINATED' : 'PARTNERSHIP_TRANSITIONED',
    entityType: 'partnership',
    entityId: id,
    before: { status: partnership.status },
    after: { status: updated.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { partnership: updated };
}

// ── Obligations (each side manages its own party rows) ────────────

interface ObligationRow {
  id: string;
  partnershipId: string;
  party: ObligationParty;
  status: string;
}

/** Scope the caller to the obligation's own party org (platform included). */
async function requireObligationActor(ctx: RequestContext, obligation: ObligationRow) {
  const partnership = await loadPartnership(obligation.partnershipId);
  const side = obligation.party === 'INITIATIVE_ORGANIZATION' ? 'youth' : 'economic';
  const orgId = side === 'youth' ? partnership.organizationId : partnership.economicOrganizationId;
  const actor = await requireScopedActor(ctx, [
    { orgId, permission: 'partnership.obligation.update', side },
  ]);
  return { partnership, actor };
}

async function listObligations(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const partnership = await loadPartnership(id);
  await requireScopedActor(ctx, sideScopes(partnershipSides(partnership), 'organization.read'));
  const items = await getPrisma().partnershipObligation.findMany({
    where: { partnershipId: id },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
  });
  return { items };
}

/** The party is pinned to the caller's side (platform actors must name one). */
async function createObligation(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createObligationSchema);
  const partnership = await loadPartnership(id);
  const actor = await requireScopedActor(
    ctx,
    sideScopes(partnershipSides(partnership), 'partnership.obligation.update'),
  );

  let party: ObligationParty;
  if (actor.platform) {
    if (!input.party) {
      throw AppError.validation('party is required when acting platform-wide.');
    }
    party = input.party;
  } else {
    party = actor.side === 'youth' ? 'INITIATIVE_ORGANIZATION' : 'ECONOMIC_ORGANIZATION';
    if (input.party && input.party !== party) {
      throw AppError.validation('party does not match your side of the partnership.');
    }
  }

  const obligation = await getPrisma().partnershipObligation.create({
    data: {
      partnershipId: id,
      party,
      title: input.title,
      description: input.description,
      dueDate: input.dueDate,
      value: input.value,
      currency: input.currency,
    },
  });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: 'PARTNERSHIP_OBLIGATION_CREATED',
    entityType: 'partnershipObligation',
    entityId: obligation.id,
    after: {
      partnershipId: id,
      party,
      dueDate: obligation.dueDate,
      value: obligation.value == null ? null : Number(obligation.value),
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { obligation };
}

/** Own party only, and never after the obligation closed. */
async function updateObligation(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, updateObligationSchema);
  const prisma = getPrisma();
  const existing = await prisma.partnershipObligation.findUnique({
    where: { id },
    select: { id: true, partnershipId: true, party: true, status: true },
  });
  if (!existing) throw AppError.notFound('Obligation not found.');
  const { actor } = await requireObligationActor(ctx, existing);
  if (['FULFILLED', 'WAIVED', 'BREACHED'].includes(existing.status)) {
    throw AppError.businessRule('A closed obligation cannot be edited.');
  }

  const obligation = await prisma.partnershipObligation.update({ where: { id }, data: input });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: 'PARTNERSHIP_OBLIGATION_UPDATED',
    entityType: 'partnershipObligation',
    entityId: id,
    before: { status: existing.status },
    after: { title: obligation.title, dueDate: obligation.dueDate },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { obligation };
}

async function transitionObligation(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, obligationTransitionSchema);
  const prisma = getPrisma();
  const existing = await prisma.partnershipObligation.findUnique({
    where: { id },
    select: { id: true, partnershipId: true, party: true, status: true },
  });
  if (!existing) throw AppError.notFound('Obligation not found.');
  const { actor } = await requireObligationActor(ctx, existing);

  assertTransition(OBLIGATION_TRANSITIONS, existing.status, input.action, 'partnership obligation');
  const obligation = await prisma.partnershipObligation.update({
    where: { id },
    data: {
      status: input.action,
      ...(input.action === 'FULFILLED' ? { completedAt: new Date() } : {}),
    },
  });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: 'PARTNERSHIP_OBLIGATION_TRANSITIONED',
    entityType: 'partnershipObligation',
    entityId: id,
    before: { status: existing.status },
    after: { status: obligation.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { obligation };
}

// ── Agreements (numbers from Counter("agreement_number")) ─────────

async function createAgreement(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createAgreementSchema);
  const partnership = await loadPartnership(id);
  const actor = await requireScopedActor(
    ctx,
    sideScopes(partnershipSides(partnership), 'partnership.agreement.manage'),
  );
  const prisma = getPrisma();

  const counter = await prisma.counter.upsert({
    where: { name: 'agreement_number' },
    update: { value: { increment: 1 } },
    create: { name: 'agreement_number', value: 1 },
  });
  const agreementNumber = `AGR-${new Date().getFullYear()}-${String(counter.value).padStart(6, '0')}`;

  try {
    const agreement = await prisma.partnershipAgreement.create({
      data: {
        partnershipId: id,
        agreementNumber,
        title: input.title,
        agreementType: input.agreementType,
        documentId: input.documentId,
        startDate: input.startDate,
        endDate: input.endDate,
        totalValue: input.totalValue,
        currency: input.currency,
      },
    });
    await audit({
      actorUserId: actor.org.user.userId,
      organizationId: actor.org.orgId,
      action: 'PARTNERSHIP_AGREEMENT_CREATED',
      entityType: 'partnershipAgreement',
      entityId: agreement.id,
      after: { agreementNumber, partnershipId: id },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { agreement };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('Agreement numbering is contended — please retry.');
    }
    throw error;
  }
}

async function transitionAgreement(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, agreementTransitionSchema);
  const prisma = getPrisma();
  const agreement = await prisma.partnershipAgreement.findUnique({
    where: { id },
    select: { id: true, partnershipId: true, status: true },
  });
  if (!agreement) throw AppError.notFound('Agreement not found.');
  const partnership = await loadPartnership(agreement.partnershipId);
  const actor = await requireScopedActor(
    ctx,
    sideScopes(partnershipSides(partnership), 'partnership.agreement.manage'),
  );

  assertTransition(AGREEMENT_TRANSITIONS, agreement.status, input.action, 'agreement');
  const updated = await prisma.partnershipAgreement.update({
    where: { id },
    data: {
      status: input.action,
      ...(input.action === 'ACTIVE'
        ? { signedAt: new Date(), signedById: actor.org.user.userId }
        : {}),
    },
  });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: input.action === 'ACTIVE' ? 'AGREEMENT_SIGNED' : 'PARTNERSHIP_AGREEMENT_TRANSITIONED',
    entityType: 'partnershipAgreement',
    entityId: id,
    before: { status: agreement.status },
    after: { status: updated.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { agreement: updated };
}

// ── Route table ───────────────────────────────────────────────────

export const partnershipRoutes: AppRoute[] = [
  // requests
  {
    method: 'POST',
    path: '/partnership-requests',
    handler: createPartnershipRequest,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Open a partnership conversation (either party, lands SUBMITTED)',
  },
  {
    method: 'GET',
    path: '/me/partnership-requests',
    handler: listMyPartnershipRequests,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Requests touching any organization the caller belongs to',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/partnership-requests',
    handler: listOrgPartnershipRequests,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "One organization's request inbox/outbox (org members)",
  },
  {
    method: 'POST',
    path: '/partnership-requests/:id/transition',
    handler: transitionPartnershipRequest,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Request state transition (requester submits/cancels, receiver reviews)',
  },
  // proposals
  {
    method: 'POST',
    path: '/partnership-requests/:id/proposals',
    handler: createProposal,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Issue a new proposal version (previous live versions SUPERSEDED)',
  },
  {
    method: 'POST',
    path: '/partnership-proposals/:id/transition',
    handler: transitionProposal,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Proposal transition — ACCEPTED provisions the Partnership',
  },
  // partnerships
  {
    method: 'GET',
    path: '/partnerships',
    handler: listPartnerships,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Partnerships of the caller (or an explicit organizationId scope)',
  },
  {
    method: 'POST',
    path: '/partnerships',
    handler: createPartnership,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Direct partnership creation (PROPOSED; either side)',
  },
  {
    method: 'GET',
    path: '/partnerships/:id',
    handler: getPartnership,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Full partnership detail (agreements, obligations, funding, in-kind)',
  },
  {
    method: 'POST',
    path: '/partnerships/:id/transition',
    handler: transitionPartnership,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Partnership lifecycle transition (either side, state machine)',
  },
  // obligations
  {
    method: 'GET',
    path: '/partnerships/:id/obligations',
    handler: listObligations,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Obligations of a partnership (both sides read)',
  },
  {
    method: 'POST',
    path: '/partnerships/:id/obligations',
    handler: createObligation,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: "Create an obligation for the caller's own party",
  },
  {
    method: 'PATCH',
    path: '/obligations/:id',
    handler: updateObligation,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Edit an obligation (own party, never when closed)',
  },
  {
    method: 'POST',
    path: '/obligations/:id/transition',
    handler: transitionObligation,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Obligation transition (own party; reason on WAIVED/BREACHED)',
  },
  // agreements
  {
    method: 'POST',
    path: '/partnerships/:id/agreements',
    handler: createAgreement,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Create an agreement with a Counter-issued number (AGR-YYYY-######)',
  },
  {
    method: 'POST',
    path: '/agreements/:id/transition',
    handler: transitionAgreement,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Agreement transition (ACTIVE stamps signedAt/signedById)',
  },
];
