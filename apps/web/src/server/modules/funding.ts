// Funding lifecycle (P34 — design §5/§7): commitment → installments →
// disbursements, plus real in-kind tracking. Structural separation per the
// design matrix: the **economic institution** commits, schedules and executes
// money moves; only the **verification officer** signs off (disbursement
// verify, in-kind verify) — the youth side reads both, never writes.

import { getPrisma } from '@bladna/database';
import {
  DISBURSEMENT_TRANSITIONS,
  FUNDING_COMMITMENT_TRANSITIONS,
  FUNDING_INSTALLMENT_TRANSITIONS,
  IN_KIND_TRANSITIONS,
  assertTransition,
} from '@bladna/domain';
import { AppError } from '@bladna/types';
import type { InKindStatus } from '@bladna/types';
import {
  commitmentTransitionSchema,
  createCommitmentSchema,
  createDisbursementSchema,
  createInstallmentSchema,
  createInKindSchema,
  disbursementTransitionSchema,
  idParamsSchema,
  inKindTransitionSchema,
  installmentTransitionSchema,
  verifyDisbursementSchema,
} from '@bladna/validation';
import { body, pathParams, type RequestContext } from '../http';
import { requireSystemPermission } from '../guards';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prisma-errors';
import {
  loadPartnership,
  partnershipSides,
  requireScopedActor,
  sideScopes,
} from '../lib/partnership-access';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

const IN_KIND_AUDIT: Record<InKindStatus, string> = {
  PLANNED: 'IN_KIND_TRANSITIONED', // no inbound edge — unreachable
  DELIVERED: 'IN_KIND_DELIVERED',
  RECEIVED: 'IN_KIND_RECEIVED',
  VERIFIED: 'IN_KIND_VERIFIED',
  REJECTED: 'IN_KIND_REJECTED',
};

/** Funding writes are the economic institution's — members of the youth side bounce. */
async function requireEconomicActor(
  ctx: RequestContext,
  partnershipId: string,
  permission: 'partnership.funding.manage' | 'partnership.obligation.update',
) {
  const partnership = await loadPartnership(partnershipId);
  const actor = await requireScopedActor(
    ctx,
    sideScopes(partnershipSides(partnership), permission),
  );
  if (!actor.platform && actor.side !== 'economic') {
    throw AppError.forbidden('Only the economic institution manages funding.');
  }
  return { partnership, actor };
}

interface CommitmentRow {
  id: string;
  partnershipId: string;
  status: string;
}

async function loadCommitmentRow(id: string): Promise<CommitmentRow> {
  const commitment = await getPrisma().fundingCommitment.findUnique({
    where: { id },
    select: { id: true, partnershipId: true, status: true },
  });
  if (!commitment) throw AppError.notFound('Funding commitment not found.');
  return commitment;
}

// ── Commitments ───────────────────────────────────────────────────

