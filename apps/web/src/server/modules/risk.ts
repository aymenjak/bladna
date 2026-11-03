// Risk & incidents module (spec §48, §73).
//
// Signals are computed from real, persisted data only (report history, account
// age, trust level, prior suspensions, expired verifications, official-source
// flags, exact duplicates and a high-precision payment-phrase scan) and scored
// by @bladna/domain `assessRisk`. Every assessment is persisted; a re-compute
// only ever refreshes rows that no human has decided yet. Decisions are human,
// audited, and 'suspend' runs through the same state-machine effects as
// moderation.

import { getPrisma, type Prisma } from '@bladna/database';
import { assessRisk, type Permission, type RiskSignals, type TransitionMap } from '@bladna/domain';
import { AppError, TRUST_LEVELS } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  incidentSchema,
  incidentUpdateSchema,
  incidentsQuerySchema,
  moderationQueueQuerySchema,
  paginationQuerySchema,
  riskDecisionSchema,
  riskSignalsQuerySchema,
  uuidSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { requireSystemPermission } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { audit } from '../services/audit';
import { applyEffect } from './reports';
import type { AppRoute } from '../router';

type RiskTargetLiteral = 'USER' | 'ORGANIZATION' | 'OPPORTUNITY' | 'CAMPAIGN' | 'PAYMENT';
type IncidentStatusLiteral = 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'CLOSED';

/** Incident lifecycle: investigated, resolved, closed; RESOLVED may reopen. */
export const INCIDENT_TRANSITIONS: TransitionMap<IncidentStatusLiteral> = {
  OPEN: ['INVESTIGATING', 'RESOLVED', 'CLOSED'],
  INVESTIGATING: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED', 'INVESTIGATING'],
  CLOSED: [],
};

const incidentParamsSchema = z.object({ id: uuidSchema });

const ASSESSMENT_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  riskScore: true,
  riskLevel: true,
  reasons: true,
  recommendedAction: true,
  engineVersion: true,
  decidedById: true,
  decision: true,
  decisionNote: true,
  decidedAt: true,
  createdAt: true,
} as const satisfies Prisma.RiskAssessmentSelect;

const INCIDENT_SELECT = {
  id: true,
  type: true,
  severity: true,
  status: true,
  title: true,
  description: true,
  reporterId: true,
  reporter: { select: { id: true, firstName: true, lastName: true } },
  assignedToId: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  resolution: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
} as const satisfies Prisma.IncidentSelect;

/**
 * High-precision money-request phrases (EN/FR/AR). Matching any of these in
 * user-supplied content is real evidence of a payment solicitation; nothing is
 * ever inferred or invented.
 */
const SUSPICIOUS_PHRASES: readonly string[] = [
  'pay fee',
  'pay the fee',
  'registration fee',
  'application fee',
  'deposit fee',
  'send money',
  'transfer money',
  'wire transfer',
  'western union',
  'money order',
  'gift card',
  'crypto payment',
  'bitcoin',
  'frais d’inscription',
  "frais d'inscription",
  'frais d inscription',
  'virement bancaire',
  'envoyer de l’argent',
  "envoyer de l'argent",
  'de l’argent',
  'رسوم التسجيل',
  'ادفع رسوما',
  'حوّل المال',
  'تحويل بنكي',
  'أرسل المال',
  'ارسال المال',
];

function scanPaymentPhrases(text: string | null | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  return SUSPICIOUS_PHRASES.some((phrase) => normalized.includes(phrase));
}

function ageInDays(since: Date): number {
  return Math.max(0, Math.floor((Date.now() - since.getTime()) / 86_400_000));
}

async function reportCounts(
  targetType: 'USER' | 'ORGANIZATION' | 'OPPORTUNITY' | 'CAMPAIGN',
  targetId: string,
): Promise<{ reportCount: number; openReportCount: number }> {
  const prisma = getPrisma();
  const [reportCount, openReportCount] = await Promise.all([
    prisma.report.count({ where: { targetType, targetId } }),
    prisma.report.count({
      where: { targetType, targetId, status: { in: ['OPEN', 'INVESTIGATING'] } },
    }),
  ]);
  return { reportCount, openReportCount };
}

