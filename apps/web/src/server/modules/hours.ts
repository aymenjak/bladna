// Volunteer hours module (spec §28, §107).
//
// Hours are append-only facts: they only move through HOUR_TRANSITIONS
// (PENDING → VERIFIED/REJECTED, REJECTED → PENDING, VERIFIED → REVOKED).
// Deciding a record stamps the reviewer and (on reject) the reason; revoking
// verified hours requires a reason and may append a correction record that
// supersedes the revoked row — the revoked row itself is never edited away.
// Every decision audits the tenant and notifies the volunteer in their locale.

import { getPrisma, type Prisma } from '@bladna/database';
import { HOUR_TRANSITIONS, assertTransition } from '@bladna/domain';
import { AppError, isAppError, type HourStatus, type LocaleCode } from '@bladna/types';
import { buildPageMeta, maskEmail, normalizePageParams, resolveLocale } from '@bladna/utils';
import {
  hoursQuerySchema,
  revokeHourSchema,
  uuidSchema,
  verifyHoursSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireOrgMembership, requireSystemPermission } from '../guards';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

const orgParamsSchema = z.object({ orgId: uuidSchema });
const hourParamsSchema = z.object({ orgId: uuidSchema, hourId: uuidSchema });

/** Single-record verify body (bulk goes through verifyHoursSchema). */
const verifyHourBodySchema = z.object({
  action: z.enum(['VERIFY', 'REJECT']),
  reason: z.string().trim().max(1000).optional(),
});

type HourNoticeKey = 'verified' | 'rejected' | 'revoked';

/** Trilingual notification copy — placeholders `{hours}` and `{reason}`. */
const HOUR_NOTICE: Record<HourNoticeKey, Record<LocaleCode, { title: string; body: string }>> = {
  verified: {
    ar: { title: 'تم اعتماد ساعاتك', body: 'تم اعتماد {hours} ساعة تطوّع وإضافتها إلى سجلك.' },
    fr: {
      title: 'Heures validées',
      body: '{hours} heures de bénévolat ont été validées et ajoutées à votre historique.',
    },
    en: {
      title: 'Hours verified',
      body: '{hours} volunteer hours were verified and added to your record.',
    },
  },
  rejected: {
    ar: { title: 'تم رفض ساعاتك', body: 'تم رفض ساعاتك المؤرشفة. السبب: {reason}' },
    fr: { title: 'Heures refusées', body: 'Vos heures ont été refusées. Motif : {reason}' },
    en: { title: 'Hours rejected', body: 'Your submitted hours were rejected. Reason: {reason}' },
  },
  revoked: {
    ar: { title: 'تم إلغاء ساعات معتمدة', body: 'أُلغيت ساعات معتمدة ранее. السبب: {reason}' },
    fr: {
      title: 'Heures révoquées',
      body: 'Des heures précédemment validées ont été révoquées. Motif : {reason}',
    },
    en: {
      title: 'Hours revoked',
      body: 'Previously verified hours were revoked. Reason: {reason}',
    },
  },
};

const HOUR_NOTICE_TYPE: Record<HourNoticeKey, 'HOURS_VERIFIED' | 'HOURS_REJECTED' | 'SYSTEM'> = {
  verified: 'HOURS_VERIFIED',
  rejected: 'HOURS_REJECTED',
  revoked: 'SYSTEM',
};

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(`{${key}}`, value);
  }
  return out;
}

