/**
 * Docs ↔ code drift check for the endpoint reference.
 *
 * `docs/API.md` claims to be extracted from the route tables. This script
 * re-imports the three tables and reports any endpoint that is registered in
 * code but missing from the doc (or documented but no longer registered), so
 * the reference cannot silently rot.
 *
 * Usage: npx tsx scripts/check-api-docs.ts
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreRoutes } from '../apps/web/src/server/routes/core';
import { platformRoutes } from '../apps/web/src/server/routes/platform';
import { participantRoutes } from '../apps/web/src/server/routes/participants';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = readFileSync(path.join(repoRoot, 'docs', 'API.md'), 'utf8');

const tables = [
  ...coreRoutes.map((r) => ({ ...r, table: 'core' })),
  ...platformRoutes.map((r) => ({ ...r, table: 'platform' })),
  ...participantRoutes.map((r) => ({ ...r, table: 'participants' })),
];

// Registered endpoints as `METHOD /path` (the inline `/meta` lives in the
// catch-all route file, not a table, so it is accounted for separately).
const registered = new Set(tables.map((r) => `${r.method} ${r.path}`));
registered.add('GET /meta');

// Every backtick-quoted `METHOD /path` anywhere in the doc. Normalised the
// same way the router sees them: the `/api/v1` base is stripped and query
// strings are dropped, because API.md shows both bare (`GET /health`) and
// fully-qualified (`GET /api/v1/health`) forms, plus examples like
// `GET /public/verify?code=…`.
const documented = new Set<string>();
for (const match of doc.matchAll(/`(GET|POST|PUT|PATCH|DELETE) (\/[^`\s]+)`/g)) {
  const raw = match[2].replace(/^\/api\/v1/, '').replace(/\?.*$/, '');
  documented.add(`${match[1]} ${raw || '/'}`);
}

const missing = [...registered].filter((key) => !documented.has(key)).sort();
const stale = [...documented].filter((key) => !registered.has(key)).sort();

console.log(`registered: ${registered.size}, documented: ${documented.size}`);
if (missing.length) {
  console.log(`\nregistered but NOT documented (${missing.length}):`);
  for (const key of missing) console.log(`  - ${key}`);
}
if (stale.length) {
  console.log(`\ndocumented but NOT registered (${stale.length}):`);
  for (const key of stale) console.log(`  - ${key}`);
}
if (!missing.length && !stale.length) {
  console.log('docs/API.md is in sync with the route tables.');
  process.exit(0);
}
process.exit(1);
