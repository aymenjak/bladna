// HTTP layer: request context, envelope responses, validation, rate limiting,
// origin checks and centralized error handling (spec §55, §56, §88, §100).

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { AppError, failure, isAppError, success, type ApiMeta } from '@bladna/types';
import { RATE_LIMIT_TIERS, rateLimiter } from '@bladna/auth';
import { toValidationError } from '@bladna/validation';
import { env } from './env';

export interface RequestContext {
  request: Request;
  /** path segments after /api/v1 */
  segments: string[];
  params: Record<string, string>;
  query: URLSearchParams;
  method: string;
  requestId: string;
  ip: string;
  userAgent: string;
  locale: string;
}

export type Handler = (ctx: RequestContext) => Promise<unknown> | unknown;

export interface RouteOptions {
  /** rate limiting tier key from RATE_LIMIT_TIERS */
  rateLimit?: keyof typeof RATE_LIMIT_TIERS;
  /** skip same-origin check (used by health checks) */
  skipOriginCheck?: boolean;
}

export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** pattern after /api/v1, e.g. /opportunities/:slug */
  path: string;
  handler: Handler;
  options?: RouteOptions;
}

/** Thrown by handlers to emit a raw Response (PDF, QR image, CSV…). */
export class RawResponse {
  constructor(readonly response: Response) {}
}

export function getHeader(request: Request, name: string): string {
  return request.headers.get(name) ?? '';
}

