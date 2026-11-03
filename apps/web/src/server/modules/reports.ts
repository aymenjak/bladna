// Reports / moderation module (spec §72–§73).
//
// Reporters never see who reviewed them, moderation hides the reporter from
// the target, every decision records an AdminAction + AuditLog entry, and
// SUSPEND/REMOVE_CONTENT effects run through the domain state machines inside
// one transaction (a failed effect rolls back the whole decision). WARN
// notifies the target's owner with trilingual copy AFTER the commit.

import { getPrisma, type Prisma } from '@bladna/database';
import {
  assertTransition,
  CERTIFICATE_TRANSITIONS,
  OPPORTUNITY_TRANSITIONS,
  type Permission,
  type TransitionMap,
} from '@bladna/domain';
import { AppError, parseReportTargetRef, type LocaleCode } from '@bladna/types';
import { buildPageMeta, maskEmail, normalizePageParams } from '@bladna/utils';
import {
  createReportSchema,
  paginationQuerySchema,
  reportParamsSchema,
  reportsQuerySchema,
  reviewReportSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { requireAuth, requireSystemPermission } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import { ORGANIZATION_STATUS_TRANSITIONS } from './admin';
import { CAMPAIGN_TRANSITIONS } from './campaigns';
import type { AppRoute } from '../router';

type ReportStatusLiteral = 'OPEN' | 'INVESTIGATING' | 'ACTION_TAKEN' | 'DISMISSED' | 'CLOSED';

/** Report lifecycle: reviewed, decided, and closable only from a decided state. */
export const REPORT_TRANSITIONS: TransitionMap<ReportStatusLiteral> = {
  OPEN: ['INVESTIGATING', 'ACTION_TAKEN', 'DISMISSED', 'CLOSED'],
  INVESTIGATING: ['ACTION_TAKEN', 'DISMISSED', 'CLOSED'],
  ACTION_TAKEN: ['CLOSED'],
  DISMISSED: ['CLOSED'],
  CLOSED: [],
};

type TargetLiteral =
  | 'USER'
  | 'ORGANIZATION'
  | 'OPPORTUNITY'
  | 'CAMPAIGN'
  | 'MESSAGE'
  | 'CERTIFICATE'
  | 'INTERNATIONAL_OPPORTUNITY';
type ReviewAction = 'NONE' | 'RESTRICT' | 'SUSPEND' | 'REMOVE_CONTENT' | 'WARN';

const TERMINAL_STATUSES: ReportStatusLiteral[] = ['ACTION_TAKEN', 'DISMISSED', 'CLOSED'];

const myReportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['OPEN', 'INVESTIGATING', 'ACTION_TAKEN', 'DISMISSED', 'CLOSED']).optional(),
});

const REPORT_SELECT = {
  id: true,
  reporterId: true,
  targetType: true,
  targetId: true,
  reason: true,
  description: true,
  status: true,
  assignedToId: true,
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  resolution: true,
  createdAt: true,
  resolvedAt: true,
} as const satisfies Prisma.ReportSelect;

const MY_REPORT_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  reason: true,
  description: true,
  status: true,
  createdAt: true,
} as const satisfies Prisma.ReportSelect;

