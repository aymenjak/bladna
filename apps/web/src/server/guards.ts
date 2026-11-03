import { getPrisma } from '@bladna/database';
import { verifyAccessToken } from '@bladna/auth';
import {
  canPerformOrgAction,
  hasSystemPermission,
  SPONSOR_ROLE_PERMISSIONS,
  type Permission,
} from '@bladna/domain';
import { AppError, type LocaleCode, type OrgMemberRole, type SystemRole } from '@bladna/types';
import { ACCESS_COOKIE, readBearerToken, readCookie } from './cookies';
import { env } from './env';
import type { RequestContext } from './http';

/**
 * Authentication & authorization guards (spec §19, §31, §145).
 *
 * Rules:
 *  - The access token is a short-lived JWT whose `sid` must point to an active
 *    session row and whose `jti` must match the session's current token chain —
 *    revocation and refresh rotation therefore take effect immediately.
 *  - Every check runs SERVER SIDE on every request; frontend permission maps
 *    are display logic only.
 *  - Organization actions require an ACTIVE membership whose role grants the
 *    permission (via @bladna/domain), or a platform-wide system permission.
 *  - Privileged system roles additionally require MFA satisfied on the session.
 */

/** System roles that must satisfy MFA before using privileged endpoints (§145). */
export const MFA_PROTECTED_ROLES: readonly SystemRole[] = [
  'MODERATOR',
  'VERIFICATION_OFFICER',
  'SUPPORT',
  'SUPER_ADMIN',
];

export interface SessionUser {
  userId: string;
  sessionId: string;
  roles: SystemRole[];
  email: string;
  emailVerified: boolean;
  /** TOTP was verified for this session (login or 2FA enable step). */
  mfaSatisfied: boolean;
  /** The account has TOTP enabled — sessions must satisfy MFA before general use. */
  totpEnabled: boolean;
  locale: LocaleCode;
  status: string;
}

export interface OrgContext {
  user: SessionUser;
  orgId: string;
  role: OrgMemberRole;
  membershipId: string;
}

export function unauthorized(message = 'Authentication required.'): AppError {
  return AppError.unauthorized(message);
}

/**
 * Reads and fully validates the current session user.
 * Returns null when unauthenticated (expired/invalid/revoked token).
 */
export async function getSessionUser(ctx: RequestContext): Promise<SessionUser | null> {
  const token = readBearerToken(ctx.request) ?? readCookie(ctx.request, ACCESS_COOKIE);
  if (!token) return null;

  const result = await verifyAccessToken(token, env.authSecret);
  if (!result.ok) return null;
  const claims = result.claims;

  const prisma = getPrisma();
  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    include: { user: { include: { twoFactor: { select: { enabledAt: true } } } } },
  });
  if (!session) return null;
  if (session.userId !== claims.sub) return null;
  // token-chain binding: a rotated (or revoked) jti invalidates the old JWT
  if (session.accessTokenId !== claims.jti) return null;
  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) return null;

  const user = session.user;
  return {
    userId: user.id,
    sessionId: session.id,
    roles: user.roles as SystemRole[],
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    mfaSatisfied: session.mfaSatisfiedAt !== null,
    totpEnabled: user.twoFactor?.enabledAt != null,
    locale: (user.preferredLanguage as string).toLowerCase() as LocaleCode,
    status: user.status,
  };
}

/**
 * Paths a TOTP-enabled account may use BEFORE satisfying MFA:
 * the MFA challenge itself, signing out, and reading its own identity
 * (GET /auth/me reports `mfaRequired` so the client can show the code screen).
 */
function isMfaExemptPath(ctx: RequestContext): boolean {
  const path = `/${ctx.segments.join('/')}`;
  if (path.startsWith('/auth/mfa') || path.startsWith('/auth/logout')) return true;
  if (path === '/auth/me' && ctx.method === 'GET') return true;
  return false;
}

/** 401 when unauthenticated, 403 when the account is blocked or MFA is pending. */
export async function requireAuth(ctx: RequestContext): Promise<SessionUser> {
  const user = await getSessionUser(ctx);
  if (!user) throw unauthorized();
  if (['SUSPENDED', 'BANNED', 'DELETED'].includes(user.status)) {
    throw AppError.forbidden('This account is not active.');
  }
  // A TOTP-enabled account is fully locked until the code (or a recovery
  // code) is verified on this session — regardless of role (spec §145).
  if (user.totpEnabled && !user.mfaSatisfied && !isMfaExemptPath(ctx)) {
    throw AppError.mfaRequired('Enter your two-factor code to continue.');
  }
  return user;
}

