// Attendance module (spec §26, §72, §107).
//
// QR check-in sessions issue signed, expiring tokens; reissuing rotates the
// stored hash so previously handed-out QR images stop verifying. Consumption
// validates the signature, kind, expiry, rotation hash, revocation and the
// session window server-side; the [sessionId, volunteerProfileId] unique
// constraint turns a replayed scan into a 409. Manual entries are
// duplicate-checked per opportunity + volunteer + day (the schema has no day
// uniqueness) and the free-text note only survives in audit metadata.
// Confirmation derives tenancy from the record's organization — never from
// the body — and appends a PENDING VolunteerHour: hours only ever become
// VERIFIED through the hours module's state machine.

import { randomUUID } from 'node:crypto';
import { hashToken } from '@bladna/auth';
import { getPrisma, type Prisma } from '@bladna/database';
import { AppError, type LocaleCode } from '@bladna/types';
import {
  buildPageMeta,
  maskEmail,
  normalizePageParams,
  pickLocalized,
  resolveLocale,
} from '@bladna/utils';
import {
  attendanceQuerySchema,
  checkInByQrSchema,
  confirmAttendanceSchema,
  createAttendanceSessionSchema,
  idParamsSchema,
  manualAttendanceSchema,
  paginationQuerySchema,
  uuidSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { body, originFor, pathParams, query, type RequestContext } from '../http';
import { requireAuth, requireOrgMembership, requireSystemPermission } from '../guards';
import { encodeQrToken, qrToDataUrl, verifyQrToken } from '../infra/qr';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });

const sessionsListQuerySchema = paginationQuerySchema.extend({
  orgId: uuidSchema.optional(),
  opportunityId: uuidSchema.optional(),
});

const attendanceListQuerySchema = attendanceQuerySchema.extend({
  orgId: uuidSchema.optional(),
});

const reissueQrSchema = z.object({
  ttlSeconds: z.number().int().min(30).max(86400).default(900),
});

const SESSION_SELECT = {
  id: true,
  name: true,
  startsAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  createdById: true,
  opportunityId: true,
} as const satisfies Prisma.AttendanceSessionSelect;

const SESSION_LIST_SELECT = {
  ...SESSION_SELECT,
  opportunity: {
    select: {
      id: true,
      slug: true,
      titleAr: true,
      titleFr: true,
      titleEn: true,
      organizationId: true,
    },
  },
  _count: { select: { attendance: true } },
} as const satisfies Prisma.AttendanceSessionSelect;

const ATTENDANCE_SELECT = {
  id: true,
  status: true,
  method: true,
  date: true,
  checkInAt: true,
  checkOutAt: true,
  hours: true,
  rejectReason: true,
  verifiedById: true,
  sessionId: true,
  activityId: true,
  volunteerProfileId: true,
  opportunityId: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.AttendanceSelect;

const ATTENDANCE_LIST_SELECT = {
  ...ATTENDANCE_SELECT,
  volunteerProfile: {
    select: {
      id: true,
      volunteerId: true,
      publicEmail: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, profileImage: true },
      },
    },
  },
  opportunity: {
    select: {
      id: true,
      slug: true,
      organizationId: true,
      titleAr: true,
      titleFr: true,
      titleEn: true,
    },
  },
  session: { select: { id: true, name: true } },
  hour: { select: { id: true, status: true } },
} as const satisfies Prisma.AttendanceSelect;

type AttendanceNoticeKey = 'confirmed' | 'rejected';

