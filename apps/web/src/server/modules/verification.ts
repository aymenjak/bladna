// Organization verification module (spec §34, §72, §107).
//
// Organizations submit verification evidence (documents uploaded through the
// documents module); platform verification officers decide through
// VERIFICATION_TRANSITIONS only. Rows PENDING/UNDER_REVIEW are open for a
// decision; completed rows are append-only (409 on re-decide). Row-level
// transitions are asserted strictly; the organization-level status only steps
// when the state machine allows it. Every decision notifies the organization's
// OWNER/ADMIN members in their locale and writes an audit row.

import { getPrisma } from '@bladna/database';
import {
  VERIFICATION_TRANSITIONS,
  assertTransition,
  canTransition,
  organizationBadge,
} from '@bladna/domain';
import {
  AppError,
  VERIFICATION_STATUSES,
  type LocaleCode,
  type NotificationType,
  type VerificationStatus,
} from '@bladna/types';
import { buildPageMeta, normalizePageParams, resolveLocale } from '@bladna/utils';
import {
  idParamsSchema,
  paginationQuerySchema,
  reviewVerificationSchema,
  submitVerificationSchema,
  uuidSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireOrgMembership, requireSystemPermission } from '../guards';
import { checkDocument } from '../infra/ai';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

const adminVerificationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(VERIFICATION_STATUSES).optional(),
  organizationId: uuidSchema.optional(),
});

/**
 * Officer-observed fields for ONE evidence document. The officer READS the
 * bytes (via `GET /files`) and reports what the document says; the expected
 * values are always loaded from the organization record on the server — the
 * tenant never supplies either side. Confidence is fixed at 1 because a human
 * read it; an OCR pipeline (not in this build) would report less.
 */
const ORG_COMPARABLE_FIELDS = ['name', 'legalName', 'officialEmail', 'phone', 'website'] as const;
type ComparableField = (typeof ORG_COMPARABLE_FIELDS)[number];

const checkEvidenceSchema = z.object({
  documentId: uuidSchema,
  fields: z
    .array(
      z.object({
        name: z.enum(ORG_COMPARABLE_FIELDS),
        value: z.string().trim().min(1).max(300),
      }),
    )
    .min(1)
    .max(20)
    .refine((fields) => new Set(fields.map((field) => field.name)).size === fields.length, {
      message: 'Each field may be reported only once.',
    }),
});

type DecideNoticeKey = 'verified' | 'rejected' | 'info';

const DECIDE_NOTICE: Record<
  DecideNoticeKey,
  Record<LocaleCode, { title: string; body: string }>
> = {
  verified: {
    ar: { title: 'تم توثيق منظمتك', body: 'تهانينا! تم توثيق "{org}" على منصة بلادنا.' },
    fr: {
      title: 'Organisation vérifiée',
      body: 'Félicitations ! « {org} » est désormais vérifiée sur BLADNA.',
    },
    en: {
      title: 'Organization verified',
      body: 'Congratulations! "{org}" is now verified on BLADNA.',
    },
  },
  rejected: {
    ar: { title: 'لم يتم توثيق المنظمة', body: 'لم يتم توثيق "{org}". السبب: {reason}' },
    fr: { title: 'Vérification refusée', body: '« {org} » n’a pas été vérifiée. Motif : {reason}' },
    en: { title: 'Organization not verified', body: '"{org}" was not verified. Reason: {reason}' },
  },
  info: {
    ar: {
      title: 'معلومات إضافية مطلوبة',
      body: 'نحتاج إلى معلومات إضافية لمواصلة توثيق "{org}". راجع صفحة التوثيق.',
    },
    fr: {
      title: 'Informations complémentaires requises',
      body: 'Nous avons besoin d’informations supplémentaires pour poursuivre la vérification de « {org} ». Consultez la page de vérification.',
    },
    en: {
      title: 'More information required',
      body: 'We need more information to continue verifying "{org}". Check the verification page.',
    },
  },
};

const DECIDE_TYPE: Record<DecideNoticeKey, NotificationType> = {
  verified: 'ORGANIZATION_VERIFIED',
  rejected: 'ORGANIZATION_REJECTED',
  info: 'SYSTEM',
};

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(`{${key}}`, value);
  }
  return out;
}