export function clientIp(request: Request): string {
  if (env.trustProxy) {
    const forwarded = getHeader(request, 'x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return getHeader(request, 'x-real-ip') || 'local';
}

export function buildContext(
  request: Request,
  segments: string[],
  params: Record<string, string>,
): RequestContext {
  const url = new URL(request.url);
  return {
    request,
    segments,
    params,
    query: url.searchParams,
    method: request.method,
    requestId: getHeader(request, 'x-request-id') || randomUUID(),
    ip: clientIp(request),
    userAgent: getHeader(request, 'user-agent').slice(0, 500),
    locale: getHeader(request, 'x-locale') || 'ar',
  };
}

/**
 * Parsers are typed `ZodType<T, ZodTypeDef, unknown>` (not `ZodType<T>`,
 * which forces Input = Output): schemas with `.default()`/`.optional()` have a
 * wider input type, and handlers must see the parsed **output** type.
 */
export async function body<T>(
  ctx: RequestContext,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T> {
  let payload: unknown;
  try {
    payload = await ctx.request.json();
  } catch {
    throw AppError.validation('Request body must be valid JSON.');
  }
  const result = schema.safeParse(payload);
  if (!result.success) throw toValidationError(result.error);
  return result.data;
}

/** Validate query parameters with a Zod schema. */
export function query<T>(ctx: RequestContext, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const result = schema.safeParse(Object.fromEntries(ctx.query.entries()));
  if (!result.success) throw toValidationError(result.error, 'Invalid query parameters.');
  return result.data;
}

/** Validate `:param` path values with a Zod schema (uuid params, slugs…). */
export function pathParams<T>(ctx: RequestContext, schema: z.ZodType<T, z.ZodTypeDef, unknown>): T {
  const result = schema.safeParse(ctx.params);
  if (!result.success) throw toValidationError(result.error, 'Invalid path parameters.');
  return result.data;
}

export function json(data: unknown, meta?: ApiMeta, init?: ResponseInit): Response {
  return new Response(JSON.stringify(success(data, meta)), {
    status: init?.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      ...init?.headers,
    },
  });
}

export function errorResponse(error: unknown, requestId: string): Response {
  const appError = isAppError(error)
    ? error
    : AppError.internal(error instanceof Error ? error.message : 'unknown error');

  if (appError.code === 'INTERNAL_ERROR') {
    // internal details are logged, never returned
    console.error(`[${requestId}] INTERNAL_ERROR`, appError.internalMessage ?? appError.message, {
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  return new Response(
    JSON.stringify(
      failure({
        code: appError.code,
        message: appError.message,
        ...(appError.details !== undefined ? { details: appError.details } : {}),
      }),
    ),
    {
      status: appError.status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-content-type-options': 'nosniff',
        'x-request-id': requestId,
      },
    },
  );
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Same-origin enforcement for cookie-authenticated mutations (CSRF mitigation,
 * spec §52). SameSite cookies are the primary defense; this is defense in depth.
 */
export function assertSameOrigin(request: Request): void {
  if (!MUTATING_METHODS.has(request.method)) return;
  const origin = getHeader(request, 'origin');
  if (!origin) return; // non-browser clients (mobile) don't send Origin

  // The Origin header must be a well-formed, already-normalized origin. It is
  // NEVER added to the allowlist itself — an earlier revision did
  // `allowed.add(new URL(origin).origin)`, which whitelisted the caller's own
  // origin and made this check a no-op for every browser request. Only the app
  // URLs and the request's own host may qualify.
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    throw AppError.forbidden('Invalid Origin header.');
  }
  if (normalized !== origin) {
    // Browsers serialize Origin as its normalized origin; anything else
    // (default ports, file:, "null", mixed case) is not trusted.
    throw AppError.forbidden('Invalid Origin header.');
  }

  const allowed = new Set([
    env.appUrl,
    env.publicAppUrl,
    env.appUrl.replace('https://', 'http://'),
  ]);
  // Same-host origins on any port (dev servers, container mapping).
  const host = getHeader(request, 'host');
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin && !allowed.has(origin)) {
    throw AppError.forbidden('Cross-origin request rejected.');
  }
}

/**
 * Origin for links a response hands out right now (the attendance QR and
 * other in-request deep links): the caller's own origin when its host is one
 * we serve — a configured app URL or a local dev server — so the link follows
 * the surface the reader is actually on (the public domain behind the reverse
 * proxy, `localhost:<port>` in development). Anything else, including a
 * forged `Host`/`X-Forwarded-Host`, falls back to the configured public app
 * URL, so a crafted header can never rewrite generated links; an explicit
 * `X-Forwarded-Proto` (set by the proxy) wins over the internal scheme.
 */
export function originFor(request: Request): string {
  let host = '';
  try {
    host = (
      getHeader(request, 'x-forwarded-host').split(',')[0].trim() ||
      getHeader(request, 'host').split(',')[0].trim() ||
      new URL(request.url).host
    ).toLowerCase();
  } catch {
    return env.publicAppUrl;
  }
  if (!host) return env.publicAppUrl;

  const forwardedProto = getHeader(request, 'x-forwarded-proto').split(',')[0].trim();
  const proto = forwardedProto === 'http' || forwardedProto === 'https' ? forwardedProto : null;

  for (const configured of [env.appUrl, env.publicAppUrl]) {
    try {
      const url = new URL(configured);
      if (url.host === host) return `${proto ?? url.protocol.slice(0, -1)}://${host}`;
    } catch {
      // An unparsable configured URL never authorizes a host.
    }
  }

  const hostname = host.split(':')[0];
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    let scheme = proto;
    if (!scheme) {
      try {
        scheme = new URL(request.url).protocol.slice(0, -1);
      } catch {
        // fall through to http below
      }
    }
    return `${scheme ?? 'http'}://${host}`;
  }
  return env.publicAppUrl;
}

export function enforceRateLimit(
  ctx: RequestContext,
  tierKey: keyof typeof RATE_LIMIT_TIERS,
): void {
  const rule = RATE_LIMIT_TIERS[tierKey];
  const authLike = ctx.request.headers.get('cookie')?.includes('bladna_at');
  const key = `${tierKey}:${authLike ? 'auth' : ''}${ctx.ip}`;
  const result = rateLimiter.consume(key, rule);
  if (!result.allowed) {
    throw AppError.rateLimited('Too many requests. Please slow down.');
  }
}

/** Wrap a handler with rate limiting, origin check and error handling. */
export function apiHandler(
  route: RouteDefinition,
): (request: Request, segments: string[]) => Promise<Response> {
  return async (request: Request, segments: string[]) => {
    const ctx = buildContext(request, segments, matchParams(route.path, segments));
    try {
      enforceRateLimit(ctx, route.options?.rateLimit ?? 'public');
      if (!route.options?.skipOriginCheck) assertSameOrigin(request);
      const data = await route.handler(ctx);
      if (data instanceof RawResponse) return data.response;
      if (data instanceof Response) return data;
      return json(data, { requestId: ctx.requestId });
    } catch (error) {
      return errorResponse(error, ctx.requestId);
    }
  };
}

/** Extract :param values from a pattern for a concrete path. */
export function matchParams(pattern: string, segments: string[]): Record<string, string> {
  const patternSegments = pattern.split('/').filter(Boolean);
  const params: Record<string, string> = {};
  patternSegments.forEach((segment, index) => {
    if (segment.startsWith(':')) {
      const value = segments[index];
      if (value !== undefined) params[segment.slice(1)] = decodeURIComponent(value);
    }
  });
  return params;
}