/** 401/403 when the user lacks a SYSTEM-level permission (privileged roles need MFA). */
export async function requireSystemPermission(
  ctx: RequestContext,
  permission: Permission,
  options: { mfa?: boolean } = {},
): Promise<SessionUser> {
  const user = await requireAuth(ctx);
  if (!hasSystemPermission(user.roles, permission)) {
    throw AppError.forbidden('You do not have permission to perform this action.');
  }
  const needsMfa = options.mfa ?? user.roles.some((role) => MFA_PROTECTED_ROLES.includes(role));
  if (needsMfa && !user.mfaSatisfied) {
    throw AppError.mfaRequired(
      'Enable two-factor authentication to use this feature, then try again.',
    );
  }
  return user;
}

/**
 * Resolves the target organization for a scoped request.
 * Order: explicit argument → `:orgId` path param → `orgId` query param.
 * (Body-derived orgIds are passed explicitly by the handler after validation.)
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveOrgId(ctx: RequestContext, explicit?: string): string {
  const candidate = explicit ?? ctx.params.orgId ?? ctx.query.get('orgId') ?? '';
  if (!candidate) {
    throw AppError.validation('orgId is required.');
  }
  // Validate before it reaches a uuid column (would otherwise surface as a 500).
  if (!UUID_PATTERN.test(candidate)) {
    throw AppError.validation('orgId must be a valid identifier.');
  }
  return candidate;
}

/**
 * 403 unless the caller may perform `permission` inside `orgId`:
 * an ACTIVE membership whose role grants it, or a platform-wide system grant.
 */
export async function requireOrgMembership(
  ctx: RequestContext,
  permission: Permission,
  options: { orgId?: string; mfa?: boolean } = {},
): Promise<OrgContext> {
  const user = await requireAuth(ctx);
  const orgId = resolveOrgId(ctx, options.orgId);

  const prisma = getPrisma();
  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: orgId, userId: user.userId } },
  });

  if (membership && membership.status !== 'ACTIVE') {
    // A deactivated membership does not silently keep platform-granted access
    // to that tenant: platform admins act through dedicated admin endpoints.
    if (!hasSystemPermission(user.roles, permission)) {
      throw AppError.forbidden('Your access to this organization is suspended.');
    }
  }

  const orgRole = membership?.role ?? null;
  if (!canPerformOrgAction(user.roles, orgRole, permission)) {
    throw AppError.forbidden('Your organization role lacks this permission.');
  }

  const needsMfa = options.mfa ?? user.roles.some((role) => MFA_PROTECTED_ROLES.includes(role));
  if (needsMfa && !user.mfaSatisfied) {
    throw AppError.mfaRequired(
      'Enable two-factor authentication to use this feature, then try again.',
    );
  }

  if (!membership) {
    // platform-wide grant without membership: expose the org scope only
    return { user, orgId, role: 'VIEWER', membershipId: '' };
  }
  return { user, orgId, role: membership.role, membershipId: membership.id };
}

/** Sponsor workspace guard using SPONSOR_ROLE_PERMISSIONS from @bladna/domain. */
export async function requireSponsorPermission(
  ctx: RequestContext,
  permission: Permission,
  options: { sponsorId?: string } = {},
): Promise<{ user: SessionUser; sponsorId: string }> {
  const user = await requireAuth(ctx);
  const sponsorId = options.sponsorId ?? ctx.params.sponsorId ?? ctx.query.get('sponsorId') ?? '';
  if (!sponsorId) throw AppError.validation('sponsorId is required.');

  if (hasSystemPermission(user.roles, permission)) return { user, sponsorId };

  const prisma = getPrisma();
  const membership = await prisma.sponsorMember.findUnique({
    where: { sponsorId_userId: { sponsorId, userId: user.userId } },
  });
  if (!membership) throw AppError.forbidden('You do not have access to this sponsor workspace.');

  const granted = SPONSOR_ROLE_PERMISSIONS[membership.role as 'SPONSOR_MEMBER' | 'SPONSOR_ADMIN'];
  if (!granted?.includes(permission)) {
    throw AppError.forbidden('Your sponsor role lacks this permission.');
  }
  return { user, sponsorId };
}

/** 403 when the account has not confirmed its email address. */
export function requireVerifiedEmail(user: SessionUser): void {
  if (!user.emailVerified) {
    throw AppError.forbidden('Please confirm your email address first.');
  }
}
