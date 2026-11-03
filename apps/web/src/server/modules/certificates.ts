// Certificates module (spec §33, §72, §107).
//
// Issuing appends a new VALID row with a unique BLD-CERT- number (retried on
// unique violations) and a non-guessable verification token; tenancy comes
// from the referenced activity (organizationId) and the certificate can only
// go to that activity's participant — never from the payload. Revocation goes
// through CERTIFICATE_TRANSITIONS with a reason: the organization is derived
// from the certificate row itself (never from path/body), then guarded with
// certificate.revoke, then audited + notified — the row is never deleted or
// edited. Public reads expose holder/organization/hours/number/status only,
// and honestly report effective VALID/REVOKED/EXPIRED. The PDF route renders
// exactly that same public surface (no contact data) with an embedded OFL
// Arabic font and a QR pointing at the public verification page.

import { randomBytes } from 'node:crypto';
import { generateOpaqueSecret } from '@bladna/auth';
import { getPrisma, type Prisma } from '@bladna/database';
import { CERTIFICATE_TRANSITIONS, assertTransition, organizationBadge } from '@bladna/domain';
import { AppError, type LocaleCode } from '@bladna/types';
import { buildPageMeta, maskEmail, normalizePageParams, resolveLocale } from '@bladna/utils';
import {
  createCertificateSchema,
  paginationQuerySchema,
  revokeCertificateSchema,
  uuidSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { env } from '../env';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireAuth, requireOrgMembership } from '../guards';
import { pdfResponse, renderCertificatePdf } from '../infra/pdf';
import { qrToPng } from '../infra/qr';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

const orgParamsSchema = z.object({ orgId: uuidSchema });
const certificateParamsSchema = z.object({ certificateId: uuidSchema });
/** Public detail accepts a UUID id, the BLD-CERT- number or the verify token. */
const publicCertificateParamsSchema = z.object({
  certificateId: z.string().trim().min(4).max(200),
});
const verifyQuerySchema = z.object({ code: z.string().trim().min(4).max(120) });

const certificateListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['VALID', 'REVOKED', 'EXPIRED']).optional(),
  volunteerProfileId: uuidSchema.optional(),
});

type CertificateNoticeKey = 'issued' | 'revoked';

const CERT_NOTICE: Record<
  CertificateNoticeKey,
  Record<LocaleCode, { title: string; body: string }>
> = {
  issued: {
    ar: { title: 'تم إصدار شهادة', body: 'أُصدرت شهادة "{title}" باسمك (رقم {number}).' },
    fr: {
      title: 'Certificat émis',
      body: 'Le certificat « {title} » a été émis en votre nom (n° {number}).',
    },
    en: {
      title: 'Certificate issued',
      body: 'The certificate "{title}" was issued in your name (no. {number}).',
    },
  },
  revoked: {
    ar: { title: 'تم إلغاء شهادة', body: 'أُلغيت شهادة "{title}" (رقم {number}). السبب: {reason}' },
    fr: {
      title: 'Certificat révoqué',
      body: 'Le certificat « {title} » (n° {number}) a été révoqué. Motif : {reason}',
    },
    en: {
      title: 'Certificate revoked',
      body: 'The certificate "{title}" (no. {number}) was revoked. Reason: {reason}',
    },
  },
};

const CERT_NOTICE_TYPE: Record<CertificateNoticeKey, 'CERTIFICATE_ISSUED' | 'SYSTEM'> = {
  issued: 'CERTIFICATE_ISSUED',
  revoked: 'SYSTEM',
};

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(`{${key}}`, value);
  }
  return out;
}

const CERTIFICATE_SELECT = {
  id: true,
  volunteerProfileId: true,
  organizationId: true,
  activityId: true,
  opportunityId: true,
  title: true,
  description: true,
  hours: true,
  issuedAt: true,
  certificateNumber: true,
  verificationToken: true,
  status: true,
  templateId: true,
  issuedById: true,
  revokedAt: true,
  revokedById: true,
  revokeReason: true,
  expiresAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.VolunteerCertificateSelect;

const CERTIFICATE_LIST_SELECT = {
  ...CERTIFICATE_SELECT,
  volunteerProfile: {
    select: {
      id: true,
      volunteerId: true,
      publicEmail: true,
      user: { select: { firstName: true, lastName: true, email: true, profileImage: true } },
    },
  },
  organization: {
    select: { id: true, name: true, slug: true, trustLevel: true, verificationStatus: true },
  },
} as const satisfies Prisma.VolunteerCertificateSelect;

/** Public surface: holder + organization + hours/number/status — no contact data. */
const CERTIFICATE_PUBLIC_SELECT = {
  id: true,
  title: true,
  description: true,
  hours: true,
  issuedAt: true,
  certificateNumber: true,
  status: true,
  expiresAt: true,
  revokedAt: true,
  revokeReason: true,
  volunteerProfile: {
    select: { volunteerId: true, user: { select: { firstName: true, lastName: true } } },
  },
  organization: {
    select: { id: true, name: true, slug: true, trustLevel: true, verificationStatus: true },
  },
} as const satisfies Prisma.VolunteerCertificateSelect;

type CertificateRow = Prisma.VolunteerCertificateGetPayload<{ select: typeof CERTIFICATE_SELECT }>;
type CertificateListRow = Prisma.VolunteerCertificateGetPayload<{
  select: typeof CERTIFICATE_LIST_SELECT;
}>;

function serializeCertificate(row: CertificateRow | CertificateListRow): Record<string, unknown> {
  const { hours, ...rest } = row;
  const profile = 'volunteerProfile' in row ? row.volunteerProfile : null;
  const organization = 'organization' in row ? row.organization : null;
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
              email: profile.publicEmail ? profile.user.email : maskEmail(profile.user.email),
            },
          },
        }
      : {}),
    ...(organization
      ? {
          organization: {
            ...organization,
            badge: organizationBadge(organization.trustLevel, organization.verificationStatus),
          },
        }
      : {}),
  };
}

