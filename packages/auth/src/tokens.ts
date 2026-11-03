// Stateless access tokens (JWT, jose) + opaque refresh-token helpers.
// Refresh tokens are stored ONLY as sha256 hashes; raw values live in httpOnly
// cookies on the client. Reuse of a rotated refresh token revokes its family.

import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import type { SystemRole } from '@bladna/types';

export interface AccessTokenClaims {
  /** subject = user id */
  sub: string;
  /** session id */
  sid: string;
  /** token id (jti) — tracked in Session.accessTokenId */
  jti: string;
  roles: SystemRole[];
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(
  claims: Omit<AccessTokenClaims, 'iat' | 'exp' | 'type'>,
  options: { secret: string; ttlSeconds: number },
): Promise<string> {
  return new SignJWT({ ...claims, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${options.ttlSeconds}s`)
    .sign(encodeSecret(options.secret));
}

export type VerifyAccessTokenResult =
  { ok: true; claims: AccessTokenClaims } | { ok: false; reason: 'expired' | 'invalid' };

export async function verifyAccessToken(
  token: string,
  secret: string,
): Promise<VerifyAccessTokenResult> {
  try {
    const { payload } = await jwtVerify(token, encodeSecret(secret), { algorithms: ['HS256'] });
    if (
      payload.type !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string'
    ) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, claims: payload as unknown as AccessTokenClaims };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) return { ok: false, reason: 'expired' };
    return { ok: false, reason: 'invalid' };
  }
}

/** 256-bit opaque refresh token, base64url. */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Short-lived random secret for email verification / password reset / QR codes. */
export function generateOpaqueSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
