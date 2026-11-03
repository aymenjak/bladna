import { cookies } from 'next/headers';
import { buildContext, type Handler, type RequestContext } from './http';

/**
 * Invoke a route handler from a server component without an HTTP self-call.
 *
 * The handler runs its own Zod validation exactly as it does behind the router
 * (`apiHandler`), but skips transport concerns that don't apply internally:
 * rate limiting (page views are not API clients) and the same-origin check.
 * Auth DOES apply — the caller's cookies are forwarded, so `requireAuth`,
 * MFA gating and RBAC run server side as usual.
 */
export interface InvokeOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Path after /api/v1, e.g. `/opportunities` or `/auth/me`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  params?: Record<string, string>;
  locale?: string;
  /** Attach the browser cookies (default true) so auth guards see the session. */
  withCookies?: boolean;
}

export async function invoke<T = unknown>(handler: Handler, options: InvokeOptions): Promise<T> {
  const url = new URL(options.path, 'http://ssr.local');
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '')
      url.searchParams.set(key, String(value));
  }

  const headers = new Headers({ 'x-locale': options.locale ?? 'ar' });
  if (options.withCookies !== false) {
    const store = await cookies();
    const cookieHeader = store
      .getAll()
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');
    if (cookieHeader) headers.set('cookie', cookieHeader);
  }

  const request = new Request(url, { method: options.method ?? 'GET', headers });
  const segments = options.path.split('/').filter(Boolean);
  const ctx: RequestContext = buildContext(request, segments, options.params ?? {});
  return (await handler(ctx)) as T;
}