const WARN_COPY: Record<LocaleCode, { title: string; body: string }> = {
  ar: {
    title: 'تنبيه من فريق الإشراف',
    body: 'تلقّيت تنبيهًا من فريق الإشراف على منصة بلادنا. يرجى الانتباه لقواعد المجتمع.',
  },
  fr: {
    title: 'Avertissement de modération',
    body: 'Vous avez reçu un avertissement de l’équipe de modération de Bladna. Merci de respecter les règles de la communauté.',
  },
  en: {
    title: 'Moderation warning',
    body: 'You have received a warning from the Bladna moderation team. Please follow the community guidelines.',
  },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Which extra system permission a moderation action needs (guards, not hand checks). */
function reviewPermission(action: ReviewAction, targetType: TargetLiteral): Permission | null {
  if (action === 'NONE') return null;
  if (action === 'WARN' || action === 'RESTRICT') return 'moderation.action';
  if (action === 'REMOVE_CONTENT') {
    if (targetType === 'USER' || targetType === 'ORGANIZATION') return null; // rejected below
    if (targetType === 'OPPORTUNITY') return 'opportunity.moderate';
    if (targetType === 'CERTIFICATE') return 'certificate.revoke:platform';
    return 'moderation.action';
  }
  // SUSPEND
  if (targetType === 'USER') return 'user.suspend';
  if (targetType === 'ORGANIZATION') return 'organization.suspend';
  if (targetType === 'OPPORTUNITY') return 'opportunity.moderate';
  if (targetType === 'CERTIFICATE') return 'certificate.revoke:platform';
  return 'moderation.action';
}

/**
 * Validate and canonicalize a pasted report target (P20). The parser accepts
 * app links and bare slugs — the public pages address content by slug, not by
 * uuid — picking the target type from the path when it recognizes one;
 * otherwise the form's choice stands. Non-uuid references resolve through the
 * slug column only (filtering a uuid column with free text would 500).
 */
async function resolveTarget(
  reporterId: string,
  inputTargetType: TargetLiteral,
  raw: string,
): Promise<{ targetType: TargetLiteral; targetId: string }> {
  const prisma = getPrisma();
  const parsed = parseReportTargetRef(raw);
  const targetType = (parsed.targetType as TargetLiteral | undefined) ?? inputTargetType;
  const ref = parsed.ref;
  const uuid = UUID_PATTERN.test(ref);

  if (targetType === 'INTERNATIONAL_OPPORTUNITY') {
    // The moderation pipeline has no effect branch for these yet — say so
    // instead of falling through to an unrelated "not found".
    throw AppError.validation('International opportunities cannot be reported yet.', [
      { path: 'targetType', code: 'unsupported', message: 'Choose another target type.' },
    ]);
  }

  if (targetType === 'CERTIFICATE') {
    const certificate = await prisma.volunteerCertificate.findFirst({
      where: uuid ? { OR: [{ id: ref }, { certificateNumber: ref }] } : { certificateNumber: ref },
      select: { id: true },
    });
    if (!certificate) throw AppError.notFound('Certificate not found.');
    return { targetType, targetId: certificate.id };
  }

  if ((targetType === 'USER' || targetType === 'MESSAGE') && !uuid) {
    throw AppError.validation('targetId must be a valid identifier for this target type.', [
      { path: 'targetId', code: 'invalid', message: `${targetType} targets use a uuid.` },
    ]);
  }

  if (targetType === 'USER') {
    if (ref === reporterId) {
      throw AppError.businessRule('You cannot report your own account.');
    }
    const user = await prisma.user.findUnique({
      where: { id: ref },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw AppError.notFound('User not found.');
    return { targetType, targetId: user.id };
  }

  if (targetType === 'ORGANIZATION') {
    const organization = await prisma.organization.findFirst({
      where: { ...(uuid ? { OR: [{ id: ref }, { slug: ref }] } : { slug: ref }), deletedAt: null },
      select: { id: true },
    });
    if (!organization) throw AppError.notFound('Organization not found.');
    return { targetType, targetId: organization.id };
  }

  if (targetType === 'OPPORTUNITY') {
    const opportunity = await prisma.opportunity.findFirst({
      where: { ...(uuid ? { OR: [{ id: ref }, { slug: ref }] } : { slug: ref }), deletedAt: null },
      select: { id: true },
    });
    if (!opportunity) throw AppError.notFound('Opportunity not found.');
    return { targetType, targetId: opportunity.id };
  }

  if (targetType === 'CAMPAIGN') {
    const campaign = await prisma.campaign.findFirst({
      where: uuid ? { OR: [{ id: ref }, { slug: ref }] } : { slug: ref },
      select: { id: true },
    });
    if (!campaign) throw AppError.notFound('Campaign not found.');
    return { targetType, targetId: campaign.id };
  }

  if (targetType === 'MESSAGE') {
    // Only conversation participants may report a message.
    const message = await prisma.message.findUnique({
      where: { id: ref },
      select: {
        id: true,
        deletedAt: true,
        conversation: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!message || message.deletedAt) throw AppError.notFound('Message not found.');
    const isMember = message.conversation.members.some((member) => member.userId === reporterId);
    if (!isMember)
      throw AppError.forbidden('You can only report messages from your own conversations.');
    return { targetType, targetId: message.id };
  }

  /* c8 ignore next 4 -- every TargetLiteral branch above is exhaustive */
  throw AppError.validation('targetId must be a valid identifier for this target type.', [
    { path: 'targetId', code: 'invalid', message: `${targetType} targets use a uuid.` },
  ]);
}

/** The user(s) that own a target — WARN copy is delivered to them, never the reporter. */
async function warnRecipients(targetType: TargetLiteral, targetId: string): Promise<string[]> {
  const prisma = getPrisma();

  if (targetType === 'USER') {
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw AppError.notFound('User not found.');
    return [user.id];
  }

  if (targetType === 'MESSAGE') {
    const message = await prisma.message.findUnique({
      where: { id: targetId },
      select: { id: true, senderId: true, deletedAt: true },
    });
    if (!message || message.deletedAt) throw AppError.notFound('Message not found.');
    return [message.senderId];
  }

  if (targetType === 'CERTIFICATE') {
    const certificate = await prisma.volunteerCertificate.findFirst({
      where: { id: targetId },
      select: { id: true, volunteerProfile: { select: { userId: true } } },
    });
    if (!certificate) throw AppError.notFound('Certificate not found.');
    return [certificate.volunteerProfile.userId];
  }

  let organizationId: string | null = null;
  if (targetType === 'ORGANIZATION') {
    const organization = await prisma.organization.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true },
    });
    if (!organization) throw AppError.notFound('Organization not found.');
    organizationId = organization.id;
  } else if (targetType === 'CAMPAIGN') {
    const campaign = await prisma.campaign.findUnique({
      where: { id: targetId },
      select: { organizationId: true },
    });
    if (!campaign) throw AppError.notFound('Campaign not found.');
    organizationId = campaign.organizationId;
  } else if (targetType === 'OPPORTUNITY') {
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { organizationId: true },
    });
    if (!opportunity) throw AppError.notFound('Opportunity not found.');
    organizationId = opportunity.organizationId;
  }

  if (!organizationId) return [];
  const owners = await prisma.organizationMember.findMany({
    where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
    select: { userId: true },
  });
  return owners.map((owner) => owner.userId);
}