/**
 * Organization-level status follows VERIFICATION_TRANSITIONS when a legal step
 * exists (submit: PENDING→UNDER_REVIEW, REJECTED→PENDING; decisions onto
 * VERIFIED/REJECTED/UNDER_REVIEW). When the machine forbids the step — e.g. an
 * already VERIFIED organization re-submitting for a higher level — the current
 * status is kept; it is never forced past the state machine.
 */
function stepOrgStatus(
  current: VerificationStatus,
  target: VerificationStatus,
): VerificationStatus {
  if (current === target) return current;
  if (!canTransition(VERIFICATION_TRANSITIONS, current, target)) return current;
  assertTransition(VERIFICATION_TRANSITIONS, current, target, 'organization verification');
  return target;
}

/** Decisions reach the organization's OWNER/ADMIN members in their locale. */
async function notifyOrgDecision(
  organizationId: string,
  organizationName: string,
  key: DecideNoticeKey,
  reason: string,
): Promise<void> {
  const members = await getPrisma().organizationMember.findMany({
    where: { organizationId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
    select: { user: { select: { id: true, preferredLanguage: true } } },
  });
  for (const member of members) {
    const locale = resolveLocale(member.user.preferredLanguage.toLowerCase());
    const copy = DECIDE_NOTICE[key][locale];
    await notify({
      userId: member.user.id,
      type: DECIDE_TYPE[key],
      title: copy.title,
      body: fill(copy.body, { org: organizationName, reason: reason || '—' }),
      data: { organizationId, decision: key },
    });
  }
}

// ── Organization side ───────────────────────────────────────────

async function submitVerification(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.verification.submit');
  const input = await body(ctx, submitVerificationSchema);
  const prisma = getPrisma();

  const organization = await prisma.organization.findFirst({
    where: { id: org.orgId, deletedAt: null },
    select: { id: true, verificationStatus: true },
  });
  if (!organization) throw AppError.notFound('Organization not found.');

  const open = await prisma.organizationVerification.findFirst({
    where: { organizationId: org.orgId, status: { in: ['PENDING', 'UNDER_REVIEW'] } },
    select: { id: true },
  });
  if (open) throw AppError.conflict('A verification request is already under review.');

  // Evidence must be documents of this tenant that passed upload validation.
  const documentIds = [...new Set(input.documentIds)];
  const documents = await prisma.document.findMany({
    where: {
      id: { in: documentIds },
      organizationId: org.orgId,
      deletedAt: null,
      status: 'AVAILABLE',
    },
    select: { id: true, fileName: true },
  });
  if (documents.length !== documentIds.length) {
    throw AppError.validation('One or more documents are not available in this organization.');
  }

  const verification = await prisma.organizationVerification.create({
    data: {
      organizationId: org.orgId,
      level: input.targetLevel,
      status: 'PENDING',
      notes: input.notes ?? null,
    },
    select: { id: true, level: true, status: true, submittedAt: true, notes: true },
  });

  await prisma.verificationDocument.createMany({
    data: documents.map((document) => ({
      verificationId: verification.id,
      organizationId: org.orgId,
      documentId: document.id,
      label: document.fileName,
      uploadedById: org.user.userId,
      status: 'PENDING',
    })),
  });

  const target: VerificationStatus =
    organization.verificationStatus === 'REJECTED' ? 'PENDING' : 'UNDER_REVIEW';
  const nextOrgStatus = stepOrgStatus(organization.verificationStatus, target);
  if (nextOrgStatus !== organization.verificationStatus) {
    await prisma.organization.update({
      where: { id: org.orgId },
      data: { verificationStatus: nextOrgStatus },
    });
  }

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'organization.verification_submit',
    entityType: 'organizationVerification',
    entityId: verification.id,
    after: {
      level: verification.level,
      status: verification.status,
      organizationStatus: nextOrgStatus,
      documents: documents.length,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return {
    verification: { ...verification, documentIds: documents.map((document) => document.id) },
  };
}

async function listOrgVerifications(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = { organizationId: org.orgId } as const;
  const [total, items] = await Promise.all([
    prisma.organizationVerification.count({ where }),
    prisma.organizationVerification.findMany({
      where,
      select: {
        id: true,
        level: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        notes: true,
        rejectReason: true,
        expiresAt: true,
        createdAt: true,
        documents: {
          select: {
            id: true,
            label: true,
            status: true,
            createdAt: true,
            document: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Platform verification officers ──────────────────────────────

async function adminList(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'organization.verify');
  const f = query(ctx, adminVerificationsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.organizationId ? { organizationId: f.organizationId } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.organizationVerification.count({ where }),
    prisma.organizationVerification.findMany({
      where,
      select: {
        id: true,
        level: true,
        status: true,
        submittedAt: true,
        reviewedAt: true,
        notes: true,
        rejectReason: true,
        expiresAt: true,
        _count: { select: { documents: true } },
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            trustLevel: true,
            verificationStatus: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => ({
    ...row,
    organization: {
      ...row.organization,
      badge: organizationBadge(row.organization.trustLevel, row.organization.verificationStatus),
    },
  }));
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/**
 * Officer-facing detail: the full row plus every evidence file with a signed
 * path to its bytes (`GET /files` re-checks officer access + the evidence link
 * server-side — the URL alone grants nothing).
 */
async function adminDetail(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'organization.verify');
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const row = await prisma.organizationVerification.findUnique({
    where: { id },
    select: {
      id: true,
      level: true,
      status: true,
      officerId: true,
      submittedAt: true,
      reviewedAt: true,
      notes: true,
      rejectReason: true,
      expiresAt: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
          name: true,
          legalName: true,
          slug: true,
          logo: true,
          officialEmail: true,
          phone: true,
          website: true,
          status: true,
          verificationStatus: true,
          trustLevel: true,
        },
      },
      documents: {
        select: {
          id: true,
          label: true,
          status: true,
          createdAt: true,
          document: {
            select: {
              id: true,
              type: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              storageKey: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!row) throw AppError.notFound('Verification request not found.');

  const { documents, organization, ...verification } = row;
  return {
    verification: {
      ...verification,
      organization: {
        ...organization,
        badge: organizationBadge(organization.trustLevel, organization.verificationStatus),
      },
      documents: documents.map((doc) => ({
        id: doc.id,
        label: doc.label,
        status: doc.status,
        createdAt: doc.createdAt,
        document: {
          id: doc.document.id,
          type: doc.document.type,
          fileName: doc.document.fileName,
          mimeType: doc.document.mimeType,
          sizeBytes: doc.document.sizeBytes,
          downloadUrl: `/api/v1/files?key=${encodeURIComponent(doc.document.storageKey)}`,
        },
      })),
    },
  };
}

async function decide(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'organization.verify');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, reviewVerificationSchema);
  const prisma = getPrisma();

  const verification = await prisma.organizationVerification.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      level: true,
      status: true,
      organization: { select: { id: true, name: true, verificationStatus: true } },
    },
  });
  if (!verification) throw AppError.notFound('Verification request not found.');
  if (verification.status !== 'PENDING' && verification.status !== 'UNDER_REVIEW') {
    throw AppError.conflict(
      'This verification request has already been decided; completed requests are append-only.',
    );
  }
  if (input.decision === 'REJECTED' && !input.rejectReason?.trim()) {
    throw AppError.validation('A reject reason is required when rejecting a verification.');
  }

  const rowTarget: VerificationStatus =
    input.decision === 'REQUEST_INFO' ? 'UNDER_REVIEW' : input.decision;
  // Strict at the row level: the only legal moves are the machine's.
  if (rowTarget !== verification.status) {
    assertTransition(
      VERIFICATION_TRANSITIONS,
      verification.status,
      rowTarget,
      'verification request',
    );
  }

  const orgStatusTarget: VerificationStatus =
    input.decision === 'VERIFIED'
      ? 'VERIFIED'
      : input.decision === 'REJECTED'
        ? 'REJECTED'
        : 'UNDER_REVIEW';
  const nextOrgStatus = stepOrgStatus(
    verification.organization.verificationStatus,
    orgStatusTarget,
  );
  const grantedLevel =
    input.decision === 'VERIFIED' ? (input.level ?? verification.level) : verification.level;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.organizationVerification.update({
      where: { id: verification.id },
      data: {
        status: rowTarget,
        officerId: user.userId,
        reviewedAt: new Date(),
        level: grantedLevel,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.decision === 'REJECTED' ? { rejectReason: input.rejectReason } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
    });
    await tx.organization.update({
      where: { id: verification.organizationId },
      data: {
        verificationStatus: nextOrgStatus,
        ...(input.decision === 'VERIFIED'
          ? {
              trustLevel: grantedLevel,
              verifiedAt: new Date(),
              // an unverified tenant becomes active; a suspended one stays suspended
              ...((verification.organization as { verificationStatus: VerificationStatus } & {
                status?: never;
              })
                ? {}
                : {}),
            }
          : {}),
      },
    });
    return row;
  });

  const key: DecideNoticeKey =
    input.decision === 'VERIFIED'
      ? 'verified'
      : input.decision === 'REJECTED'
        ? 'rejected'
        : 'info';
  await notifyOrgDecision(
    verification.organizationId,
    verification.organization.name,
    key,
    input.rejectReason ?? input.notes ?? '',
  );
  await audit({
    actorUserId: user.userId,
    organizationId: verification.organizationId,
    action: 'organization.verification_decide',
    entityType: 'organizationVerification',
    entityId: verification.id,
    before: {
      status: verification.status,
      organizationStatus: verification.organization.verificationStatus,
    },
    after: { status: rowTarget, organizationStatus: nextOrgStatus, decision: input.decision },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { verification: updated, organizationStatus: nextOrgStatus };
}

/**
 * Deterministic field comparison of ONE evidence document against the
 * organization record (spec §8.2 / §134 review assist).
 *
 * There is no OCR in this build, so the observed values come from the officer
 * who read the document — never from the tenant — while the expected side is
 * loaded from the database here. With `AI_PROVIDER` unset the local provider
 * runs its deterministic rules; a configured cloud provider answers
 * `CONFIG_ERROR` (missing key), a GDPR gate error (`AI_SEND_DOCUMENTS`
 * unset) or `NOT_IMPLEMENTED` — it never pretends to have read the file.
 * Every check is audited.
 */
async function checkEvidence(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'organization.verify');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, checkEvidenceSchema);
  const prisma = getPrisma();

  const verification = await prisma.organizationVerification.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      organization: {
        select: {
          name: true,
          legalName: true,
          officialEmail: true,
          phone: true,
          website: true,
        },
      },
    },
  });
  if (!verification) throw AppError.notFound('Verification request not found.');

  const link = await prisma.verificationDocument.findFirst({
    where: { verificationId: verification.id, documentId: input.documentId },
    select: { id: true, document: { select: { id: true, type: true, fileName: true } } },
  });
  if (!link) {
    throw AppError.notFound('This document is not part of the verification request.');
  }

  // Expected values: the server-side organization record, field by field. A
  // field with no source value cannot be compared, so it fails loudly instead
  // of silently counting as a mismatch (or worse, a pass).
  const organization = verification.organization;
  const sources: Record<ComparableField, string | null> = {
    name: organization.name,
    legalName: organization.legalName,
    officialEmail: organization.officialEmail,
    phone: organization.phone,
    website: organization.website,
  };
  const expected: Record<string, string> = {};
  for (const field of input.fields) {
    const source = sources[field.name]?.trim();
    if (!source) {
      throw AppError.validation(
        `The organization record has no "${field.name}" value to compare against.`,
      );
    }
    expected[field.name] = source;
  }

  const result = await checkDocument({
    documentType: link.document.type,
    fields: input.fields.map((field) => ({
      name: field.name,
      value: field.value,
      confidence: 1, // human-read: only an OCR pipeline would report less
    })),
    expected,
  });

  await audit({
    actorUserId: user.userId,
    organizationId: verification.organizationId,
    action: 'organization.verification_document_check',
    entityType: 'verificationDocument',
    entityId: link.id,
    after: {
      documentId: link.document.id,
      provider: result.provider,
      decision: result.decision,
      checks: result.checks,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return {
    check: result,
    document: { id: link.document.id, fileName: link.document.fileName },
  };
}

// ── Route table ─────────────────────────────────────────────────

export const verificationRoutes: AppRoute[] = [
  {
    method: 'POST',
    path: '/orgs/:orgId/verifications',
    handler: submitVerification,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Submit a verification request with uploaded documents',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/verifications',
    handler: listOrgVerifications,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Verification history of the organization (paginated)',
  },
  {
    method: 'GET',
    path: '/admin/verifications',
    handler: adminList,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform verification queue (paginated)',
  },
  {
    method: 'GET',
    path: '/admin/verifications/:id',
    handler: adminDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Verification detail with evidence documents (officer only)',
  },
  {
    method: 'POST',
    path: '/admin/verifications/:id/decide',
    handler: decide,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Decide a verification request (state machine, append-only)',
  },
  {
    method: 'POST',
    path: '/admin/verifications/:id/check',
    handler: checkEvidence,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Compare officer-read evidence fields against the org record (audited assist)',
  },
];