async function priorSuspensions(
  action: 'user.suspend' | 'organization.suspend',
  targetId: string,
): Promise<number> {
  return getPrisma().auditLog.count({
    where: {
      action,
      entityType: action === 'user.suspend' ? 'user' : 'organization',
      entityId: targetId,
    },
  });
}

/** True when another record carries the exact same (case-insensitive) title/name. */
async function exactDuplicateCount(
  model: 'organization' | 'campaign' | 'opportunity',
  id: string,
  field: string,
  value: string,
): Promise<number> {
  const prisma = getPrisma();
  const where = {
    id: { not: id },
    [field]: { equals: value, mode: 'insensitive' as const },
  };
  if (model === 'organization') {
    return prisma.organization.count({
      where: { ...where, deletedAt: null } as Prisma.OrganizationWhereInput,
    });
  }
  if (model === 'campaign') {
    return prisma.campaign.count({ where: where as Prisma.CampaignWhereInput });
  }
  return prisma.opportunity.count({
    where: { ...where, deletedAt: null } as Prisma.OpportunityWhereInput,
  });
}

async function computeSignals(
  targetType: RiskTargetLiteral,
  targetId: string,
): Promise<RiskSignals> {
  const prisma = getPrisma();

  if (targetType === 'PAYMENT') {
    throw AppError.notImplemented(
      'Payment risk signals are not computed in this build — payment review happens on the invoice/payment records themselves.',
    );
  }

  if (targetType === 'USER') {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, createdAt: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw AppError.notFound('User not found.');

    const memberships = await prisma.organizationMember.findMany({
      where: { userId: targetId },
      select: { organization: { select: { trustLevel: true } } },
    });
    const trustLevels = memberships.map((row) => row.organization.trustLevel);
    const bestIndex = trustLevels.reduce(
      (best, level) => Math.max(best, TRUST_LEVELS.indexOf(level)),
      -1,
    );
    const [counts, suspensions] = await Promise.all([
      reportCounts('USER', targetId),
      priorSuspensions('user.suspend', targetId),
    ]);

    const signals: RiskSignals = {
      organizationAgeDays: ageInDays(user.createdAt),
      priorSuspensionCount: suspensions,
      ...counts,
    };
    // No organization membership → no trust level → the domain rule records
    // its ORG_UNVERIFIED reason (never a fabricated score).
    if (bestIndex >= 0) signals.trustLevelIndex = bestIndex;
    return signals;
  }

  if (targetType === 'ORGANIZATION') {
    const organization = await prisma.organization.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, name: true, description: true, trustLevel: true, createdAt: true },
    });
    if (!organization) throw AppError.notFound('Organization not found.');

    const [counts, suspensions, expiredVerifications, expiredDocuments, duplicates] =
      await Promise.all([
        reportCounts('ORGANIZATION', targetId),
        priorSuspensions('organization.suspend', targetId),
        prisma.organizationVerification.count({
          where: { organizationId: targetId, status: 'EXPIRED' },
        }),
        prisma.verificationDocument.count({
          where: { organizationId: targetId, status: 'EXPIRED' },
        }),
        exactDuplicateCount('organization', targetId, 'name', organization.name),
      ]);

    const signals: RiskSignals = {
      organizationAgeDays: ageInDays(organization.createdAt),
      trustLevelIndex: TRUST_LEVELS.indexOf(organization.trustLevel),
      expiredDocumentCount: expiredVerifications + expiredDocuments,
      duplicateContentScore: duplicates > 0 ? 1 : 0,
      priorSuspensionCount: suspensions,
      ...counts,
    };
    const text = `${organization.name} ${organization.description ?? ''}`;
    if (scanPaymentPhrases(text)) signals.suspiciousPaymentRequest = true;
    return signals;
  }

  if (targetType === 'OPPORTUNITY') {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: targetId, deletedAt: null },
      select: {
        id: true,
        titleAr: true,
        titleEn: true,
        titleFr: true,
        descriptionAr: true,
        descriptionEn: true,
        descriptionFr: true,
        organizationId: true,
        source: { select: { official: true, verified: true } },
        organization: { select: { trustLevel: true, createdAt: true } },
      },
    });
    if (!opportunity) throw AppError.notFound('Opportunity not found.');

    const [counts, duplicates] = await Promise.all([
      reportCounts('OPPORTUNITY', targetId),
      exactDuplicateCount('opportunity', targetId, 'titleEn', opportunity.titleEn),
    ]);

    const signals: RiskSignals = {
      organizationAgeDays: ageInDays(opportunity.organization.createdAt),
      trustLevelIndex: TRUST_LEVELS.indexOf(opportunity.organization.trustLevel),
      duplicateContentScore: duplicates > 0 ? 1 : 0,
      ...counts,
    };
    if (opportunity.source?.official && opportunity.source.verified) {
      signals.sourceDomainOfficial = true;
    }
    const text = [
      opportunity.titleAr,
      opportunity.titleEn,
      opportunity.titleFr,
      opportunity.descriptionAr,
      opportunity.descriptionEn,
      opportunity.descriptionFr,
    ].join(' ');
    if (scanPaymentPhrases(text)) signals.suspiciousPaymentRequest = true;
    return signals;
  }

  // CAMPAIGN
  const campaign = await prisma.campaign.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      name: true,
      description: true,
      goal: true,
      organization: { select: { trustLevel: true, createdAt: true } },
    },
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');

  const [counts, duplicates] = await Promise.all([
    reportCounts('CAMPAIGN', targetId),
    exactDuplicateCount('campaign', targetId, 'name', campaign.name),
  ]);

  const campaignSignals: RiskSignals = {
    organizationAgeDays: ageInDays(campaign.organization.createdAt),
    trustLevelIndex: TRUST_LEVELS.indexOf(campaign.organization.trustLevel),
    duplicateContentScore: duplicates > 0 ? 1 : 0,
    ...counts,
  };
  const campaignText = `${campaign.name} ${campaign.description ?? ''} ${campaign.goal ?? ''}`;
  if (scanPaymentPhrases(campaignText)) campaignSignals.suspiciousPaymentRequest = true;
  return campaignSignals;
}

