// Initiative support needs & offers (spec §5/§9/§11/§13).
//
// An initiative (Opportunity) declares what it needs — volunteers are modeled
// by capacity + applications, so these rows cover FINANCIAL / EQUIPMENT /
// MATERIAL / SERVICE needs — and any authenticated user can leave a traceable
// offer against one need. The initiative owner accepts or rejects (reason
// required on REJECT); the offerer may cancel while still PENDING. Nothing
// here moves money: a FINANCIAL offer is a pledge recorded for an outside
// bank transfer, exactly like campaign contributions (spec §33).

import { getPrisma, type Prisma } from '@bladna/database';
import { assertTransition, SUPPORT_OFFER_TRANSITIONS } from '@bladna/domain';
import { AppError } from '@bladna/types';
import { buildPageMeta, maskEmail, maskName, normalizePageParams } from '@bladna/utils';
import {
  createOrgSupportOfferSchema,
  createSupportNeedSchema,
  createSupportOfferSchema,
  decideSupportOfferSchema,
  idParamsSchema,
  needIdParamsSchema,
  offerIdParamsSchema,
  opportunityParamsSchema,
  supportNeedListQuerySchema,
  supportOfferListQuerySchema,
  updateSupportNeedSchema,
} from '@bladna/validation';
import { type z } from 'zod';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireAuth, requireOrgMembership } from '../guards';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

type SupportOfferStatusLiteral = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/** Convert zod issues into the platform's 400 validation envelope. */
function validationError(message: string, issues: z.ZodIssue[]): AppError {
  return AppError.validation(
    message,
    issues.map((issue) => ({
      path: issue.path.join('.') || 'value',
      code: 'invalid',
      message: issue.message,
    })),
  );
}