// ── Reporter side ──────────────────────────────────────────────

async function create(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, createReportSchema);
  const prisma = getPrisma();

  const { targetType, targetId } = await resolveTarget(
    user.userId,
    input.targetType as TargetLiteral,
    input.targetId,
  );

  const duplicate = await prisma.report.findFirst({
    where: {
      reporterId: user.userId,
      targetType,
      targetId,
      status: { in: ['OPEN', 'INVESTIGATING'] },
    },
    select: { id: true },
  });
  if (duplicate) throw AppError.conflict('You already have an open report for this target.');

  const report = await prisma.report.create({
    data: {
      reporterId: user.userId,
      targetType,
      targetId,
      reason: input.reason,
      description: input.description ?? null,
      status: 'OPEN' as const,
    },
    select: MY_REPORT_SELECT,
  });
  await audit({
    actorUserId: user.userId,
    action: 'report.create',
    entityType: 'report',
    entityId: report.id,
    after: { targetType, targetId, reason: input.reason },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { report };
}

async function myReports(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, myReportsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.ReportWhereInput = { reporterId: user.userId };
  if (f.status) where.status = f.status;

  const [total, items] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      select: MY_REPORT_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Reviewer side ──────────────────────────────────────────────

function maskReporter<
  T extends { reporter: { id: string; email: string; firstName: string; lastName: string } | null },
>(row: T): Record<string, unknown> {
  const { reporter, ...rest } = row;
  return {
    ...rest,
    reporter: reporter ? { ...reporter, email: maskEmail(reporter.email) } : null,
  };
}

const REPORT_LIST_SELECT = {
  ...REPORT_SELECT,
  reporter: { select: { id: true, email: true, firstName: true, lastName: true } },
} as const satisfies Prisma.ReportSelect;

async function list(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'report.review');
  const f = query(ctx, reportsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.ReportWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.targetType) where.targetType = f.targetType;
  if (f.assignedToMe === 'true') where.assignedToId = user.userId;

  const [total, rows] = await Promise.all([
    prisma.report.count({ where }),
    prisma.report.findMany({
      where,
      select: REPORT_LIST_SELECT,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items: rows.map(maskReporter), meta: buildPageMeta(total, { page, limit }) };
}

async function detail(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'report.review');
  const { id } = pathParams(ctx, reportParamsSchema);
  const row = await getPrisma().report.findUnique({
    where: { id },
    select: REPORT_LIST_SELECT,
  });
  if (!row) throw AppError.notFound('Report not found.');
  return { report: maskReporter(row) };
}

interface EffectContext {
  targetType: TargetLiteral;
  targetId: string;
  actorUserId: string;
  resolution: string;
}

/** Applies a SUSPEND/REMOVE_CONTENT decision to the concrete target. Exported for the risk engine. */
export async function applyEffect(
  tx: Prisma.TransactionClient,
  effect: EffectContext,
): Promise<void> {
  const { targetType, targetId, actorUserId, resolution } = effect;

  if (targetType === 'USER') {
    const user = await tx.user.findUnique({
      where: { id: targetId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw AppError.notFound('User not found.');
    await tx.user.update({
      where: { id: targetId },
      data: { status: 'SUSPENDED', suspendReason: resolution, suspendedUntil: null },
    });
    return;
  }

  if (targetType === 'ORGANIZATION') {
    const organization = await tx.organization.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!organization) throw AppError.notFound('Organization not found.');
    assertTransition(
      ORGANIZATION_STATUS_TRANSITIONS,
      organization.status,
      'SUSPENDED',
      'organization',
    );
    await tx.organization.update({
      where: { id: targetId },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendReason: resolution },
    });
    return;
  }

  if (targetType === 'OPPORTUNITY') {
    const opportunity = await tx.opportunity.findFirst({
      where: { id: targetId, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!opportunity) throw AppError.notFound('Opportunity not found.');
    assertTransition(OPPORTUNITY_TRANSITIONS, opportunity.status, 'SUSPENDED', 'opportunity');
    await tx.opportunity.update({ where: { id: targetId }, data: { status: 'SUSPENDED' } });
    return;
  }

  if (targetType === 'CAMPAIGN') {
    const campaign = await tx.campaign.findUnique({
      where: { id: targetId },
      select: { id: true, status: true },
    });
    if (!campaign) throw AppError.notFound('Campaign not found.');
    assertTransition(CAMPAIGN_TRANSITIONS, campaign.status, 'CANCELLED', 'campaign');
    await tx.campaign.update({ where: { id: targetId }, data: { status: 'CANCELLED' } });
    return;
  }

  if (targetType === 'MESSAGE') {
    const message = await tx.message.findUnique({
      where: { id: targetId },
      select: { id: true, deletedAt: true },
    });
    if (!message || message.deletedAt) throw AppError.notFound('Message not found.');
    await tx.message.update({ where: { id: targetId }, data: { deletedAt: new Date() } });
    return;
  }

  // CERTIFICATE — revoke with an auditable trail on the certificate row itself.
  const certificate = await tx.volunteerCertificate.findFirst({
    where: { id: targetId },
    select: { id: true, status: true },
  });
  if (!certificate) throw AppError.notFound('Certificate not found.');
  assertTransition(CERTIFICATE_TRANSITIONS, certificate.status, 'REVOKED', 'certificate');
  await tx.volunteerCertificate.update({
    where: { id: targetId },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokedById: actorUserId,
      revokeReason: resolution,
    },
  });
}

async function review(ctx: RequestContext): Promise<unknown> {
  const reviewer = await requireSystemPermission(ctx, 'report.review');
  const { id } = pathParams(ctx, reportParamsSchema);
  const input = await body(ctx, reviewReportSchema);

  const action = input.action as ReviewAction;
  const status = input.status as ReportStatusLiteral;

  const prisma = getPrisma();
  const report = await prisma.report.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      targetType: true,
      targetId: true,
      resolution: true,
      reporterId: true,
    },
  });
  if (!report) throw AppError.notFound('Report not found.');
  const targetType = report.targetType as TargetLiteral;

  if (action === 'REMOVE_CONTENT' && (targetType === 'USER' || targetType === 'ORGANIZATION')) {
    throw AppError.businessRule(
      'REMOVE_CONTENT applies to content targets — use SUSPEND for users and organizations.',
    );
  }

  // Every permission decision is a guard: report.review first, then the
  // permission the concrete effect requires.
  const permission = reviewPermission(action, targetType);
  if (permission) await requireSystemPermission(ctx, permission);

  if ((action !== 'NONE' || status === 'ACTION_TAKEN') && !input.resolution?.trim()) {
    throw AppError.validation('A resolution is required for this decision.', [
      { path: 'resolution', code: 'required', message: 'Explain the decision.' },
    ]);
  }

  assertTransition(REPORT_TRANSITIONS, report.status, status, 'report');

  // Recipients are resolved (and target existence validated) before the
  // transaction so permission/existence failures never reach the write path.
  const recipients = action === 'WARN' ? await warnRecipients(targetType, report.targetId) : [];
  const resolution = input.resolution ?? report.resolution;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.report.update({
      where: { id },
      data: {
        status,
        resolution: input.resolution ?? undefined,
        assignedToId: reviewer.userId,
        resolvedAt: TERMINAL_STATUSES.includes(status) ? new Date() : null,
      },
      select: REPORT_SELECT,
    });

    if (action === 'SUSPEND' || action === 'REMOVE_CONTENT') {
      await applyEffect(tx, {
        targetType,
        targetId: report.targetId,
        actorUserId: reviewer.userId,
        resolution: resolution ?? 'No resolution recorded.',
      });
    }

    await tx.adminAction.create({
      data: {
        adminUserId: reviewer.userId,
        action: `report.${action.toLowerCase()}`,
        targetType: 'report',
        targetId: id,
        reason: resolution ?? null,
        notes: `status=${status}`,
        requestId: ctx.requestId,
      },
    });

    return row;
  });

  // Main decision audit + a dedicated entry for suspensions so the risk
  // engine's prior-suspension signal can count them.
  await audit({
    actorUserId: reviewer.userId,
    action: 'report.review',
    entityType: 'report',
    entityId: id,
    before: { status: report.status },
    after: {
      status,
      action,
      targetType,
      targetId: report.targetId,
      resolution: resolution ?? null,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  if (action === 'SUSPEND' && targetType === 'USER') {
    await audit({
      actorUserId: reviewer.userId,
      action: 'user.suspend',
      entityType: 'user',
      entityId: report.targetId,
      after: { via: 'report', reportId: id, reason: resolution ?? null },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }
  if (action === 'SUSPEND' && targetType === 'ORGANIZATION') {
    await audit({
      actorUserId: reviewer.userId,
      action: 'organization.suspend',
      entityType: 'organization',
      entityId: report.targetId,
      after: { via: 'report', reportId: id, reason: resolution ?? null },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }

  // WARN delivers after the commit; notification failures never fail the review.
  if (action === 'WARN' && recipients.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: recipients }, deletedAt: null },
      select: { id: true, preferredLanguage: true },
    });
    for (const recipient of users) {
      const copy =
        WARN_COPY[(recipient.preferredLanguage as string).toLowerCase() as LocaleCode] ??
        WARN_COPY.en;
      try {
        await notify({
          userId: recipient.id,
          type: 'SYSTEM',
          title: copy.title,
          body: copy.body,
          data: { reportId: id, targetType, action: 'WARN' },
        });
      } catch (error) {
        console.warn('[reports] WARN notification failed', {
          reportId: id,
          userId: recipient.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { report: updated };
}

// ── Route table ─────────────────────────────────────────────────

export const reportRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/reports',
    handler: list,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Moderation report queue (reporter masked, paginated)',
  },
  {
    method: 'POST',
    path: '/reports',
    handler: create,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Report content or a user (one open report per target)',
  },
  {
    method: 'GET',
    path: '/reports/:id',
    handler: detail,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Report detail (reporter masked)',
  },
  {
    method: 'POST',
    path: '/reports/:id/review',
    handler: review,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Decide a report (state machine + audited effects)',
  },
  {
    method: 'GET',
    path: '/me/reports',
    handler: myReports,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Reports I filed (no internal resolution fields)',
  },
];
