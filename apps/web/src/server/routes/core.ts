// Core route table (Phase 1): auth, taxonomies, locations, opportunities,
// applications plus platform self-describing endpoints (/health).
// Later phases append their own tables (routes/participants.ts, routes/platform.ts).

import { pingDatabase } from '@bladna/database';
import { RawResponse } from '../http';
import type { AppRoute } from '../router';
import { authRoutes } from '../modules/auth';
import { taxonomyRoutes } from '../modules/taxonomies';
import { locationRoutes } from '../modules/locations';
import { opportunityRoutes } from '../modules/opportunities';
import { applicationRoutes } from '../modules/applications';
import { supportRoutes } from '../modules/support';

/**
 * Liveness/readiness probe: verifies the database is reachable with a bounded
 * timeout and reports 503 when it is not, so orchestrators and uptime checks
 * can distinguish "process up" from "actually serving".
 */
async function health(): Promise<RawResponse> {
  const started = Date.now();
  const { ok, error } = await pingDatabase(3000);
  return new RawResponse(
    new Response(
      JSON.stringify({
        status: ok ? 'ok' : 'degraded',
        database: ok ? 'up' : 'down',
        ...(ok ? {} : { error }),
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      }),
      {
        status: ok ? 200 : 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      },
    ),
  );
}

export const coreRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/health',
    handler: health,
    auth: 'public',
    summary: 'Database health probe (200 ok / 503 degraded).',
    options: { skipOriginCheck: true, rateLimit: 'public' },
  },
  ...authRoutes,
  ...taxonomyRoutes,
  ...locationRoutes,
  ...opportunityRoutes,
  ...applicationRoutes,
  ...supportRoutes,
];