/** The tenant-scoped initiative every org-side handler operates on. */
async function requireOwnedOpportunity(
  orgId: string,
  opportunityId: string,
): Promise<{ id: string }> {
  const opportunity = await getPrisma().opportunity.findFirst({
    where: { id: opportunityId, organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');
  return opportunity;
}

const NEED_SELECT = {
  id: true,
  kind: true,
  labelAr: true,
  labelFr: true,
  labelEn: true,
  description: true,
  quantity: true,
  fulfilled: true,
  targetAmount: true,
  currency: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.SupportNeedSelect;

function serializeNeed(need: {
  targetAmount: unknown;
  fulfilled: number;
  quantity: number | null;
}) {
  return {
    ...need,
    targetAmount: need.targetAmount == null ? null : Number(need.targetAmount),
    // Progress is honest: only meaningful when a quantity target exists.
    progress:
      need.quantity != null && need.quantity > 0 ? Math.min(need.fulfilled, need.quantity) : null,
  };
}

// ── Organization side: needs CRUD ───────────────────────────────

async function listNeeds(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const f = query(ctx, supportNeedListQuerySchema);
  await requireOwnedOpportunity(org.orgId, id);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SupportNeedWhereInput = {
    opportunityId: id,
    ...(f.kind ? { kind: f.kind } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.supportNeed.count({ where }),
    prisma.supportNeed.findMany({
      where,
      select: NEED_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip,
      take,
    }),
  ]);

  // Per-need offer aggregates for the page (accepted amount = honest financial
  // progress for FINANCIAL needs; counts help every kind; the accepted
  // quantity feeds the two-tone bar — P18 — so accepting an offer visibly
  // moves quantity-need progress too).
  const offers =
    items.length === 0
      ? []
      : await prisma.supportOffer.findMany({
          where: {
            supportNeedId: { in: items.map((need) => need.id) },
            status: { in: ['PENDING', 'ACCEPTED'] },
          },
          select: { supportNeedId: true, status: true, amount: true, quantity: true },
        });

  const byNeed = new Map<
    string,
    { pending: number; accepted: number; acceptedAmount: number; acceptedQuantity: number }
  >();
  for (const need of items)
    byNeed.set(need.id, { pending: 0, accepted: 0, acceptedAmount: 0, acceptedQuantity: 0 });
  for (const offer of offers) {
    const agg = byNeed.get(offer.supportNeedId);
    if (!agg) continue;
    if (offer.status === 'PENDING') agg.pending += 1;
    else {
      agg.accepted += 1;
      if (offer.amount != null) agg.acceptedAmount += Number(offer.amount);
      if (offer.quantity != null) agg.acceptedQuantity += offer.quantity;
    }
  }

  return {
    items: items.map((need) => {
      const agg = byNeed.get(need.id) ?? {
        pending: 0,
        accepted: 0,
        acceptedAmount: 0,
        acceptedQuantity: 0,
      };
      return {
        ...serializeNeed(need),
        pendingOffers: agg.pending,
        acceptedOffers: agg.accepted,
        acceptedAmount: agg.acceptedAmount,
        acceptedQuantity: agg.acceptedQuantity,
      };
    }),
    meta: buildPageMeta(total, { page, limit }),
  };
}

async function createNeed(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createSupportNeedSchema);
  await requireOwnedOpportunity(org.orgId, id);

  const need = await getPrisma().supportNeed.create({
    data: {
      opportunityId: id,
      kind: input.kind,
      labelAr: input.labelAr,
      labelFr: input.labelFr,
      labelEn: input.labelEn,
      description: input.description?.trim() || null,
      quantity: input.quantity ?? null,
      fulfilled: input.fulfilled,
      targetAmount: input.targetAmount ?? null,
      currency: input.currency,
      sortOrder: input.sortOrder,
    },
    select: NEED_SELECT,
  });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'support.need.create',
    entityType: 'supportNeed',
    entityId: need.id,
    after: { opportunityId: id, kind: input.kind, labelAr: input.labelAr },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { need: serializeNeed(need) };
}

async function updateNeed(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const { needId } = pathParams(ctx, needIdParamsSchema);
  const input = await body(ctx, updateSupportNeedSchema);
  await requireOwnedOpportunity(org.orgId, id);
  const prisma = getPrisma();

  const existing = await prisma.supportNeed.findFirst({
    where: { id: needId, opportunityId: id },
    select: NEED_SELECT,
  });
  if (!existing) throw AppError.notFound('Support need not found.');

  // Merge the partial patch over the existing row and validate the result
  // through the same create schema — kind-specific rules always hold.
  const merged = {
    kind: input.kind ?? existing.kind,
    labelAr: input.labelAr ?? existing.labelAr,
    labelFr: input.labelFr ?? existing.labelFr,
    labelEn: input.labelEn ?? existing.labelEn,
    description:
      input.description !== undefined ? input.description : (existing.description ?? undefined),
    quantity: input.quantity !== undefined ? input.quantity : existing.quantity,
    fulfilled: input.fulfilled ?? existing.fulfilled,
    targetAmount:
      input.targetAmount !== undefined
        ? input.targetAmount
        : existing.targetAmount == null
          ? null
          : Number(existing.targetAmount),
    currency: input.currency ?? existing.currency,
    sortOrder: input.sortOrder ?? existing.sortOrder,
  };
  const parsed = createSupportNeedSchema.safeParse(merged);
  if (!parsed.success) throw validationError('Invalid support need.', parsed.error.issues);

  const need = await prisma.supportNeed.update({
    where: { id: needId },
    data: {
      kind: parsed.data.kind,
      labelAr: parsed.data.labelAr,
      labelFr: parsed.data.labelFr,
      labelEn: parsed.data.labelEn,
      description: parsed.data.description?.trim() || null,
      quantity: parsed.data.quantity ?? null,
      fulfilled: parsed.data.fulfilled,
      targetAmount: parsed.data.targetAmount ?? null,
      currency: parsed.data.currency,
      sortOrder: parsed.data.sortOrder,
    },
    select: NEED_SELECT,
  });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'support.need.update',
    entityType: 'supportNeed',
    entityId: needId,
    before: { kind: existing.kind, fulfilled: existing.fulfilled, quantity: existing.quantity },
    after: { kind: need.kind, fulfilled: need.fulfilled, quantity: need.quantity },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { need: serializeNeed(need) };
}

async function deleteNeed(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const { needId } = pathParams(ctx, needIdParamsSchema);
  await requireOwnedOpportunity(org.orgId, id);
  const prisma = getPrisma();

  const existing = await prisma.supportNeed.findFirst({
    where: { id: needId, opportunityId: id },
    select: { id: true, kind: true, labelAr: true },
  });
  if (!existing) throw AppError.notFound('Support need not found.');

  // Cascade removes its offers; the audit log keeps the declared-need trail.
  await prisma.supportNeed.delete({ where: { id: needId } });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'support.need.delete',
    entityType: 'supportNeed',
    entityId: needId,
    before: { opportunityId: id, kind: existing.kind, labelAr: existing.labelAr },
    after: null,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { deleted: true };
}

// ── Offerer side ────────────────────────────────────────────────

/** Offer support toward one declared need of a published initiative. */
/**
 * Kind-specific offer rules (spec §5/§13) — shared by both creation paths:
 * FINANCIAL = amount pledge in the need's currency; everything else may carry
 * a quantity and never an amount.
 */
function assertOfferMatchesNeed(
  need: { kind: string; currency: string },
  input: { quantity?: number; amount?: number; currency?: string },
): void {
  if (need.kind === 'FINANCIAL') {
    if (input.amount == null) {
      throw AppError.validation('A financial offer requires an amount.', [
        { path: 'amount', code: 'invalid', message: 'FINANCIAL_OFFER_AMOUNT_REQUIRED' },
      ]);
    }
    if (input.quantity != null) {
      throw AppError.validation('Quantity does not apply to financial offers.', [
        { path: 'quantity', code: 'invalid', message: 'QUANTITY_NOT_FOR_FINANCIAL' },
      ]);
    }
    if (input.currency && input.currency.toUpperCase() !== need.currency.toUpperCase()) {
      throw AppError.validation('currency does not match the need currency.', [
        { path: 'currency', code: 'invalid', message: `The need currency is ${need.currency}.` },
      ]);
    }
  } else if (input.amount != null) {
    throw AppError.validation('An amount only applies to financial offers.', [
      { path: 'amount', code: 'invalid', message: 'AMOUNT_ONLY_FOR_FINANCIAL' },
    ]);
  }
}

async function createOffer(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { slug } = pathParams(ctx, opportunityParamsSchema);
  const input = await body(ctx, createSupportOfferSchema);
  const prisma = getPrisma();

  const opportunity = await prisma.opportunity.findFirst({
    where: { slug, status: 'PUBLISHED', deletedAt: null },
    select: { id: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  const need = await prisma.supportNeed.findFirst({
    where: { id: input.supportNeedId, opportunityId: opportunity.id },
    select: { id: true, kind: true, currency: true },
  });
  if (!need) throw AppError.notFound('Support need not found.');

  assertOfferMatchesNeed(need, input);

  const offer = await prisma.supportOffer.create({
    data: {
      supportNeedId: need.id,
      userId: user.userId,
      quantity: input.quantity ?? null,
      amount: input.amount ?? null,
      currency: need.currency,
      description: input.description,
      contactNote: input.contactNote?.trim() || null,
    },
    select: {
      id: true,
      status: true,
      quantity: true,
      amount: true,
      currency: true,
      description: true,
      contactNote: true,
      createdAt: true,
    },
  });
  await audit({
    actorUserId: user.userId,
    action: 'support.offer.create',
    entityType: 'supportOffer',
    entityId: offer.id,
    after: { supportNeedId: need.id, kind: need.kind, status: 'PENDING' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { offer: { ...offer, amount: offer.amount == null ? null : Number(offer.amount) } };
}

/**
 * Body-addressed offer (P34 — design §5): no path slug, the need id rides the
 * body, and `organizationId` lets an institution offer on behalf of its tenant.
 * The acting member remains `userId` (the audit actor); membership of that
 * organization is required, and the need-owner's accept/reject rules are
 * untouched — an org offer lands PENDING exactly like a personal one.
 */
async function createOfferForOrganization(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, createOrgSupportOfferSchema);
  const prisma = getPrisma();

  if (input.organizationId) {
    await requireOrgMembership(ctx, 'organization.read', { orgId: input.organizationId });
  }

  const need = await prisma.supportNeed.findFirst({
    where: { id: input.supportNeedId },
    select: {
      id: true,
      kind: true,
      currency: true,
      opportunity: { select: { status: true, deletedAt: true } },
    },
  });
  if (!need || need.opportunity.status !== 'PUBLISHED' || need.opportunity.deletedAt) {
    throw AppError.notFound('Support need not found.');
  }

  assertOfferMatchesNeed(need, input);

  const offer = await prisma.supportOffer.create({
    data: {
      supportNeedId: need.id,
      userId: user.userId,
      organizationId: input.organizationId ?? null,
      quantity: input.quantity ?? null,
      amount: input.amount ?? null,
      currency: need.currency,
      description: input.description,
      contactNote: input.contactNote?.trim() || null,
    },
    select: {
      id: true,
      status: true,
      quantity: true,
      amount: true,
      currency: true,
      description: true,
      contactNote: true,
      organizationId: true,
      createdAt: true,
    },
  });
  await audit({
    actorUserId: user.userId,
    organizationId: input.organizationId,
    action: 'support.offer.create',
    entityType: 'supportOffer',
    entityId: offer.id,
    after: {
      supportNeedId: need.id,
      kind: need.kind,
      status: 'PENDING',
      organizationId: input.organizationId ?? null,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { offer: { ...offer, amount: offer.amount == null ? null : Number(offer.amount) } };
}

/** The offerer's own history (spec §21): what I offered and its current state. */
async function myOffers(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, supportOfferListQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SupportOfferWhereInput = {
    userId: user.userId,
    ...(f.status ? { status: f.status } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.supportOffer.count({ where }),
    prisma.supportOffer.findMany({
      where,
      select: {
        id: true,
        status: true,
        quantity: true,
        amount: true,
        currency: true,
        description: true,
        contactNote: true,
        reason: true,
        createdAt: true,
        decidedAt: true,
        supportNeed: {
          select: {
            id: true,
            kind: true,
            labelAr: true,
            labelFr: true,
            labelEn: true,
            opportunityId: true,
            opportunity: {
              select: { id: true, slug: true, titleAr: true, titleFr: true, titleEn: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  return {
    items: items.map((offer) => ({
      id: offer.id,
      status: offer.status,
      quantity: offer.quantity,
      amount: offer.amount == null ? null : Number(offer.amount),
      currency: offer.currency,
      description: offer.description,
      contactNote: offer.contactNote,
      reason: offer.reason,
      createdAt: offer.createdAt,
      decidedAt: offer.decidedAt,
      need: {
        id: offer.supportNeed.id,
        kind: offer.supportNeed.kind,
        labelAr: offer.supportNeed.labelAr,
        labelFr: offer.supportNeed.labelFr,
        labelEn: offer.supportNeed.labelEn,
      },
      initiative: {
        id: offer.supportNeed.opportunity.id,
        slug: offer.supportNeed.opportunity.slug,
        titleAr: offer.supportNeed.opportunity.titleAr,
        titleFr: offer.supportNeed.opportunity.titleFr,
        titleEn: offer.supportNeed.opportunity.titleEn,
      },
    })),
    meta: buildPageMeta(total, { page, limit }),
  };
}

/** Cancel your own still-PENDING offer — kept as CANCELLED for the trace. */
async function cancelOffer(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const offer = await prisma.supportOffer.findFirst({
    where: { id, userId: user.userId },
    select: { id: true, status: true },
  });
  if (!offer) throw AppError.notFound('Offer not found.');
  if (offer.status !== 'PENDING') {
    throw AppError.businessRule('Only a pending offer can be cancelled.');
  }
  assertTransition(SUPPORT_OFFER_TRANSITIONS, offer.status, 'CANCELLED', 'support offer');

  await prisma.supportOffer.update({
    where: { id },
    data: { status: 'CANCELLED', decidedAt: new Date() },
    select: { id: true, status: true },
  });
  await audit({
    actorUserId: user.userId,
    action: 'support.offer.cancel',
    entityType: 'supportOffer',
    entityId: id,
    before: { status: 'PENDING' },
    after: { status: 'CANCELLED' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { offer: { id, status: 'CANCELLED' } };
}

// ── Organization side: offer decisions ──────────────────────────

async function orgOffers(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const f = query(ctx, supportOfferListQuerySchema);
  await requireOwnedOpportunity(org.orgId, id);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SupportOfferWhereInput = {
    supportNeed: { opportunityId: id },
    ...(f.status ? { status: f.status } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.supportOffer.count({ where }),
    prisma.supportOffer.findMany({
      where,
      select: {
        id: true,
        status: true,
        quantity: true,
        amount: true,
        currency: true,
        description: true,
        contactNote: true,
        reason: true,
        createdAt: true,
        decidedAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        supportNeed: {
          select: { id: true, kind: true, labelAr: true, labelFr: true, labelEn: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  // Offerer identity is masked at the boundary (same as donors/applicants);
  // `contactNote` is the offerer-provided coordination channel.
  return {
    items: items.map((offer) => ({
      id: offer.id,
      status: offer.status,
      quantity: offer.quantity,
      amount: offer.amount == null ? null : Number(offer.amount),
      currency: offer.currency,
      description: offer.description,
      contactNote: offer.contactNote,
      reason: offer.reason,
      createdAt: offer.createdAt,
      decidedAt: offer.decidedAt,
      offerer: {
        id: offer.user.id,
        name: maskName(offer.user.firstName, offer.user.lastName),
        email: maskEmail(offer.user.email),
      },
      need: {
        id: offer.supportNeed.id,
        kind: offer.supportNeed.kind,
        labelAr: offer.supportNeed.labelAr,
        labelFr: offer.supportNeed.labelFr,
        labelEn: offer.supportNeed.labelEn,
      },
    })),
    meta: buildPageMeta(total, { page, limit }),
  };
}

/** Accept or reject one PENDING offer (REJECT requires a reason). */
async function decideOffer(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const { offerId } = pathParams(ctx, offerIdParamsSchema);
  const input = await body(ctx, decideSupportOfferSchema);
  await requireOwnedOpportunity(org.orgId, id);
  const prisma = getPrisma();

  const offer = await prisma.supportOffer.findFirst({
    where: { id: offerId, supportNeed: { opportunityId: id } },
    select: { id: true, status: true, supportNeedId: true },
  });
  if (!offer) throw AppError.notFound('Offer not found.');

  const target: SupportOfferStatusLiteral = input.action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
  assertTransition(SUPPORT_OFFER_TRANSITIONS, offer.status, target, 'support offer');

  const updated = await prisma.supportOffer.update({
    where: { id: offerId },
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
    action: 'support.offer.decide',
    entityType: 'supportOffer',
    entityId: offerId,
    before: { status: offer.status },
    after: { status: target, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { offer: updated };
}

// ── Route table ─────────────────────────────────────────────────

export const supportRoutes: AppRoute[] = [
  // organization (tenant-scoped initiative management)
  {
    method: 'GET',
    path: '/orgs/:orgId/opportunities/:id/support-needs',
    handler: listNeeds,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "List an initiative's declared support needs (org only)",
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/opportunities/:id/support-needs',
    handler: createNeed,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Declare a support need (FINANCIAL/EQUIPMENT/MATERIAL/SERVICE)',
  },
  {
    method: 'PATCH',
    path: '/orgs/:orgId/opportunities/:id/support-needs/:needId',
    handler: updateNeed,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Update a declared need (merge-validated, incl. fulfilled progress)',
  },
  {
    method: 'DELETE',
    path: '/orgs/:orgId/opportunities/:id/support-needs/:needId',
    handler: deleteNeed,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Remove a declared need (cascades its offers)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/opportunities/:id/support-offers',
    handler: orgOffers,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Support offers against one initiative (org only, offerers masked)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/opportunities/:id/support-offers/:offerId',
    handler: decideOffer,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Accept or reject a pending support offer (reason on REJECT)',
  },
  // offerers
  {
    method: 'POST',
    path: '/opportunities/:slug/support-offers',
    handler: createOffer,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Offer support toward a declared need (PENDING)',
  },
  {
    method: 'POST',
    path: '/support-offers',
    handler: createOfferForOrganization,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Body-addressed support offer (accepts organizationId for institutions)',
  },
  {
    method: 'GET',
    path: '/me/support-offers',
    handler: myOffers,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: "The offerer's own support-offer history",
  },
  {
    method: 'POST',
    path: '/me/support-offers/:id/cancel',
    handler: cancelOffer,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Cancel your own pending support offer',
  },
];
