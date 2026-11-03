// Cross-table route duplicate check (lead tooling).
//
// Router.handle picks the FIRST pattern that matches a path, so two tables
// declaring the same METHOD+path would silently shadow an endpoint. Each table
// guards itself at import time (platform.ts, participants.ts); this script adds
// the missing cross-table view. The same assertion is embedded in
// app/api/v1/[[...segments]]/route.ts so `next build` / dev fail loudly.
//
// Run: npx tsx scripts/check-routes.ts

import { coreRoutes } from '../apps/web/src/server/routes/core';
import { participantRoutes } from '../apps/web/src/server/routes/participants';
import { platformRoutes } from '../apps/web/src/server/routes/platform';
import type { AppRoute } from '../apps/web/src/server/router';

const tables: Array<[string, AppRoute[]]> = [
  ['core', coreRoutes],
  ['platform', platformRoutes],
  ['participants', participantRoutes],
];

const seen = new Map<string, string>();
let total = 0;
let duplicates = 0;

for (const [table, routes] of tables) {
  for (const route of routes) {
    total += 1;
    const key = `${route.method} ${route.path}`;
    const previous = seen.get(key);
    if (previous !== undefined) {
      duplicates += 1;
      console.error(`DUPLICATE ${key}: declared in "${previous}" and "${table}"`);
    } else {
      seen.set(key, table);
    }
  }
}

console.log(
  `routes: ${total} total (${tables.map(([name, routes]) => `${name}=${routes.length}`).join(', ')}), duplicates: ${duplicates}`,
);
process.exit(duplicates > 0 ? 1 : 0);