/** Compute a fresh assessment and persist it (decided rows are never touched). */
async function assessAndPersist(
  targetType: RiskTargetLiteral,
  targetId: string,
): Promise<{ assessment: Record<string, unknown>; signals: RiskSignals }> {
  const prisma = getPrisma();
  const signals = await computeSignals(targetType, targetId);
  const result = assessRisk(signals);
  const reasons = result.reasons.map((reason) => ({
    code: reason.code,
    weight: reason.weight,
    detail: reason.detail,
  }));

  const existing = await prisma.riskAssessment.findFirst({
    where: { targetType, targetId, decision: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });

  const data = {
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    reasons: reasons as Prisma.InputJsonValue,
    recommendedAction: result.recommendedAction,
  };

  const assessment = existing
    ? await prisma.riskAssessment.update({
        where: { id: existing.id },
        data,
        select: ASSESSMENT_SELECT,
      })
    : await prisma.riskAssessment.create({
        data: { targetType, targetId, ...data },
        select: ASSESSMENT_SELECT,
      });

  return { assessment, signals };
}

// ── Risk reads & decisions ─────────────────────────────────────

async function signals(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'risk.review');
  const f = query(ctx, riskSignalsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  if (f.targetType && f.targetId) {
    return assessAndPersist(f.targetType, f.targetId);
  }
  if (f.targetType || f.targetId) {
    throw AppError.validation('targetType and targetId must be provided together.', [
      {
        path: 'targetId',
        code: 'required',
        message: 'Provide both targetType and targetId, or neither.',
      },
    ]);
  }

  const where: Prisma.RiskAssessmentWhereInput = {};
  if (f.targetType) where.targetType = f.targetType;

  const [total, items] = await Promise.all([
    prisma.riskAssessment.count({ where }),
    prisma.riskAssessment.findMany({
      where,
      select: ASSESSMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function moderationQueue(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'risk.review');
  const f = query(ctx, moderationQueueQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.RiskAssessmentWhereInput = { decision: null };
  if (f.riskLevel) where.riskLevel = f.riskLevel;
  if (f.targetType) where.targetType = f.targetType;

  const [total, items] = await Promise.all([
    prisma.riskAssessment.count({ where }),
    prisma.riskAssessment.findMany({
      where,
      select: ASSESSMENT_SELECT,
      orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

function suspendPermission(targetType: RiskTargetLiteral): Permission {
  if (targetType === 'USER') return 'user.suspend';
  if (targetType === 'ORGANIZATION') return 'organization.suspend';
  if (targetType === 'OPPORTUNITY') return 'opportunity.moderate';
  return 'moderation.action';
}

async function decide(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'risk.review');
  const input = await body(ctx, riskDecisionSchema);
  const prisma = getPrisma();

  const assessment = await prisma.riskAssessment.findUnique({
    where: { id: input.assessmentId },
    select: {
      id: true,
      targetType: true,
      targetId: true,
      decision: true,
      riskScore: true,
      riskLevel: true,
    },
  });
  if (!assessment) throw AppError.notFound('Risk assessment not found.');
  if (assessment.decision) throw AppError.conflict('This assessment already has a decision.');

  const targetType = assessment.targetType as RiskTargetLiteral;

  // 'suspend' mutates the target → guard the effect's own permission up front.
  if (input.decision === 'suspend') {
    if (targetType === 'PAYMENT') {
      throw AppError.notImplemented('Payment suspension is not wired in this build.');
    }
    await requireSystemPermission(ctx, suspendPermission(targetType));
  }

  const note = input.note ?? null;
  const decidedAt = new Date();

  await prisma.$transaction(async (tx) => {
    if (input.decision === 'suspend') {
      // Re-checked here so the effect target narrows to TargetLiteral
      // (RiskTargetLiteral also contains PAYMENT, which has no effect path).
      if (targetType === 'PAYMENT') {
        throw AppError.notImplemented('Payment suspension is not wired in this build.');
      }
      await applyEffect(tx, {
        targetType,
        targetId: assessment.targetId,
        actorUserId: user.userId,
        resolution:
          note ?? `Risk suspension (score ${assessment.riskScore}, ${assessment.riskLevel}).`,
      });
    }
    await tx.riskAssessment.update({
      where: { id: assessment.id },
      data: { decidedById: user.userId, decision: input.decision, decisionNote: note, decidedAt },
    });
    await tx.adminAction.create({
      data: {
        adminUserId: user.userId,
        action: `risk.${input.decision}`,
        targetType: 'riskAssessment',
        targetId: assessment.id,
        reason: note,
        requestId: ctx.requestId,
      },
    });
  });

  await audit({
    actorUserId: user.userId,
    action: 'risk.decide',
    entityType: 'riskAssessment',
    entityId: assessment.id,
    before: { decision: null },
    after: {
      decision: input.decision,
      targetType,
      targetId: assessment.targetId,
      riskScore: assessment.riskScore,
      riskLevel: assessment.riskLevel,
      note,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  if (input.decision === 'suspend' && (targetType === 'USER' || targetType === 'ORGANIZATION')) {
    await audit({
      actorUserId: user.userId,
      action: targetType === 'USER' ? 'user.suspend' : 'organization.suspend',
      entityType: targetType === 'USER' ? 'user' : 'organization',
      entityId: assessment.targetId,
      after: { via: 'risk', assessmentId: assessment.id, reason: note },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }

  const updated = await prisma.riskAssessment.findUnique({
    where: { id: assessment.id },
    select: ASSESSMENT_SELECT,
  });
  return { assessment: updated };
}

// ── Incidents ──────────────────────────────────────────────────

async function listIncidents(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'risk.review');
  const f = query(ctx, incidentsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.IncidentWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.severity) where.severity = f.severity;
  if (f.type) where.type = f.type;

  const [total, items] = await Promise.all([
    prisma.incident.count({ where }),
    prisma.incident.findMany({
      where,
      select: INCIDENT_SELECT,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function createIncident(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'risk.review');
  const input = await body(ctx, incidentSchema);

  const incident = await getPrisma().incident.create({
    data: {
      type: input.type,
      severity: input.severity,
      title: input.title,
      description: input.description ?? null,
      reporterId: user.userId,
      status: 'OPEN' as const,
    },
    select: INCIDENT_SELECT,
  });
  await audit({
    actorUserId: user.userId,
    action: 'incident.create',
    entityType: 'incident',
    entityId: incident.id,
    after: { type: input.type, severity: input.severity, title: input.title },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { incident };
}

async function getIncident(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'risk.review');
  const { id } = pathParams(ctx, incidentParamsSchema);
  const incident = await getPrisma().incident.findUnique({
    where: { id },
    select: INCIDENT_SELECT,
  });
  if (!incident) throw AppError.notFound('Incident not found.');
  return { incident };
}

async function listIncidentEvents(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'risk.review');
  const { id } = pathParams(ctx, incidentParamsSchema);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const incident = await prisma.incident.findUnique({ where: { id }, select: { id: true } });
  if (!incident) throw AppError.notFound('Incident not found.');

  const where = { incidentId: id };
  const [total, items] = await Promise.all([
    prisma.incidentEvent.count({ where }),
    prisma.incidentEvent.findMany({
      where,
      select: { id: true, actorUserId: true, note: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function updateIncident(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'risk.review');
  const { id } = pathParams(ctx, incidentParamsSchema);
  const input = await body(ctx, incidentUpdateSchema);
  const prisma = getPrisma();

  const incident = await prisma.incident.findUnique({
    where: { id },
    select: { id: true, status: true, resolution: true },
  });
  if (!incident) throw AppError.notFound('Incident not found.');

  const target = input.status ?? incident.status;
  if (input.status && input.status !== incident.status) {
    assertTransitionLocal(INCIDENT_TRANSITIONS, incident.status, target, 'incident');
  }
  if (
    (target === 'RESOLVED' || target === 'CLOSED') &&
    !input.resolution?.trim() &&
    !incident.resolution?.trim()
  ) {
    throw AppError.validation('A resolution is required to resolve or close an incident.', [
      { path: 'resolution', code: 'required', message: 'Describe the resolution.' },
    ]);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.incident.update({
      where: { id },
      data: {
        status: target,
        resolution: input.resolution ?? undefined,
        resolvedAt:
          target === 'RESOLVED'
            ? new Date()
            : target === 'INVESTIGATING' || target === 'OPEN'
              ? null
              : incident.status === 'RESOLVED'
                ? undefined
                : undefined,
      },
      select: INCIDENT_SELECT,
    });
    await tx.incidentEvent.create({
      data: { incidentId: id, actorUserId: user.userId, note: input.note },
    });
    return row;
  });

  await audit({
    actorUserId: user.userId,
    action: 'incident.update',
    entityType: 'incident',
    entityId: id,
    before: { status: incident.status },
    after: { status: target, note: input.note, resolution: input.resolution ?? undefined },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { incident: updated };
}

// `assertTransition` lives in @bladna/domain — re-exported locally so the
// import list above stays focused on what this module composes.
import { assertTransition as assertTransitionLocal } from '@bladna/domain';

// ── Route table ─────────────────────────────────────────────────

export const riskRoutes: AppRoute[] = [
  // risk reads
  {
    method: 'GET',
    path: '/admin/moderation/queue',
    handler: moderationQueue,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Undecided risk assessments, highest score first (paginated)',
  },
  {
    method: 'GET',
    path: '/admin/risk/signals',
    handler: signals,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'List assessments, or compute+persist fresh signals for one target',
  },
  {
    method: 'POST',
    path: '/admin/risk/decisions',
    handler: decide,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Record a human risk decision (suspend runs state-machine effects)',
  },
  // incidents
  {
    method: 'GET',
    path: '/admin/incidents',
    handler: listIncidents,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Incident list (paginated, filterable)',
  },
  {
    method: 'POST',
    path: '/admin/incidents',
    handler: createIncident,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Report an incident (OPEN)',
  },
  {
    method: 'GET',
    path: '/admin/incidents/:id',
    handler: getIncident,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Incident detail',
  },
  {
    method: 'GET',
    path: '/admin/incidents/:id/events',
    handler: listIncidentEvents,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Incident timeline (paginated, append-only)',
  },
  {
    method: 'POST',
    path: '/admin/incidents/:id',
    handler: updateIncident,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Update incident status with a required timeline note',
  },
];
