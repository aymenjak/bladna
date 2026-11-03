// Prisma CLI project config (Prisma 6 `prisma.config.ts`, discovered from cwd).
//
// The documented contract is a single root `.env` (README: `cp .env.example .env`),
// but the workspace db:* scripts run with cwd=packages/database, where Prisma's
// built-in `.env` auto-load finds nothing — on a fresh checkout
// `npm run db:migrate:deploy` died with P1012 "Environment variable not found:
// DATABASE_URL" instead of ever reaching the database. Walk up to the workspace
// root (the package.json carrying `workspaces`) and load its `.env` here, before
// the CLI resolves the datasource: a missing file is a no-op and real environment
// variables win, so the compose container (injected `environment:`) and CI (no
// `.env` at all) behave exactly as before.
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

function loadRootEnv(): void {
  let dir = process.cwd();
  for (;;) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {
        workspaces?: unknown;
      };
      if (pkg.workspaces) break;
    } catch {
      // unreadable or absent package.json — keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return; // filesystem root: no workspace .env to load
    dir = parent;
  }
  try {
    process.loadEnvFile(path.join(dir, '.env'));
  } catch {
    // no root .env (fresh clone, CI, container) — nothing to load
  }
}

loadRootEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
});