/** `BLD-CERT-` + uppercase base36 suffix; uniqueness retried by the caller. */
function nextCertificateNumber(): string {
  const suffix = BigInt(`0x${randomBytes(6).toString('hex')}`)
    .toString(36)
    .toUpperCase()
    .padStart(9, '0');
  return `BLD-CERT-${suffix}`;
}

async function notifyCertificate(
  volunteerProfileId: string,
  key: CertificateNoticeKey,
  vars: Record<string, string>,
): Promise<void> {
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { id: volunteerProfileId },
    select: { user: { select: { id: true, preferredLanguage: true } } },
  });
  if (!profile) return;
  const locale = resolveLocale(profile.user.preferredLanguage.toLowerCase());
  const copy = CERT_NOTICE[key][locale];
  await notify({
    userId: profile.user.id,
    type: CERT_NOTICE_TYPE[key],
    title: copy.title,
    body: fill(copy.body, vars),
    data: { volunteerProfileId, kind: key, ...vars },
  });
}

/** Stored VALID but past its expiry: report EXPIRED without mutating the row. */
function effectiveStatus(row: { status: string; expiresAt: Date | null }): string {
  if (row.status === 'VALID' && row.expiresAt && row.expiresAt.getTime() < Date.now())
    return 'EXPIRED';
  return row.status;
}

// ── Organization side ──────────────────────────────────────────

