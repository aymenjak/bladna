import { randomUUID } from 'node:crypto';
import { getPrisma } from '@bladna/database';
import type { Prisma } from '@bladna/database';
import { generateRefreshToken, hashToken, signAccessToken } from '@bladna/auth';
import { AppError, type SystemRole } from '@bladna/types';
import { env } from '../env';
import type { RequestContext } from '../http';

/**
 * Session lifecycle (spec §14, §52, §145).
 *
 * - Refresh tokens are 256-bit opaque values stored ONLY as sha256 hashes.
 * - Rotation is a compare-and-swap: the update only succeeds while the
 *   presented hash still matches, so concurrent refreshes cannot fork a family.
 * - The previous rotation's hash is kept: presenting it again proves the token
 *   was copied → the whole family is revoked (reuse detection).
 * - Each rotation also rotates the access-token jti, so the old access JWT
 *   stops validating immediately (guards compare `jti` vs `accessTokenId`).
 */

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTtl: number;
  refreshTtl: number;
  sessionId: string;
}

export interface SessionMeta {
  ip?: string | null;
  userAgent?: string | null;
  mfaSatisfied?: boolean;
}

export async function createSession(
  userId: string,
  roles: readonly SystemRole[],
  meta: SessionMeta = {},
): Promise<IssuedTokens> {
  const prisma = getPrisma();
  const refreshToken = generateRefreshToken();
  const jti = randomUUID();

  const session = await prisma.session.create({
    data: {
      userId,
      familyId: randomUUID(),
      accessTokenId: jti,
      refreshTokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent?.slice(0, 500) ?? null,
      ipAddress: meta.ip ?? null,
      expiresAt: new Date(Date.now() + env.refreshTokenTtl * 1000),
      mfaSatisfiedAt: meta.mfaSatisfied ? new Date() : null,
    },
  });

  const accessToken = await signAccessToken(
    { sub: userId, sid: session.id, jti, roles: [...roles] },
    { secret: env.authSecret, ttlSeconds: env.accessTokenTtl },
  );

  return {
    accessToken,
    refreshToken,
    accessTtl: env.accessTokenTtl,
    refreshTtl: env.refreshTokenTtl,
    sessionId: session.id,
  };
}

/** Marks the session as MFA-verified (login TOTP or the 2FA enable step). */
export async function markMfaSatisfied(sessionId: string): Promise<void> {
  await getPrisma().session.update({
    where: { id: sessionId },
    data: { mfaSatisfiedAt: new Date() },
  });
}

export async function revokeSession(sessionId: string, reason: string): Promise<void> {
  await getPrisma().session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
}

export async function revokeUserSessions(
  userId: string,
  reason: string,
  exceptSessionId?: string,
): Promise<number> {
  const res = await getPrisma().session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return res.count;
}

/**
 * Rotates a refresh token (spec §14). Throws UNAUTHORIZED on invalid, expired,
 * revoked or REUSED tokens — reuse revokes the entire family.
 */
export async function rotateSession(
  presentedToken: string,
  meta: SessionMeta = {},
): Promise<IssuedTokens> {
  const prisma = getPrisma();
  const presentedHash = hashToken(presentedToken);

  const session = await prisma.session.findUnique({ where: { refreshTokenHash: presentedHash } });

  if (!session) {
    // Not the current hash — is it a previously rotated one? → theft.
    const reused = await prisma.session.findFirst({
      where: { previousRefreshTokenHash: presentedHash, revokedAt: null },
    });
    if (reused) {
      await prisma.session.updateMany({
        where: { familyId: reused.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'refresh_token_reuse' },
      });
      throw AppError.unauthorized('Session revoked for security reasons. Please sign in again.');
    }
    throw AppError.unauthorized('Invalid session.');
  }

  if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
    throw AppError.unauthorized('Session expired. Please sign in again.');
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.deletedAt || ['SUSPENDED', 'BANNED', 'DELETED'].includes(user.status)) {
    throw AppError.unauthorized('Account is not active.');
  }

  const newRefreshToken = generateRefreshToken();
  const newJti = randomUUID();

  // Compare-and-swap: only one concurrent refresh can win.
  const result = await prisma.session.updateMany({
    where: { id: session.id, refreshTokenHash: presentedHash, revokedAt: null },
    data: {
      previousRefreshTokenHash: session.refreshTokenHash,
      refreshTokenHash: hashToken(newRefreshToken),
      accessTokenId: newJti,
      lastUsedAt: new Date(),
      userAgent: meta.userAgent?.slice(0, 500) ?? session.userAgent,
      ipAddress: meta.ip ?? session.ipAddress,
    },
  });
  if (result.count === 0) {
    throw AppError.unauthorized('Session already rotated. Please sign in again.');
  }

  const accessToken = await signAccessToken(
    { sub: session.userId, sid: session.id, jti: newJti, roles: [...(user.roles as SystemRole[])] },
    { secret: env.authSecret, ttlSeconds: env.accessTokenTtl },
  );

  return {
    accessToken,
    refreshToken: newRefreshToken,
    accessTtl: env.accessTokenTtl,
    refreshTtl: env.refreshTokenTtl,
    sessionId: session.id,
  };
}

/** Session row for the caller's current session (used by /auth/sessions). */
export async function currentSessionId(ctx: RequestContext): Promise<string | null> {
  const { getSessionUser } = await import('../guards');
  const user = await getSessionUser(ctx);
  return user?.sessionId ?? null;
}

export type { Prisma };
