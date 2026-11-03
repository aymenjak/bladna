import { randomUUID } from 'node:crypto';
import { AppError } from '@bladna/types';
import { apiHandler, errorResponse, getHeader, type RouteDefinition } from './http';

/**
 * Matcher-based router (docs/ARCHITECTURE.md §"Route table").
 *
 * Instead of 100+ `route.ts` files, endpoints are declared as a flat table of
 * `RouteDefinition`s with `/auth/login`, `/opportunities/:slug` style patterns
 * (segments after `/api/v1`). Dispatch finds the matching method+path and
 * delegates to `apiHandler`, so rate limiting, origin checks, validation,
 * envelopes and error handling stay uniform everywhere. This also lets modules
 * be developed in parallel without file-system routing conflicts.
 */

/** RouteDefinition + documentation-only metadata. */
export interface AppRoute extends RouteDefinition {
  /** Doc only: 'public' | 'authenticated' | 'org' | 'admin' … */
  auth?: string;
  summary?: string;
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  const params: Record<string, string> = {};

  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p === '*') {
      params['*'] = pathParts.slice(i).join('/');
      return params;
    }
    const segment = pathParts[i];
    if (segment === undefined) return null;
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(segment);
    } else if (p !== segment) {
      return null;
    }
  }
  if (pathParts.length !== patternParts.length) return null;
  return params;
}

export class Router {
  private routes: AppRoute[] = [];

  register(routes: AppRoute[]): this {
    this.routes.push(...routes);
    return this;
  }

  list(): AppRoute[] {
    return this.routes;
  }

  /** Mounted at `/api/v1/[[...segments]]`: `segments` are the path parts after it. */
  handle = async (request: Request, segments: string[] = []): Promise<Response> => {
    const path = segments.length > 0 ? `/${segments.join('/')}` : '/';
    const normalized = path.replace(/\/{2,}/g, '/').replace(/\/+$/, '') || '/';

    const pathMatches = this.routes.filter((r) => matchPath(r.path, normalized) !== null);
    const methodMatch = pathMatches.find((r) => r.method === request.method);

    if (methodMatch) {
      // apiHandler builds the context, enforces rate limit + origin check,
      // runs the handler and wraps the envelope / error shape.
      return apiHandler(methodMatch)(request, segments);
    }

    const requestId = getHeader(request, 'x-request-id') || randomUUID();
    if (pathMatches.length > 0) {
      return errorResponse(
        new AppError(
          'METHOD_NOT_ALLOWED',
          `Method ${request.method} is not allowed on ${normalized}.`,
        ),
        requestId,
      );
    }
    return errorResponse(AppError.notFound('Endpoint not found.'), requestId);
  };

  /** Registered endpoints, exposed for the self-describing `/meta` endpoint. */
  describe(): Array<{ method: string; path: string; auth: string; summary?: string }> {
    return this.routes.map((r) => ({
      method: r.method,
      path: `/api/v1${r.path}`,
      auth: r.auth ?? 'public',
      ...(r.summary ? { summary: r.summary } : {}),
    }));
  }
}
