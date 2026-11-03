// Public verification endpoint (spec §72) — consumed by the /verify page
// (verify-client.tsx), which reads `type`, `valid`, `holderName`,
// `organizationName`, `hours` and `verifiedAt` from the payload (a null
// `hours` hides that row: the page only renders it for numbers).
//
// One `code` field resolves strictly in order:
//   (a) certificate  — certificateNumber (case-insensitive) or its
//       verification token,
//   (b) volunteer    — publicToken (exact),
//   (c) organization — slug (case-insensitive, soft-deleted tenants excluded).
// A KNOWN certificate is always HTTP 200: revoked/expired rows report
// `valid: false` (the page renders the invalid panel), only an unknown code
// is a 404. No session, no PII beyond holder/org/hours/number/status.
//
// Privacy: the volunteer branch withholds its verified-hour total when the
// holder set `showHours=false` (spec §30). Certificate facts are never
// withheld — someone presenting a credential reference always gets the full
// answer, because verification must not depend on mutable privacy flags.

import { getPrisma } from '@bladna/database';
import { AppError } from '@bladna/types';
import { query, type RequestContext } from '../http';
import { z } from 'zod';
import type { AppRoute } from '../router';

const verifyQuerySchema = z.object({ code: z.string().trim().min(4).max(200) });

/**
 * Stored VALID but already past its expiry: report EXPIRED without mutating
 * the row (the expiry cron owns the transition through CERTIFICATE_TRANSITIONS).
 */
function effectiveStatus(row: { status: string; expiresAt: Date | null }): string {
  if (row.status === 'VALID' && row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    return 'EXPIRED';
  }
  return row.status;
}

async function verify(ctx: RequestContext): Promise<unknown> {
  const { code } = query(ctx, verifyQuerySchema);
  const prisma = getPrisma();

  // (a) certificate — number (case-insensitive) or non-guessable verify token.
  const certificate = await prisma.volunteerCertificate.findFirst({
    where: {
      OR: [
        { certificateNumber: { equals: code, mode: 'insensitive' } },
        { verificationToken: code },
      ],
    },
    select: {
      status: true,
      expiresAt: true,
      hours: true,
      issuedAt: true,
      certificateNumber: true,
      volunteerProfile: { select: { user: { select: { firstName: true, lastName: true } } } },
      organization: { select: { name: true } },
    },
  });
  if (certificate) {
    const status = effectiveStatus(certificate);
    const holder = certificate.volunteerProfile.user;
    return {
      type: 'certificate',
      // Revoked/expired → 200 with valid:false, never a 404.
      valid: status === 'VALID',
      holderName: `${holder.firstName} ${holder.lastName}`.trim(),
      organizationName: certificate.organization.name,
      hours: certificate.hours.toNumber(),
      verifiedAt: certificate.issuedAt.toISOString(),
      certificateNumber: certificate.certificateNumber,
      status,
    };
  }

  // (b) volunteer — non-guessable public token (exact match).
  const profile = await prisma.volunteerProfile.findUnique({
    where: { publicToken: code },
    select: {
      id: true,
      volunteerId: true,
      publicProfile: true,
      showHours: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
  if (profile) {
    // showHours=false → hours withheld (null), and the aggregate is never
    // even queried. The verify page hides the row for non-numbers.
    let hours: number | null = null;
    if (profile.showHours) {
      const verified = await prisma.volunteerHour.aggregate({
        where: { volunteerProfileId: profile.id, status: 'VERIFIED' },
        _sum: { hours: true },
      });
      hours = verified._sum.hours ? verified._sum.hours.toNumber() : 0;
    }
    return {
      type: 'volunteer',
      valid: profile.publicProfile !== false,
      holderName: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
      organizationName: null,
      volunteerId: profile.volunteerId,
      hours,
      verifiedAt: null,
    };
  }

  // (c) organization — public slug; soft-deleted tenants never resolve.
  const organization = await prisma.organization.findFirst({
    where: { slug: { equals: code, mode: 'insensitive' }, deletedAt: null },
    select: { name: true, status: true },
  });
  if (organization) {
    return {
      type: 'organization',
      valid: organization.status === 'ACTIVE',
      organizationName: organization.name,
      status: organization.status,
    };
  }

  throw AppError.notFound('This code does not match any certificate, volunteer or organization.');
}

// ── Route table ────────────────────────────────────────────────

export const publicRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/public/verify',
    handler: verify,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Verify a certificate number/token, volunteer public token or organization slug',
  },
];