const HOUR_SELECT = {
  id: true,
  volunteerProfileId: true,
  organizationId: true,
  activityId: true,
  attendanceId: true,
  hours: true,
  date: true,
  status: true,
  source: true,
  verifiedById: true,
  verifiedAt: true,
  rejectReason: true,
  revokedAt: true,
  revokeReason: true,
  supersedesId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.VolunteerHourSelect;

const HOUR_LIST_SELECT = {
  ...HOUR_SELECT,
  volunteerProfile: {
    select: {
      id: true,
      volunteerId: true,
      publicEmail: true,
      user: { select: { firstName: true, lastName: true, email: true, profileImage: true } },
    },
  },
} as const satisfies Prisma.VolunteerHourSelect;

type HourRow = Prisma.VolunteerHourGetPayload<{ select: typeof HOUR_SELECT }>;
type HourListRow = Prisma.VolunteerHourGetPayload<{ select: typeof HOUR_LIST_SELECT }>;

function serializeHour(row: HourRow | HourListRow): Record<string, unknown> {
  const { hours, ...rest } = row;
  const profile = 'volunteerProfile' in row ? row.volunteerProfile : null;
  return {
    ...rest,
    hours: hours.toNumber(),
    ...(profile
      ? {
          volunteerProfile: {
            id: profile.id,
            volunteerId: profile.volunteerId,
            user: {
              ...profile.user,
              // Applicant-style privacy: emails stay masked unless the volunteer opted in.
              email: profile.publicEmail ? profile.user.email : maskEmail(profile.user.email),
            },
          },
        }
      : {}),
  };
}

/** Resolve the tenant-scoped hour row (404 when it belongs to another org). */
async function loadHour(orgId: string, hourId: string): Promise<HourRow> {
  const record = await getPrisma().volunteerHour.findFirst({
    where: { id: hourId, organizationId: orgId },
    select: HOUR_SELECT,
  });
  if (!record) throw AppError.notFound('Hour record not found.');
  return record;
}

async function notifyHourDecision(
  volunteerProfileId: string,
  kind: HourNoticeKey,
  vars: Record<string, string>,
): Promise<void> {
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { id: volunteerProfileId },
    select: { user: { select: { id: true, preferredLanguage: true } } },
  });
  if (!profile) return;
  const locale = resolveLocale(profile.user.preferredLanguage.toLowerCase());
  const copy = HOUR_NOTICE[kind][locale];
  await notify({
    userId: profile.user.id,
    type: HOUR_NOTICE_TYPE[kind],
    title: copy.title,
    body: fill(copy.body, vars),
    data: { volunteerProfileId, kind, ...vars },
  });
}