/** Trilingual notification copy — placeholders `{opportunity}`, `{hours}`, `{reason}`. */
const NOTICE: Record<AttendanceNoticeKey, Record<LocaleCode, { title: string; body: string }>> = {
  confirmed: {
    ar: {
      title: 'تم تسجيل حضورك',
      body: 'تم تأكيد حضورك في "{opportunity}" ({hours} ساعة). ستُوثَّق الساعات بعد مراجعة المنظمة.',
    },
    fr: {
      title: 'Présence confirmée',
      body: 'Votre présence pour « {opportunity} » est confirmée ({hours} heures). Les heures seront validées après examen par l’organisation.',
    },
    en: {
      title: 'Attendance confirmed',
      body: 'Your attendance for "{opportunity}" is confirmed ({hours} hours). Hours will be verified after the organization reviews them.',
    },
  },
  rejected: {
    ar: { title: 'تم رفض تسجيل الحضور', body: 'تم رفض حضورك في "{opportunity}". السبب: {reason}' },
    fr: {
      title: 'Présence refusée',
      body: 'Votre présence pour « {opportunity} » a été refusée. Motif : {reason}',
    },
    en: {
      title: 'Attendance rejected',
      body: 'Your attendance for "{opportunity}" was rejected. Reason: {reason}',
    },
  },
};

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(`{${key}}`, value);
  }
  return out;
}

function startOfDay(value: Date): Date {
  const day = new Date(value);
  day.setHours(0, 0, 0, 0);
  return day;
}

/**
 * Token payload: `sessionId|expEpochMs`. The expiry is capped by the session's
 * own expiresAt; a reissue changes exp (and therefore the signature) so the
 * stored hash rotates and old images stop verifying. The QR *image* encodes
 * `checkInUrlFor(token)` — the public check-in landing URL — so a phone camera
 * scan opens the page instead of showing opaque token text.
 */
function buildSessionToken(
  sessionId: string,
  sessionExpiresAt: Date,
  ttlSeconds: number,
): { token: string; exp: number } {
  const exp = Math.min(Date.now() + ttlSeconds * 1000, sessionExpiresAt.getTime());
  return { token: encodeQrToken('attendance', `${sessionId}|${exp}`), exp };
}

/** Public landing URL the session QR encodes (on the origin the caller is
 *  using — the public domain behind the proxy, localhost in dev); the proxy
 *  prefixes the locale. */
function checkInUrlFor(ctx: RequestContext, token: string): string {
  return `${originFor(ctx.request)}/check-in?token=${encodeURIComponent(token)}`;
}

async function notifyAttendee(
  volunteerProfileId: string,
  key: AttendanceNoticeKey,
  opportunityTitle: string,
  data: Record<string, string>,
): Promise<void> {
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { id: volunteerProfileId },
    select: { user: { select: { id: true, preferredLanguage: true } } },
  });
  if (!profile) return;
  const locale = resolveLocale(profile.user.preferredLanguage.toLowerCase());
  const copy = NOTICE[key][locale];
  const vars = { opportunity: opportunityTitle, ...data };
  await notify({
    userId: profile.user.id,
    type: 'SYSTEM',
    title: copy.title,
    body: fill(copy.body, vars),
    data: { opportunityTitle, ...data },
  });
}

// ── Organization side: sessions ────────────────────────────────