async function createCommitment(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createCommitmentSchema);
  const { actor } = await requireEconomicActor(ctx, id, 'partnership.funding.manage');

  try {
    const commitment = await getPrisma().fundingCommitment.create({
      data: {
        partnershipId: id,
        amount: input.amount,
        currency: input.currency,
        csrProgramId: input.csrProgramId,
        sponsorshipId: input.sponsorshipId,
        notes: input.notes,
      },
    });
    await audit({
      actorUserId: actor.org.user.userId,
      organizationId: actor.org.orgId,
      action: 'FUNDING_COMMITMENT_CREATED',
      entityType: 'fundingCommitment',
      entityId: commitment.id,
      after: { partnershipId: id, amount: Number(commitment.amount), status: commitment.status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { commitment };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw AppError.validation('One or more referenced records do not exist.');
    }
    throw error;
  }
}

async function transitionCommitment(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, commitmentTransitionSchema);
  const commitment = await loadCommitmentRow(id);
  const { actor } = await requireEconomicActor(
    ctx,
    commitment.partnershipId,
    'partnership.funding.manage',
  );

  assertTransition(
    FUNDING_COMMITMENT_TRANSITIONS,
    commitment.status as 'PENDING' | 'COMMITTED' | 'CANCELLED' | 'TERMINATED',
    input.action,
    'funding commitment',
  );
  const updated = await getPrisma().fundingCommitment.update({
    where: { id },
    data: {
      status: input.action,
      ...(input.action === 'COMMITTED' ? { committedAt: new Date() } : {}),
    },
  });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: input.action === 'COMMITTED' ? 'FUNDING_COMMITTED' : 'FUNDING_COMMITMENT_TRANSITIONED',
    entityType: 'fundingCommitment',
    entityId: id,
    before: { status: commitment.status },
    after: { status: updated.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { commitment: updated };
}

// ── Installments ──────────────────────────────────────────────────

async function listInstallments(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const commitment = await loadCommitmentRow(id);
  const partnership = await loadPartnership(commitment.partnershipId);
  await requireScopedActor(ctx, sideScopes(partnershipSides(partnership), 'organization.read'));

  const items = await getPrisma().fundingInstallment.findMany({
    where: { commitmentId: id },
    orderBy: [{ number: 'asc' }],
  });
  return { items };
}

/** Numbering = max+1 within the commitment, guarded by @@unique([commitmentId, number]). */
async function createInstallment(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createInstallmentSchema);
  const commitment = await loadCommitmentRow(id);
  const { actor } = await requireEconomicActor(
    ctx,
    commitment.partnershipId,
    'partnership.funding.manage',
  );

  if (commitment.status !== 'COMMITTED') {
    throw AppError.businessRule('Installments require a COMMITTED commitment.');
  }
  const prisma = getPrisma();
  const latest = await prisma.fundingInstallment.findFirst({
    where: { commitmentId: id },
    orderBy: { number: 'desc' },
    select: { number: true },
  });

  try {
    const installment = await prisma.fundingInstallment.create({
      data: {
        commitmentId: id,
        number: (latest?.number ?? 0) + 1,
        amount: input.amount,
        dueAt: input.dueAt,
        reference: input.reference,
      },
    });
    await audit({
      actorUserId: actor.org.user.userId,
      organizationId: actor.org.orgId,
      action: 'FUNDING_INSTALLMENT_SCHEDULED',
      entityType: 'fundingInstallment',
      entityId: installment.id,
      after: {
        commitmentId: id,
        number: installment.number,
        amount: Number(installment.amount),
        dueAt: installment.dueAt,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { installment };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('Installment numbering is contended — please retry.');
    }
    throw error;
  }
}

async function transitionInstallment(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, installmentTransitionSchema);
  const prisma = getPrisma();
  const installment = await prisma.fundingInstallment.findUnique({
    where: { id },
    select: { id: true, commitmentId: true, status: true },
  });
  if (!installment) throw AppError.notFound('Installment not found.');
  const commitment = await loadCommitmentRow(installment.commitmentId);
  const { actor } = await requireEconomicActor(
    ctx,
    commitment.partnershipId,
    'partnership.funding.manage',
  );

  assertTransition(
    FUNDING_INSTALLMENT_TRANSITIONS,
    installment.status as 'SCHEDULED' | 'PAID' | 'CANCELLED',
    input.action,
    'funding installment',
  );
  const updated = await prisma.fundingInstallment.update({
    where: { id },
    data: {
      status: input.action,
      ...(input.action === 'PAID'
        ? {
            paidAt: input.paidAt ?? new Date(),
            ...(input.reference ? { reference: input.reference } : {}),
            ...(input.evidenceDocumentId ? { evidenceDocumentId: input.evidenceDocumentId } : {}),
          }
        : {}),
    },
  });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action:
      input.action === 'PAID' ? 'FUNDING_INSTALLMENT_PAID' : 'FUNDING_INSTALLMENT_TRANSITIONED',
    entityType: 'fundingInstallment',
    entityId: id,
    before: { status: installment.status },
    after: { status: updated.status },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { installment: updated };
}

// ── Disbursements (execute on the economic side, verify officer-only) ─────

async function createDisbursement(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createDisbursementSchema);
  const commitment = await loadCommitmentRow(id);
  const { actor } = await requireEconomicActor(
    ctx,
    commitment.partnershipId,
    'partnership.funding.manage',
  );
  const prisma = getPrisma();

  if (input.installmentId) {
    const installment = await prisma.fundingInstallment.findUnique({
      where: { id: input.installmentId },
      select: { commitmentId: true },
    });
    if (!installment || installment.commitmentId !== id) {
      throw AppError.validation('The installment does not belong to this commitment.');
    }
  }

  try {
    const disbursement = await prisma.disbursement.create({
      data: {
        commitmentId: id,
        installmentId: input.installmentId,
        amount: input.amount,
        reference: input.reference,
        evidenceDocumentId: input.evidenceDocumentId,
      },
    });
    await audit({
      actorUserId: actor.org.user.userId,
      organizationId: actor.org.orgId,
      action: 'DISBURSEMENT_SCHEDULED',
      entityType: 'disbursement',
      entityId: disbursement.id,
      after: {
        commitmentId: id,
        amount: Number(disbursement.amount),
        status: disbursement.status,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { disbursement };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw AppError.validation('One or more referenced records do not exist.');
    }
    throw error;
  }
}

/** Economic side marks the transfer executed — FUNDING_DISBURSED audit event. */
async function transitionDisbursement(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, disbursementTransitionSchema);
  const prisma = getPrisma();
  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    select: { id: true, commitmentId: true, status: true },
  });
  if (!disbursement) throw AppError.notFound('Disbursement not found.');
  const commitment = await loadCommitmentRow(disbursement.commitmentId);
  const { actor } = await requireEconomicActor(
    ctx,
    commitment.partnershipId,
    'partnership.funding.manage',
  );

  assertTransition(
    DISBURSEMENT_TRANSITIONS,
    disbursement.status as 'SCHEDULED' | 'EXECUTED' | 'VERIFIED' | 'REJECTED',
    input.action,
    'disbursement',
  );
  const updated = await prisma.disbursement.update({
    where: { id },
    data: {
      status: input.action,
      executedAt: input.executedAt ?? new Date(),
      ...(input.reference ? { reference: input.reference } : {}),
      ...(input.evidenceDocumentId ? { evidenceDocumentId: input.evidenceDocumentId } : {}),
    },
  });
  await audit({
    actorUserId: actor.org.user.userId,
    organizationId: actor.org.orgId,
    action: 'FUNDING_DISBURSED',
    entityType: 'disbursement',
    entityId: id,
    before: { status: disbursement.status },
    after: { status: updated.status, amount: Number(updated.amount) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { disbursement: updated };
}

/** Verification officer only (design matrix: «وحده») — terminal decision. */
async function verifyDisbursement(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'impact.evidence.verify');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, verifyDisbursementSchema);
  const prisma = getPrisma();
  const disbursement = await prisma.disbursement.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!disbursement) throw AppError.notFound('Disbursement not found.');

  assertTransition(
    DISBURSEMENT_TRANSITIONS,
    disbursement.status as 'SCHEDULED' | 'EXECUTED' | 'VERIFIED' | 'REJECTED',
    input.action,
    'disbursement',
  );
  const updated = await prisma.disbursement.update({
    where: { id },
    data: {
      status: input.action,
      verifiedById: user.userId,
      verifiedAt: new Date(),
      ...(input.reason ? { rejectReason: input.reason } : {}),
    },
  });
  await audit({
    actorUserId: user.userId,
    action:
      input.action === 'VERIFIED'
        ? 'FUNDING_DISBURSEMENT_VERIFIED'
        : 'FUNDING_DISBURSEMENT_REJECTED',
    entityType: 'disbursement',
    entityId: id,
    before: { status: disbursement.status },
    after: { status: updated.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { disbursement: updated };
}

// ── In-kind contributions (both sides move, officer verifies) ─────

async function listInKind(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const partnership = await loadPartnership(id);
  await requireScopedActor(ctx, sideScopes(partnershipSides(partnership), 'organization.read'));
  const items = await getPrisma().inKindContribution.findMany({
    where: { partnershipId: id },
    orderBy: [{ createdAt: 'desc' }],
  });
  return { items };
}

async function createInKind(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createInKindSchema);
  const partnership = await loadPartnership(id);
  const actor = await requireScopedActor(
    ctx,
    sideScopes(partnershipSides(partnership), 'partnership.obligation.update'),
  );

  try {
    const contribution = await getPrisma().inKindContribution.create({
      data: {
        partnershipId: id,
        kind: input.kind,
        item: input.item,
        quantity: input.quantity,
        unit: input.unit,
        estimatedValue: input.estimatedValue,
        marketValue: input.marketValue,
        currency: input.currency,
        deliveryDate: input.deliveryDate,
        deliveryLocation: input.deliveryLocation,
        evidenceDocumentId: input.evidenceDocumentId,
        notes: input.notes,
      },
    });
    await audit({
      actorUserId: actor.org.user.userId,
      organizationId: actor.org.orgId,
      action: 'IN_KIND_CONTRIBUTION_CREATED',
      entityType: 'inKindContribution',
      entityId: contribution.id,
      after: {
        partnershipId: id,
        kind: contribution.kind,
        item: contribution.item,
        quantity: contribution.quantity,
        status: contribution.status,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { contribution };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw AppError.validation('One or more referenced records do not exist.');
    }
    throw error;
  }
}

async function transitionInKind(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, inKindTransitionSchema);
  const prisma = getPrisma();
  const contribution = await prisma.inKindContribution.findUnique({
    where: { id },
    select: { id: true, partnershipId: true, status: true },
  });
  if (!contribution) throw AppError.notFound('In-kind contribution not found.');

  const officerDecision = input.action === 'VERIFIED' || input.action === 'REJECTED';
  let actorUserId: string;
  let organizationId: string | null = null;

  if (officerDecision) {
    const user = await requireSystemPermission(ctx, 'impact.evidence.verify');
    actorUserId = user.userId;
  } else {
    const partnership = await loadPartnership(contribution.partnershipId);
    const actor = await requireScopedActor(
      ctx,
      sideScopes(partnershipSides(partnership), 'partnership.obligation.update'),
    );
    actorUserId = actor.org.user.userId;
    organizationId = actor.org.orgId;
  }

  assertTransition(
    IN_KIND_TRANSITIONS,
    contribution.status as 'PLANNED' | 'DELIVERED' | 'RECEIVED' | 'VERIFIED' | 'REJECTED',
    input.action,
    'in-kind contribution',
  );
  const updated = await prisma.inKindContribution.update({
    where: { id },
    data: {
      status: input.action,
      ...(input.action === 'DELIVERED' ? { deliveryDate: input.deliveryDate ?? new Date() } : {}),
      ...(input.action === 'RECEIVED' ? { receivedById: actorUserId } : {}),
      ...(officerDecision
        ? {
            verifiedById: actorUserId,
            verifiedAt: new Date(),
            ...(input.action === 'REJECTED' ? { rejectReason: input.reason ?? null } : {}),
          }
        : {}),
      ...(input.evidenceDocumentId ? { evidenceDocumentId: input.evidenceDocumentId } : {}),
    },
  });
  await audit({
    actorUserId,
    organizationId,
    action: IN_KIND_AUDIT[input.action],
    entityType: 'inKindContribution',
    entityId: id,
    before: { status: contribution.status },
    after: { status: updated.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { contribution: updated };
}

// ── Route table ───────────────────────────────────────────────────

export const fundingRoutes: AppRoute[] = [
  // commitments
  {
    method: 'POST',
    path: '/partnerships/:id/funding-commitments',
    handler: createCommitment,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Commit funding toward a partnership (economic institution, PENDING)',
  },
  {
    method: 'POST',
    path: '/funding-commitments/:id/transition',
    handler: transitionCommitment,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Commitment transition (COMMITTED stamps committedAt)',
  },
  // installments
  {
    method: 'GET',
    path: '/funding-commitments/:id/installments',
    handler: listInstallments,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Installments of a commitment (both sides read)',
  },
  {
    method: 'POST',
    path: '/funding-commitments/:id/installments',
    handler: createInstallment,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Schedule an installment (economic side, COMMITTED only)',
  },
  {
    method: 'POST',
    path: '/funding-installments/:id/transition',
    handler: transitionInstallment,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Installment transition (PAID terminal, with receipt evidence)',
  },
  // disbursements
  {
    method: 'POST',
    path: '/funding-commitments/:id/disbursements',
    handler: createDisbursement,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Schedule a disbursement transfer (economic side)',
  },
  {
    method: 'POST',
    path: '/disbursements/:id/transition',
    handler: transitionDisbursement,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Mark a transfer executed (economic side, FUNDING_DISBURSED)',
  },
  {
    method: 'POST',
    path: '/disbursements/:id/verify',
    handler: verifyDisbursement,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Verify or reject an executed disbursement (verification officer only)',
  },
  // in-kind
  {
    method: 'GET',
    path: '/partnerships/:id/in-kind',
    handler: listInKind,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'In-kind contributions of a partnership (both sides read)',
  },
  {
    method: 'POST',
    path: '/partnerships/:id/in-kind',
    handler: createInKind,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Register an in-kind contribution (either side, PLANNED)',
  },
  {
    method: 'POST',
    path: '/in-kind-contributions/:id/transition',
    handler: transitionInKind,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'In-kind transition (delivery by either side, verify by officer)',
  },
];