/** Apply one VERIFY/REJECT decision through the state machine. */
async function applyDecision(
  ctx: RequestContext,
  orgId: string,
  actorUserId: string,
  record: HourRow,
  action: 'VERIFY' | 'REJECT',
  reason: string | undefined,
): Promise<HourRow> {
  if (action === 'REJECT' && !reason?.trim()) {
    throw AppError.validation('A reason is required when rejecting hours.');
  }
  const target: HourStatus = action === 'VERIFY' ? 'VERIFIED' : 'REJECTED';
  assertTransition(HOUR_TRANSITIONS, record.status, target, 'hour record');

  const prisma = getPrisma();
  const updated = await prisma.volunteerHour.update({
    where: { id: record.id },
    data: {
      status: target,
      verifiedById: actorUserId,
      ...(target === 'VERIFIED'
        ? { verifiedAt: new Date(), rejectReason: null }
        : { rejectReason: reason ?? null }),
    },
    select: HOUR_SELECT,
  });

  await audit({
    actorUserId,
    organizationId: orgId,
    action: target === 'VERIFIED' ? 'hours.verify' : 'hours.reject',
    entityType: 'volunteerHour',
    entityId: record.id,
    before: { status: record.status },
    after: { status: target, hours: record.hours.toNumber(), reason: reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  await notifyHourDecision(
    record.volunteerProfileId,
    target === 'VERIFIED' ? 'verified' : 'rejected',
    target === 'VERIFIED' ? { hours: record.hours.toFixed(2) } : { reason: reason?.trim() || '—' },
  );

  return updated;
}

// ── Volunteer side ─────────────────────────────────────────────

async function myHours(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'hours.read:own');
  const f = query(ctx, hoursQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const hasRange = f.from !== undefined || f.to !== undefined;
  const dateFilter: Prisma.DateTimeFilter = {
    ...(f.from ? { gte: f.from } : {}),
    ...(f.to ? { lte: f.to } : {}),
  };
  const where: Prisma.VolunteerHourWhereInput = {
    // Always own rows; organizationId only narrows within them.
    volunteerProfileId: profile.id,
    ...(f.organizationId ? { organizationId: f.organizationId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(hasRange ? { date: dateFilter } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.volunteerHour.count({ where }),
    prisma.volunteerHour.findMany({
      where,
      select: HOUR_SELECT,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items: rows.map(serializeHour), meta: buildPageMeta(total, { page, limit }) };
}

// ── Organization side ──────────────────────────────────────────

async function orgHours(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParamsSchema);
  await requireOrgMembership(ctx, 'hours.verify', { orgId });
  const f = query(ctx, hoursQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const hasRange = f.from !== undefined || f.to !== undefined;
  const dateFilter: Prisma.DateTimeFilter = {
    ...(f.from ? { gte: f.from } : {}),
    ...(f.to ? { lte: f.to } : {}),
  };
  const where: Prisma.VolunteerHourWhereInput = {
    // Tenancy comes from the path, never from the query string.
    organizationId: orgId,
    ...(f.status ? { status: f.status } : {}),
    ...(hasRange ? { date: dateFilter } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.volunteerHour.count({ where }),
    prisma.volunteerHour.findMany({
      where,
      select: HOUR_LIST_SELECT,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items: rows.map(serializeHour), meta: buildPageMeta(total, { page, limit }) };
}

async function bulkVerify(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParamsSchema);
  const org = await requireOrgMembership(ctx, 'hours.verify', { orgId });
  const input = await body(ctx, verifyHoursSchema);
  if (input.action === 'REJECT' && !input.reason?.trim()) {
    throw AppError.validation('A reason is required when rejecting hours.');
  }

  const prisma = getPrisma();
  const results: Array<{ id: string; status: 'ok' | 'not_found' | 'conflict' | 'error' }> = [];
  let verified = 0;
  let rejected = 0;

  for (const hourId of input.hourIds) {
    try {
      const record = await prisma.volunteerHour.findFirst({
        where: { id: hourId, organizationId: orgId },
        select: HOUR_SELECT,
      });
      if (!record) {
        results.push({ id: hourId, status: 'not_found' });
        continue;
      }
      await applyDecision(ctx, orgId, org.user.userId, record, input.action, input.reason);
      results.push({ id: hourId, status: 'ok' });
      if (input.action === 'VERIFY') verified += 1;
      else rejected += 1;
    } catch (error) {
      if (isAppError(error) && error.code === 'CONFLICT')
        results.push({ id: hourId, status: 'conflict' });
      else if (isAppError(error) && error.code === 'BUSINESS_RULE_ERROR')
        results.push({ id: hourId, status: 'conflict' });
      else if (isAppError(error) && error.code === 'NOT_FOUND')
        results.push({ id: hourId, status: 'not_found' });
      else results.push({ id: hourId, status: 'error' });
    }
  }

  return { results, verified, rejected };
}

async function verifyOne(ctx: RequestContext): Promise<unknown> {
  const { orgId, hourId } = pathParams(ctx, hourParamsSchema);
  const org = await requireOrgMembership(ctx, 'hours.verify', { orgId });
  const input = await body(ctx, verifyHourBodySchema);
  const record = await loadHour(orgId, hourId);
  const updated = await applyDecision(
    ctx,
    orgId,
    org.user.userId,
    record,
    input.action,
    input.reason,
  );
  return { hour: serializeHour(updated) };
}

async function revokeHour(ctx: RequestContext): Promise<unknown> {
  const { orgId, hourId } = pathParams(ctx, hourParamsSchema);
  const org = await requireOrgMembership(ctx, 'hours.revoke', { orgId });
  const input = await body(ctx, revokeHourSchema);
  const prisma = getPrisma();
  const record = await loadHour(orgId, hourId);

  // Only VERIFIED hours can be revoked; anything else is a state-machine error.
  assertTransition(HOUR_TRANSITIONS, record.status, 'REVOKED', 'hour record');

  const revokedAt = new Date();
  const correction = await prisma.$transaction(async (tx) => {
    await tx.volunteerHour.update({
      where: { id: record.id },
      data: {
        status: 'REVOKED',
        revokedAt,
        revokeReason: input.reason,
        verifiedById: org.user.userId,
      },
    });
    if (!input.correction) return null;
    // Append-only correction: the new row points at the record it supersedes.
    return tx.volunteerHour.create({
      data: {
        volunteerProfileId: record.volunteerProfileId,
        organizationId: orgId,
        activityId: record.activityId,
        hours: input.correction.hours,
        date: input.correction.date,
        status: 'PENDING',
        source: 'MANUAL',
        supersedesId: record.id,
      },
      select: HOUR_SELECT,
    });
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: orgId,
    action: 'hours.revoke',
    entityType: 'volunteerHour',
    entityId: record.id,
    before: { status: record.status, hours: record.hours.toNumber() },
    after: {
      status: 'REVOKED',
      reason: input.reason,
      correction: correction
        ? { hourId: correction.id, hours: correction.hours.toNumber(), date: correction.date }
        : null,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  await notifyHourDecision(record.volunteerProfileId, 'revoked', { reason: input.reason });

  const updated = await prisma.volunteerHour.findUniqueOrThrow({
    where: { id: record.id },
    select: HOUR_SELECT,
  });
  return {
    hour: serializeHour(updated),
    correction: correction ? serializeHour(correction) : null,
  };
}

// ── Route table ────────────────────────────────────────────────

export const hourRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/me/hours',
    handler: myHours,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'List own volunteer hours (paginated, filterable)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/hours',
    handler: orgHours,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "List the organization's volunteer hours (paginated)",
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/hours/verify',
    handler: bulkVerify,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Bulk verify or reject hour records (state machine, per-row results)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/hours/:hourId/verify',
    handler: verifyOne,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Verify or reject a single hour record',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/hours/:hourId/revoke',
    handler: revokeHour,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Revoke verified hours with a reason (optional appended correction)',
  },
];