async function createSession(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, createAttendanceSessionSchema);
  const prisma = getPrisma();

  // Tenancy comes from the referenced opportunity, never from the body.
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: input.opportunityId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');
  const org = await requireOrgMembership(ctx, 'attendance.create', {
    orgId: opportunity.organizationId,
  });

  if (input.expiresAt.getTime() <= Date.now()) {
    throw AppError.validation('The session expiry must be in the future.');
  }

  // The id must exist before insert: tokenHash is required at creation.
  const sessionId = randomUUID();
  const { token } = buildSessionToken(sessionId, input.expiresAt, input.ttlSeconds);
  const session = await prisma.attendanceSession.create({
    data: {
      id: sessionId,
      opportunityId: opportunity.id,
      name: input.name,
      tokenHash: hashToken(token),
      startsAt: input.startsAt,
      expiresAt: input.expiresAt,
      createdById: org.user.userId,
    },
    select: SESSION_SELECT,
  });
  const checkInUrl = checkInUrlFor(ctx, token);
  const qrDataUrl = await qrToDataUrl(checkInUrl);

  await audit({
    actorUserId: org.user.userId,
    organizationId: opportunity.organizationId,
    action: 'attendance.session_create',
    entityType: 'attendanceSession',
    entityId: session.id,
    after: {
      name: session.name,
      opportunityId: session.opportunityId,
      expiresAt: session.expiresAt,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { session, qrDataUrl, checkInUrl };
}

async function listSessions(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'attendance.create');
  const f = query(ctx, sessionsListQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.AttendanceSessionWhereInput = {
    opportunity: { organizationId: org.orgId },
    ...(f.opportunityId ? { opportunityId: f.opportunityId } : {}),
  };

  const [total, items] = await Promise.all([
    prisma.attendanceSession.count({ where }),
    prisma.attendanceSession.findMany({
      where,
      select: SESSION_LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function reissueQr(ctx: RequestContext): Promise<unknown> {
  const { sessionId } = pathParams(ctx, sessionParamsSchema);
  const input = await body(ctx, reissueQrSchema);
  const prisma = getPrisma();

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { ...SESSION_SELECT, opportunity: { select: { organizationId: true } } },
  });
  if (!session) throw AppError.notFound('Attendance session not found.');
  const org = await requireOrgMembership(ctx, 'attendance.create', {
    orgId: session.opportunity.organizationId,
  });

  if (session.revokedAt)
    throw AppError.conflict('This session has been revoked; create a new session instead.');
  const { token, exp } = buildSessionToken(session.id, session.expiresAt, input.ttlSeconds);
  if (exp <= Date.now()) {
    throw AppError.businessRule(
      'This session has already expired; create a new session to issue a fresh QR code.',
    );
  }

  // Rotating the hash invalidates every previously issued QR image.
  await prisma.attendanceSession.update({
    where: { id: session.id },
    data: { tokenHash: hashToken(token) },
  });
  const checkInUrl = checkInUrlFor(ctx, token);
  const qrDataUrl = await qrToDataUrl(checkInUrl);

  await audit({
    actorUserId: org.user.userId,
    organizationId: session.opportunity.organizationId,
    action: 'attendance.session_reissue',
    entityType: 'attendanceSession',
    entityId: session.id,
    after: { qrExpiresAt: new Date(exp) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { sessionId: session.id, qrDataUrl, checkInUrl, qrExpiresAt: new Date(exp) };
}

async function revokeSession(ctx: RequestContext): Promise<unknown> {
  const { sessionId } = pathParams(ctx, sessionParamsSchema);
  const prisma = getPrisma();

  const session = await prisma.attendanceSession.findUnique({
    where: { id: sessionId },
    select: { ...SESSION_SELECT, opportunity: { select: { organizationId: true } } },
  });
  if (!session) throw AppError.notFound('Attendance session not found.');
  const org = await requireOrgMembership(ctx, 'attendance.create', {
    orgId: session.opportunity.organizationId,
  });
  if (session.revokedAt) throw AppError.conflict('This session has already been revoked.');

  const revokedAt = new Date();
  await prisma.attendanceSession.update({ where: { id: session.id }, data: { revokedAt } });

  await audit({
    actorUserId: org.user.userId,
    organizationId: session.opportunity.organizationId,
    action: 'attendance.session_revoke',
    entityType: 'attendanceSession',
    entityId: session.id,
    before: { revokedAt: null },
    after: { revokedAt },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { session: { id: session.id, revokedAt } };
}

// ── Organization side: records ─────────────────────────────────

async function listAttendance(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'attendance.create');
  const f = query(ctx, attendanceListQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const hasRange = f.from !== undefined || f.to !== undefined;
  const dateFilter: Prisma.DateTimeFilter = {
    ...(f.from ? { gte: f.from } : {}),
    ...(f.to ? { lte: f.to } : {}),
  };
  const where: Prisma.AttendanceWhereInput = {
    opportunity: { organizationId: org.orgId },
    ...(f.opportunityId ? { opportunityId: f.opportunityId } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(hasRange ? { date: dateFilter } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.attendance.count({ where }),
    prisma.attendance.findMany({
      where,
      select: ATTENDANCE_LIST_SELECT,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);

  // Applicant-style privacy: emails stay masked unless the volunteer opted in.
  const items = rows.map((row) => ({
    ...row,
    hours: row.hours ? row.hours.toNumber() : null,
    volunteerProfile: {
      ...row.volunteerProfile,
      user: {
        ...row.volunteerProfile.user,
        email: row.volunteerProfile.publicEmail
          ? row.volunteerProfile.user.email
          : maskEmail(row.volunteerProfile.user.email),
      },
    },
  }));
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function manualAttendance(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, manualAttendanceSchema);
  const prisma = getPrisma();

  const opportunity = await prisma.opportunity.findFirst({
    where: { id: input.opportunityId, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');
  const org = await requireOrgMembership(ctx, 'attendance.create', {
    orgId: opportunity.organizationId,
  });

  const volunteer = await prisma.volunteerProfile.findUnique({
    where: { id: input.volunteerProfileId },
    select: { id: true },
  });
  if (!volunteer) {
    throw AppError.validation('The selected volunteer does not exist.');
  }
  if (
    input.checkInAt &&
    input.checkOutAt &&
    input.checkOutAt.getTime() < input.checkInAt.getTime()
  ) {
    throw AppError.validation('Check-out must be after check-in.');
  }

  // Day-level duplicate guard: the unique constraint only covers session scans.
  const day = startOfDay(input.date);
  const duplicate = await prisma.attendance.findFirst({
    where: { opportunityId: opportunity.id, volunteerProfileId: volunteer.id, date: day },
    select: { id: true },
  });
  if (duplicate) {
    throw AppError.conflict(
      'Attendance is already recorded for this volunteer on this day for this opportunity.',
    );
  }

  let attendanceId: string;
  try {
    const created = await prisma.attendance.create({
      data: {
        opportunityId: opportunity.id,
        volunteerProfileId: volunteer.id,
        date: day,
        checkInAt: input.checkInAt ?? null,
        checkOutAt: input.checkOutAt ?? null,
        hours: input.hours ?? null,
        method: 'MANUAL',
        status: 'PENDING_CONFIRMATION',
      },
      select: ATTENDANCE_SELECT,
    });
    attendanceId = created.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict(
        'Attendance is already recorded for this volunteer on this day for this opportunity.',
      );
    }
    throw error;
  }

  await audit({
    actorUserId: org.user.userId,
    organizationId: opportunity.organizationId,
    action: 'attendance.manual_create',
    entityType: 'attendance',
    entityId: attendanceId,
    after: {
      volunteerProfileId: volunteer.id,
      opportunityId: opportunity.id,
      date: day,
      hours: input.hours ?? null,
      // no note column exists on Attendance — it survives only here
      note: input.note ?? null,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: ATTENDANCE_SELECT,
  });
  if (!attendance) throw AppError.notFound('Attendance record not found.');
  return {
    attendance: { ...attendance, hours: attendance.hours ? attendance.hours.toNumber() : null },
  };
}

async function confirmAttendance(ctx: RequestContext): Promise<unknown> {
  await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, confirmAttendanceSchema);
  const prisma = getPrisma();

  const record = await prisma.attendance.findUnique({
    where: { id },
    select: {
      ...ATTENDANCE_SELECT,
      opportunity: {
        select: { organizationId: true, titleAr: true, titleFr: true, titleEn: true },
      },
    },
  });
  if (!record) throw AppError.notFound('Attendance record not found.');

  // Tenancy is derived from the record, never from the payload.
  const org = await requireOrgMembership(ctx, 'attendance.verify', {
    orgId: record.opportunity.organizationId,
  });
  if (record.status !== 'PENDING_CONFIRMATION') {
    throw AppError.conflict(
      'This attendance record has already been decided; decided records are append-only.',
    );
  }

  const title = pickLocalized(record.opportunity, resolveLocale('en'), ['title']);

  if (input.action === 'REJECT') {
    if (!input.reason?.trim()) {
      throw AppError.validation('A reason is required when rejecting an attendance record.');
    }
    const updated = await prisma.attendance.update({
      where: { id: record.id },
      data: { status: 'REJECTED', rejectReason: input.reason, verifiedById: org.user.userId },
      select: ATTENDANCE_SELECT,
    });
    await notifyAttendee(record.volunteerProfileId, 'rejected', title, { reason: input.reason });
    await audit({
      actorUserId: org.user.userId,
      organizationId: record.opportunity.organizationId,
      action: 'attendance.reject',
      entityType: 'attendance',
      entityId: record.id,
      before: { status: record.status },
      after: { status: 'REJECTED', reason: input.reason },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { attendance: { ...updated, hours: updated.hours ? updated.hours.toNumber() : null } };
  }

  // CONFIRM: verified hours from input → recorded hours → check-in/out span.
  const checkOutAt = input.checkOutAt ?? record.checkOutAt;
  let hours = input.hours ?? (record.hours ? record.hours.toNumber() : null);
  if (hours === null && record.checkInAt && checkOutAt) {
    hours = (checkOutAt.getTime() - record.checkInAt.getTime()) / 3_600_000;
  }
  hours = hours === null ? null : Math.round(hours * 100) / 100;
  if (hours === null || !(hours > 0)) {
    throw AppError.businessRule(
      'Provide verified hours or a check-out time after check-in so the participation can be confirmed.',
    );
  }

  let confirmed: {
    attendance: Prisma.AttendanceGetPayload<{ select: typeof ATTENDANCE_SELECT }>;
    hour: { id: string; hours: unknown };
  };
  try {
    confirmed = await prisma.$transaction(async (tx) => {
      const attendance = await tx.attendance.update({
        where: { id: record.id },
        data: {
          status: 'CONFIRMED',
          ...(checkOutAt ? { checkOutAt } : {}),
          hours,
          verifiedById: org.user.userId,
        },
        select: ATTENDANCE_SELECT,
      });
      const hour = await tx.volunteerHour.create({
        data: {
          volunteerProfileId: record.volunteerProfileId,
          organizationId: record.opportunity.organizationId,
          activityId: record.activityId ?? null,
          attendanceId: record.id,
          hours,
          date: record.date,
          status: 'PENDING',
          source: record.method === 'MANUAL' ? 'MANUAL' : 'ATTENDANCE',
        },
        select: {
          id: true,
          status: true,
          hours: true,
          date: true,
          source: true,
          attendanceId: true,
          createdAt: true,
        },
      });
      return { attendance, hour };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('An hour record already exists for this attendance.');
    }
    throw error;
  }

  await notifyAttendee(record.volunteerProfileId, 'confirmed', title, { hours: hours.toFixed(2) });
  await audit({
    actorUserId: org.user.userId,
    organizationId: record.opportunity.organizationId,
    action: 'attendance.confirm',
    entityType: 'attendance',
    entityId: record.id,
    before: { status: record.status, hours: record.hours ? record.hours.toNumber() : null },
    after: {
      status: 'CONFIRMED',
      hours,
      hourId: confirmed.hour.id,
      reason: input.reason ?? null,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return {
    attendance: {
      ...confirmed.attendance,
      hours: confirmed.attendance.hours ? confirmed.attendance.hours.toNumber() : null,
    },
    hour: { ...confirmed.hour, hours: confirmed.hour.hours as number },
  };
}

// ── Volunteer side: QR check-in ────────────────────────────────

async function checkInByQr(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'attendance.checkin:self');
  const input = await body(ctx, checkInByQrSchema);
  const prisma = getPrisma();

  // Signature first: a tampered payload never reaches the database.
  const { kind, id: payload } = verifyQrToken(input.token);
  if (kind !== 'attendance') {
    throw AppError.validation('This QR code cannot be used for check-in.');
  }
  const parts = payload.split('|');
  if (parts.length !== 2 || !uuidSchema.safeParse(parts[0]).success) {
    throw AppError.validation('This QR code is not valid.');
  }
  const expMs = Number(parts[1]);
  if (!Number.isFinite(expMs)) {
    throw AppError.validation('This QR code is not valid.');
  }

  const now = Date.now();
  if (now > expMs) {
    throw AppError.businessRule(
      'This QR code has expired. Ask the organizer for the current code.',
    );
  }

  const session = await prisma.attendanceSession.findUnique({
    where: { id: parts[0] },
    select: {
      id: true,
      tokenHash: true,
      startsAt: true,
      expiresAt: true,
      revokedAt: true,
      opportunityId: true,
      opportunity: { select: { organizationId: true } },
    },
  });
  if (!session) throw AppError.validation('This QR code is not valid.');
  if (hashToken(input.token) !== session.tokenHash) {
    throw AppError.validation(
      'This QR code was replaced by a newer one. Ask the organizer for the current code.',
    );
  }
  if (session.revokedAt) throw AppError.businessRule('This check-in session has been revoked.');
  if (now < session.startsAt.getTime())
    throw AppError.businessRule('This check-in session has not started yet.');
  if (now > session.expiresAt.getTime()) {
    throw AppError.businessRule(
      'This check-in session has expired. Ask the organizer for a new session.',
    );
  }

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) {
    throw AppError.businessRule('Complete your volunteer profile before checking in.');
  }

  // Friendly 409 before hitting the [sessionId, volunteerProfileId] constraint.
  const existing = await prisma.attendance.findFirst({
    where: { sessionId: session.id, volunteerProfileId: profile.id },
    select: { id: true },
  });
  if (existing) throw AppError.conflict('You have already checked in to this session.');

  let attendanceId: string;
  try {
    const created = await prisma.attendance.create({
      data: {
        opportunityId: session.opportunityId,
        volunteerProfileId: profile.id,
        sessionId: session.id,
        date: startOfDay(new Date(now)),
        checkInAt: new Date(now),
        method: 'QR',
        status: 'PENDING_CONFIRMATION',
      },
      select: ATTENDANCE_SELECT,
    });
    attendanceId = created.id;
  } catch (error) {
    // replayed scan / concurrent request → unique constraint → 409
    if (isUniqueViolation(error)) {
      throw AppError.conflict('You have already checked in to this session.');
    }
    throw error;
  }

  await audit({
    actorUserId: user.userId,
    organizationId: session.opportunity.organizationId,
    action: 'attendance.check_in',
    entityType: 'attendance',
    entityId: attendanceId,
    after: { sessionId: session.id, method: 'QR' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const attendance = await prisma.attendance.findUnique({
    where: { id: attendanceId },
    select: ATTENDANCE_SELECT,
  });
  if (!attendance) throw AppError.notFound('Attendance record not found.');
  return {
    attendance: { ...attendance, hours: attendance.hours ? attendance.hours.toNumber() : null },
  };
}

// ── Route table ─────────────────────────────────────────────────

export const attendanceRoutes: AppRoute[] = [
  {
    method: 'POST',
    path: '/attendance/sessions',
    handler: createSession,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Create a QR check-in session and issue its first QR code',
  },
  {
    method: 'GET',
    path: '/attendance/sessions',
    handler: listSessions,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'List attendance sessions of the tenant (paginated)',
  },
  {
    method: 'POST',
    path: '/attendance/sessions/:sessionId/qr',
    handler: reissueQr,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Reissue the session QR code (rotates the token, old QRs die)',
  },
  {
    method: 'POST',
    path: '/attendance/sessions/:sessionId/revoke',
    handler: revokeSession,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Revoke an attendance session',
  },
  {
    method: 'POST',
    path: '/attendance/manual',
    handler: manualAttendance,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Record attendance manually (day-level duplicate guard)',
  },
  {
    method: 'GET',
    path: '/attendance',
    handler: listAttendance,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'List attendance records of the tenant (paginated)',
  },
  {
    method: 'POST',
    path: '/attendance/check-in',
    handler: checkInByQr,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Check in by scanning a session QR code (409 on replay)',
  },
  {
    method: 'POST',
    path: '/attendance/:id/confirm',
    handler: confirmAttendance,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Confirm or reject an attendance record (appends a pending hour)',
  },
];
