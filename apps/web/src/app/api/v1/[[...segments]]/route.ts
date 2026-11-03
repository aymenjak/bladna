import { initServer } from '@/server/init';
import { Router, type AppRoute } from '@/server/router';
import { coreRoutes } from '@/server/routes/core';
import { participantRoutes } from '@/server/routes/participants';
import { platformRoutes } from '@/server/routes/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

initServer();

/**
 * Cross-table duplicate guard: Router.handle serves the FIRST pattern that
 * matches, so a duplicated METHOD+path would silently shadow an endpoint.
 * Each table asserts its own contents at import time; this covers collisions
 * BETWEEN tables. Verified independently by scripts/check-routes.ts.
 */
function assertNoDuplicateRoutes(routes: AppRoute[]): void {
  const seen = new Set<string>();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate API route across tables: ${key}`);
    }
    seen.add(key);
  }
}

assertNoDuplicateRoutes([...coreRoutes, ...platformRoutes, ...participantRoutes]);

const router = new Router();

router.register(coreRoutes);
router.register(platformRoutes);
router.register(participantRoutes);
router.register([
  {
    method: 'GET',
    path: '/meta',
    auth: 'public',
    summary: 'Self-describing index of every registered endpoint.',
    handler: async () => ({
      ok: true,
      api: 'bladna',
      version: 'v1',
      routes: router.describe(),
    }),
  },
]);

/** Next.js gives each method export the real Request (method included). */
async function dispatch(request: Request, segments?: string[]): Promise<Response> {
  return router.handle(request, segments ?? []);
}

interface RouteCtx {
  params: Promise<{ segments?: string[] }>;
}

export async function GET(request: Request, ctx: RouteCtx): Promise<Response> {
  return dispatch(request, (await ctx.params).segments);
}

export async function POST(request: Request, ctx: RouteCtx): Promise<Response> {
  return dispatch(request, (await ctx.params).segments);
}

export async function PUT(request: Request, ctx: RouteCtx): Promise<Response> {
  return dispatch(request, (await ctx.params).segments);
}

export async function PATCH(request: Request, ctx: RouteCtx): Promise<Response> {
  return dispatch(request, (await ctx.params).segments);
}

export async function DELETE(request: Request, ctx: RouteCtx): Promise<Response> {
  return dispatch(request, (await ctx.params).segments);
}
