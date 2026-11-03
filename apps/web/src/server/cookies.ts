// Secure cookie helpers for access/refresh tokens (spec §52).

import { env } from './env';

export const ACCESS_COOKIE = 'bladna_at';
export const REFRESH_COOKIE = 'bladna_rt';
export const LOCALE_COOKIE = 'bladna_locale';

const COMMON = {
  httpOnly: true,
  // Also Secure whenever the app is served over HTTPS (e.g. a tunnel in front of
  // a non-production NODE_ENV) — browsers treat http://localhost as secure too.
  secure: env.isProduction || env.appUrl.startsWith('https://'),
  sameSite: 'lax' as const,
  path: '/',
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {}),
};

export function setAuthCookies(
  response: Response,
  tokens: { accessToken: string; refreshToken: string; accessTtl: number; refreshTtl: number },
): void {
  const now = Date.now();
  response.headers.append(
    'Set-Cookie',
    serializeCookie(ACCESS_COOKIE, tokens.accessToken, { ...COMMON, maxAge: tokens.accessTtl }),
  );
  response.headers.append(
    'Set-Cookie',
    serializeCookie(REFRESH_COOKIE, tokens.refreshToken, { ...COMMON, maxAge: tokens.refreshTtl }),
  );
  void now;
}

export function clearAuthCookies(response: Response): void {
  response.headers.append(
    'Set-Cookie',
    serializeCookie(ACCESS_COOKIE, '', { ...COMMON, maxAge: 0 }),
  );
  response.headers.append(
    'Set-Cookie',
    serializeCookie(REFRESH_COOKIE, '', { ...COMMON, maxAge: 0 }),
  );
}

export function serializeCookie(
  name: string,
  value: string,
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'lax' | 'strict' | 'none';
    path?: string;
    maxAge?: number;
    domain?: string;
  },
): string {
  const parts = [`${name}=${value}`, `Path=${options.path ?? '/'}`];
  if (options.maxAge !== undefined)
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite)
    parts.push(`SameSite=${options.sameSite.charAt(0).toUpperCase()}${options.sameSite.slice(1)}`);
  return parts.join('; ');
}

/** Read a cookie value from a Request (no decoding surprises). */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Bearer token support for mobile clients. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}
