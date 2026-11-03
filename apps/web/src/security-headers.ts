// Site-wide security headers (spec §52 transport hardening + defense in depth).
//
// Applied centrally in `src/proxy.ts` to every response the app emits
// (pages, API, robots/sitemap, favicon). Handlers keep their own stricter
// policies where they already have one (`GET /files` adds `sandbox`; all JSON/
// file/CSV/PDF builders set `nosniff` themselves): when two CSPs land on one
// response, browsers enforce ALL of them, so an extra strict policy can only
// tighten — never relax — and a duplicate `nosniff` is at worst redundant.
//
// Design notes:
// * The page CSP is nonce-based because the Next.js App Router emits inline
//   hydration scripts; the proxy mints a per-request nonce, sets it as
//   the `x-nonce` request header (the channel Server Components read) and
//   embeds it in the policy. `'strict-dynamic'` lets the app load its own
//   chunks while modern browsers drop host allow-lists; legacy browsers fall
//   back to `'self'`. Script sources are never `'unsafe-inline'`.
// * HSTS is sent on every response, including plain-HTTP dev: browsers only
//   *process* it over HTTPS and ignore it otherwise, so one code path is
//   correct everywhere — this makes no TLS assumption about the deployment.
// * `Permissions-Policy` keeps `camera` (same-origin QR scanner) and
//   `geolocation` (location pickers); microphone/payment/usb are off.
// * No `upgrade-insecure-requests`: TLS termination is an infrastructure
//   concern, and upgrading here would break plain-HTTP staging environments.

/** `document` = HTML pages (nonce CSP); `api` = JSON/bytes (never a document). */
export type SecurityKind = 'document' | 'api';

export const HSTS_HEADER = 'max-age=31536000; includeSubDomains';

/** 16 random bytes as hex — a valid base64-value charset for CSP nonces. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Build the Content-Security-Policy for a response kind.
 *
 * `isProduction` is injectable so tests can exercise both branches; in the
 * app it defaults to the runtime's NODE_ENV (dev adds the HMR websocket the
 * `'self'` source may not cover on older browsers).
 */
export function buildContentSecurityPolicy(
  kind: SecurityKind,
  nonce: string | undefined,
  isProduction: boolean = process.env.NODE_ENV === 'production',
): string {
  if (kind === 'api') {
    // JSON/byte responses must never be interpreted as documents — mirrors
    // the stricter per-file policy of `GET /files`.
    return "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
  }
  if (!nonce) throw new Error('Document CSP requires a per-request nonce.');
  const devConnect = isProduction ? '' : ' ws://localhost:3000 ws://127.0.0.1:3000';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // React inline `style={}` attributes need 'unsafe-inline' (styles cannot
    // execute script; scripts are covered above).
    "style-src 'self' 'unsafe-inline'",
    // data: — QR data URLs rendered from the API; blob: — object URLs.
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${devConnect}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Apply the full site-wide header set (CSP + hardening headers) in place. */
export function applySecurityHeaders(headers: Headers, kind: SecurityKind, nonce?: string): void {
  headers.set('content-security-policy', buildContentSecurityPolicy(kind, nonce));
  headers.set('strict-transport-security', HSTS_HEADER);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set(
    'permissions-policy',
    'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()',
  );
}