async function issue(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParamsSchema);
  const org = await requireOrgMembership(ctx, 'certificate.issue', { orgId });
  const input = await body(ctx, createCertificateSchema);
  const prisma = getPrisma();

  // Facts first: the activity must belong to this tenant and the certificate
  // can only be issued for the volunteer who actually participated — the
  // profile's membership in the tenant is derived through the activity row.
  const activity = await prisma.volunteerActivity.findFirst({
    where: { id: input.activityId, organizationId: orgId },
    select: { id: true, volunteerProfileId: true, title: true },
  });
  if (!activity) throw AppError.notFound('Activity not found in this organization.');
  if (activity.volunteerProfileId !== input.volunteerProfileId) {
    throw AppError.validation(
      'The certificate volunteer must be the participant of this activity.',
    );
  }

  const noticeVars = { title: input.title, number: '' };
  let created: CertificateRow | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await prisma.volunteerCertificate.create({
        data: {
          organizationId: orgId,
          volunteerProfileId: input.volunteerProfileId,
          activityId: activity.id,
          title: input.title,
          description: input.description ?? null,
          hours: input.hours,
          // No CertificateTemplate model exists; the column is a free string ref.
          ...(input.templateId ? { templateId: input.templateId } : {}),
          certificateNumber: nextCertificateNumber(),
          verificationToken: generateOpaqueSecret(24),
          issuedById: org.user.userId,
          status: 'VALID',
        },
        select: CERTIFICATE_SELECT,
      });
    } catch (error) {
      // Unique collisions on certificateNumber/verificationToken: re-roll and retry.
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  if (!created) throw AppError.internal('Could not allocate a unique certificate number.');

  await audit({
    actorUserId: org.user.userId,
    organizationId: orgId,
    action: 'certificate.issue',
    entityType: 'volunteerCertificate',
    entityId: created.id,
    after: {
      certificateNumber: created.certificateNumber,
      volunteerProfileId: created.volunteerProfileId,
      activityId: created.activityId,
      hours: created.hours.toNumber(),
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  noticeVars.number = created.certificateNumber;
  await notifyCertificate(input.volunteerProfileId, 'issued', noticeVars);

  return { certificate: serializeCertificate(created) };
}

async function listCertificates(ctx: RequestContext): Promise<unknown> {
  const { orgId } = pathParams(ctx, orgParamsSchema);
  // No org-scoped certificate read permission exists — issue is the closest.
  await requireOrgMembership(ctx, 'certificate.issue', { orgId });
  const f = query(ctx, certificateListQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.VolunteerCertificateWhereInput = {
    // Tenancy comes from the path, never from the query string.
    organizationId: orgId,
    ...(f.status ? { status: f.status } : {}),
    ...(f.volunteerProfileId ? { volunteerProfileId: f.volunteerProfileId } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.volunteerCertificate.count({ where }),
    prisma.volunteerCertificate.findMany({
      where,
      select: CERTIFICATE_LIST_SELECT,
      orderBy: { issuedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => {
    const serialized = serializeCertificate(row);
    return { ...serialized, status: effectiveStatus(row) };
  });
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function revoke(ctx: RequestContext): Promise<unknown> {
  const { certificateId } = pathParams(ctx, certificateParamsSchema);
  const input = await body(ctx, revokeCertificateSchema);
  const prisma = getPrisma();

  // Tenancy is derived from the certificate row — never from path or body.
  const record = await prisma.volunteerCertificate.findUnique({
    where: { id: certificateId },
    select: CERTIFICATE_SELECT,
  });
  if (!record) throw AppError.notFound('Certificate not found.');
  const org = await requireOrgMembership(ctx, 'certificate.revoke', {
    orgId: record.organizationId,
  });
  assertTransition(CERTIFICATE_TRANSITIONS, record.status, 'REVOKED', 'certificate');

  const revokedAt = new Date();
  const updated = await prisma.volunteerCertificate.update({
    where: { id: record.id },
    data: {
      status: 'REVOKED',
      revokedAt,
      revokedById: org.user.userId,
      revokeReason: input.reason,
    },
    select: CERTIFICATE_SELECT,
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: record.organizationId,
    action: 'certificate.revoke',
    entityType: 'volunteerCertificate',
    entityId: record.id,
    before: { status: record.status },
    after: { status: 'REVOKED', reason: input.reason },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  await notifyCertificate(record.volunteerProfileId, 'revoked', {
    title: record.title,
    number: record.certificateNumber,
    reason: input.reason,
  });

  return { certificate: serializeCertificate(updated) };
}

// ── Volunteer side ─────────────────────────────────────────────

async function myCertificates(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, certificateListQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const where: Prisma.VolunteerCertificateWhereInput = {
    // Always own rows.
    volunteerProfileId: profile.id,
    ...(f.status ? { status: f.status } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.volunteerCertificate.count({ where }),
    prisma.volunteerCertificate.findMany({
      where,
      select: CERTIFICATE_LIST_SELECT,
      orderBy: { issuedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => {
    const serialized = serializeCertificate(row);
    return { ...serialized, status: effectiveStatus(row) };
  });
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Public verification ────────────────────────────────────────

async function verifyPublic(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, verifyQuerySchema);
  const prisma = getPrisma();

  // The code may be the human-facing number or the QR/token secret.
  const record = await prisma.volunteerCertificate.findFirst({
    where: { OR: [{ certificateNumber: f.code }, { verificationToken: f.code }] },
    select: {
      ...CERTIFICATE_SELECT,
      volunteerProfile: {
        select: { volunteerId: true, user: { select: { firstName: true, lastName: true } } },
      },
      organization: {
        select: { id: true, name: true, slug: true, trustLevel: true, verificationStatus: true },
      },
    },
  });
  // Unknown codes are indistinguishable from invalid ones: 404, no probing oracle.
  if (!record) throw AppError.notFound('Certificate not found.');

  const status = effectiveStatus(record);
  return {
    certificate: {
      certificateNumber: record.certificateNumber,
      title: record.title,
      description: record.description,
      hours: record.hours.toNumber(),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      status,
      revokedAt: record.revokedAt,
      ...(record.revokeReason ? { revokeReason: record.revokeReason } : {}),
      organization: {
        id: record.organization.id,
        name: record.organization.name,
        slug: record.organization.slug,
        badge: organizationBadge(
          record.organization.trustLevel,
          record.organization.verificationStatus,
        ),
      },
      volunteer: {
        volunteerId: record.volunteerProfile.volunteerId,
        name: `${record.volunteerProfile.user.firstName} ${record.volunteerProfile.user.lastName}`.trim(),
      },
    },
  };
}

// ── Public read ────────────────────────────────────────────────

/**
 * Public certificate metadata by UUID id, BLD-CERT- number or verification
 * token. Exposes holder, organization, hours, number and status only — no
 * contact data. Revoked/expired rows are still readable (validity is the
 * caller's `status`/effective-status concern, never a 404).
 */
async function getCertificate(ctx: RequestContext): Promise<unknown> {
  const { certificateId } = pathParams(ctx, publicCertificateParamsSchema);
  const prisma = getPrisma();

  const looksLikeUuid = uuidSchema.safeParse(certificateId).success;
  const record = await (looksLikeUuid
    ? prisma.volunteerCertificate.findUnique({
        where: { id: certificateId },
        select: CERTIFICATE_PUBLIC_SELECT,
      })
    : prisma.volunteerCertificate.findFirst({
        where: {
          OR: [
            { certificateNumber: { equals: certificateId, mode: 'insensitive' } },
            { verificationToken: certificateId },
          ],
        },
        select: CERTIFICATE_PUBLIC_SELECT,
      }));
  if (!record) throw AppError.notFound('Certificate not found.');

  return {
    certificate: {
      id: record.id,
      certificateNumber: record.certificateNumber,
      title: record.title,
      description: record.description,
      hours: record.hours.toNumber(),
      status: effectiveStatus(record),
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      revokeReason: record.revokeReason,
      holder: {
        volunteerId: record.volunteerProfile.volunteerId,
        name: `${record.volunteerProfile.user.firstName} ${record.volunteerProfile.user.lastName}`.trim(),
      },
      organization: {
        id: record.organization.id,
        name: record.organization.name,
        slug: record.organization.slug,
        badge: organizationBadge(
          record.organization.trustLevel,
          record.organization.verificationStatus,
        ),
      },
    },
  };
}

// ── PDF download ───────────────────────────────────────────────

/**
 * Public certificate PDF. Renders exactly the fields the public metadata
 * route exposes — holder, organization, hours, number, effective status —
 * and never anything else (no contact data). The QR encodes the public
 * verification URL for this certificate's human-facing number, which
 * `GET /public/verify` already resolves today. `?locale=` picks the
 * document language; the default is Arabic (spec §74 ar-first).
 */
async function downloadPdf(ctx: RequestContext): Promise<unknown> {
  const { certificateId } = pathParams(ctx, publicCertificateParamsSchema);
  const prisma = getPrisma();

  const looksLikeUuid = uuidSchema.safeParse(certificateId).success;
  const record = await (looksLikeUuid
    ? prisma.volunteerCertificate.findUnique({
        where: { id: certificateId },
        select: CERTIFICATE_PUBLIC_SELECT,
      })
    : prisma.volunteerCertificate.findFirst({
        where: {
          OR: [
            { certificateNumber: { equals: certificateId, mode: 'insensitive' } },
            { verificationToken: certificateId },
          ],
        },
        select: CERTIFICATE_PUBLIC_SELECT,
      }));
  if (!record) throw AppError.notFound('Certificate not found.');

  const locale = resolveLocale(ctx.query.get('locale'));
  const verifyUrl = `${env.publicAppUrl}/verify?code=${encodeURIComponent(record.certificateNumber)}`;
  const qr = await qrToPng(verifyUrl);
  const pdf = await renderCertificatePdf({
    locale,
    title: record.title,
    description: record.description,
    holderName:
      `${record.volunteerProfile.user.firstName} ${record.volunteerProfile.user.lastName}`.trim(),
    volunteerId: record.volunteerProfile.volunteerId,
    organizationName: record.organization.name,
    hours: record.hours.toNumber(),
    certificateNumber: record.certificateNumber,
    issuedAt: record.issuedAt,
    status: effectiveStatus(record) as 'VALID' | 'REVOKED' | 'EXPIRED',
    verifyUrl,
    qr,
  });
  return pdfResponse(
    pdf,
    `bladna-certificate-${record.certificateNumber}.pdf`,
    'public, max-age=300',
  );
}

// ── Route table ────────────────────────────────────────────────

export const certificateRoutes: AppRoute[] = [
  // Literal before :param for the same method: /certificates/verify must
  // never be swallowed by /certificates/:certificateId.
  {
    method: 'GET',
    path: '/certificates/verify',
    handler: verifyPublic,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Publicly verify a certificate by number/token (404 when unknown)',
  },
  {
    method: 'GET',
    path: '/certificates/:certificateId',
    handler: getCertificate,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Public certificate metadata by id/number/token (no contact data)',
  },
  {
    method: 'GET',
    path: '/certificates/:certificateId/pdf',
    handler: downloadPdf,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Public certificate PDF (same exposure as the metadata route, ?locale=)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/certificates',
    handler: issue,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Issue a certificate for a completed activity (unique number + token)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/certificates',
    handler: listCertificates,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "List the organization's certificates (paginated)",
  },
  {
    method: 'POST',
    path: '/certificates/:certificateId/revoke',
    handler: revoke,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Revoke a certificate (org derived from the row, state machine, audited)',
  },
  {
    method: 'GET',
    path: '/me/certificates',
    handler: myCertificates,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'List own certificates (paginated)',
  },
];
