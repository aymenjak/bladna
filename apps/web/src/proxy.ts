import { NextResponse, type NextRequest } from 'next/server';
import { applySecurityHeaders, newNonce, type SecurityKind } from './security-headers';

/**
 * Locale routing (spec §46) + site-wide security headers (spec §52).
 *
 * Next 16 file convention: this is `proxy.ts` (the `middleware` filename and
 * `middleware` export were deprecated in Next 16 and renamed to `proxy`).
 * The proxy runs on the `nodejs` runtime — no edge-only APIs are used here,
 * only the portable `NextRequest`/`NextResponse` surface.
 *
 * Locale: every page lives under `/ar`, `/fr` or `/en`.
 *   1. Paths already prefixed with a valid locale pass through; the locale is
 *      forwarded to the server as `x-locale` (the root layout reads it to set
 *      `<html lang/dir>`) and persisted in a cookie.
 *   2. Everything else under locale-eligibility is redirected to the detected
 *      locale: path prefix → cookie → Accept-Language → default (ar, Algeria-first).
 *
 * Security: every response that leaves the server — pages, API, robots/sitemap,
 * favicon — receives the site-wide header set from `security-headers.ts`
 * (nonce CSP for documents, `default-src 'none'` policy for the API, HSTS,
 * nosniff, frame/referrer/permissions policies). The locale-eligibility rule
 * below reproduces the exact behavior the previous matcher enforced
 * (`api…`/`_next…` prefixes and any path containing a dot were excluded): those
 * paths now run through this proxy for headers only — locale logic never
 * touches them. A fresh document nonce is minted per request and forwarded as
 * `x-nonce` for Server Components.
 */

const LOCALES = ['ar', 'fr', 'en'] as const;
const DEFAULT_LOCALE: (typeof LOCALES)[number] = 'ar';
const LOCALE_COOKIE = 'bladna_locale';

// M6 cache policy. Session cookies are read here (not via server/cookies.ts,
// which pulls in the env module — the proxy stays dependency-light).
const ACCESS_COOKIE = 'bladna_at';
const REFRESH_COOKIE = 'bladna_rt';

/** Next's dynamic-render default — kept byte-identical so non-public paths behave exactly as before. */
const PRIVATE_CACHE_CONTROL = 'private, no-cache, no-store, max-age=0, must-revalidate';
/**
 * Anonymous public discovery pages: 60s in every cache, 5min revalidation window.
 *
 * NOTE on `Vary: Cookie` — it cannot be delivered from any pre-render layer.
 * Verified empirically 2026-09-26 against next@15.5.26: middleware and
 * `next.config headers()` both set headers BEFORE the App Router render, and
 * the route module then replaces `Vary` wholesale
 * (`app-page.js: res.setHeader('Vary', <RSC vary list>)`), so a `Cookie`
 * entry never reaches the client (confirmed by `curl -I`). Safety therefore
 * rests on the gating in `applyPageCachePolicy` instead: only responses
 * rendered with NO session cookie are ever marked `public`, and every
 * session-bearing response is `private, no-store` — a cache can never hold
 * per-user data. Residual (documented in docs/RESEARCH.md M6): a shared
 * cache may serve the cookie-less chrome to a signed-in user; cosmetic only,
 * and this deployment runs no shared cache in front of `next start`.
 */
const PUBLIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300';

/** Locale-relative paths whose ANONYMOUS HTML may be cached briefly. */
const PUBLIC_CACHE_PREFIXES = ['/opportunities', '/organizations', '/campaigns', '/verify'];
const PUBLIC_CACHE_EXACT = ['/', '/map', '/safety', '/terms', '/privacy'];
/**
 * Hard exclusion, checked before the allow-list: the auth flows must never be
 * shared-cacheable even if someone later widens the allow-list above. They are
 * already outside it — this makes the rule explicit and regression-proof.
 */
const PUBLIC_CACHE_EXCLUDE = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/verify-email',
];

function isPublicCachePath(pagePath: string): boolean {
  if (PUBLIC_CACHE_EXCLUDE.some((path) => pagePath === path || pagePath.startsWith(`${path}/`)))
    return false;
  if (PUBLIC_CACHE_EXACT.includes(pagePath)) return true;
  return PUBLIC_CACHE_PREFIXES.some(
    (prefix) => pagePath === prefix || pagePath.startsWith(`${prefix}/`),
  );
}

/**
 * M6: explicit Cache-Control per response class.
 *
 * Anonymous GET/HEAD on a public discovery page → short public caching (browser
 * + shared) so mobile networks get a warm TTFB. Everything else — session
 * cookies present, non-allow-listed path, non-GET — → Next's exact dynamic
 * default so private pages are byte-identical to before. The gating carries the
 * safety load (`Vary: Cookie` is undeliverable — see PUBLIC_CACHE_CONTROL), so
 * a cached copy can only ever be the anonymous render: no per-user HTML is
 * marked `public`, and session responses stay `no-store`. API responses are
 * untouched (out of scope).
 */
function applyPageCachePolicy(
  request: NextRequest,
  response: NextResponse,
  pagePath: string,
): void {
  const method = request.method;
  const hasSession = request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);
  const cacheable =
    (method === 'GET' || method === 'HEAD') && !hasSession && isPublicCachePath(pagePath);

  response.headers.set('Cache-Control', cacheable ? PUBLIC_CACHE_CONTROL : PRIVATE_CACHE_CONTROL);
}

function isLocale(value: string | undefined): value is (typeof LOCALES)[number] {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

function detectFromAcceptLanguage(header: string | null): (typeof LOCALES)[number] | null {
  if (!header) return null;
  for (const part of header.split(',')) {
    const code = part.split(';')[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(code)) return code;
  }
  return null;
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const rest = pathname.slice(1);

  // Same eligibility the old matcher enforced: skip locale handling for the
  // API, Next internals and any path carrying a dot (robots.txt, favicon…).
  const localeEligible =
    !rest.startsWith('api') && !rest.startsWith('_next') && !rest.includes('.');
  const kind: SecurityKind = rest.startsWith('api') ? 'api' : 'document';
  const nonce = kind === 'document' ? newNonce() : undefined;

  if (!localeEligible) {
    // Headers only — locale logic must never touch these paths.
    const response = NextResponse.next();
    applySecurityHeaders(response.headers, kind, nonce);
    return response;
  }

  const first = pathname.split('/')[1];
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;

  // Already localized → forward the locale and keep the cookie in sync.
  if (isLocale(first)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-locale', first);
    if (nonce) requestHeaders.set('x-nonce', nonce);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (cookieLocale !== first) {
      response.cookies.set(LOCALE_COOKIE, first, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    }
    applySecurityHeaders(response.headers, kind, nonce);
    // M6: pathname with the locale prefix stripped ('/en' -> '/', '/en/map' -> '/map').
    const pagePath = pathname.slice(first.length + 1) || '/';
    applyPageCachePolicy(request, response, pagePath);
    return response;
  }

  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : (detectFromAcceptLanguage(request.headers.get('accept-language')) ?? DEFAULT_LOCALE);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  const response = NextResponse.redirect(url);
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  applySecurityHeaders(response.headers, kind, nonce);
  return response;
}

export const config = {
  // Every response except statically served Next assets (immutable chunks).
  matcher: ['/((?!_next/static|_next/image).*)'],
};
