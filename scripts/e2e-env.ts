// Side-effect environment loader for the E2E runner (imported first by
// scripts/e2e-global-setup.ts and tests/e2e/helpers.ts, before anything that
// reads process.env).
//
// Playwright runs outside the Next.js runtime, so Next's built-in .env
// loading does not apply. This module reads the repository-root `.env`
// synchronously and populates process.env for keys that are not already set,
// mirroring how the dev server sees the same values (same file, same
// precedence: an inherited real environment variable wins).

import { readFileSync } from 'node:fs';
import path from 'node:path';

// `__dirname`, not `import.meta.url`: this module is loaded by Playwright,
// which compiles TypeScript to CommonJS for this package (no "type":"module"),
// where `import.meta` is a syntax error. Plain `tsx` loads it the same way.
const repoRoot = path.resolve(__dirname, '..');
const envFile = path.join(repoRoot, '.env');

/** Minimal POSIX-style KEY=VALUE parser: comments, blank lines, optional quotes. */
function parseEnvFile(contents: string): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    pairs.push([key, value]);
  }
  return pairs;
}

let loaded = 0;
try {
  for (const [key, value] of parseEnvFile(readFileSync(envFile, 'utf8'))) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
      loaded += 1;
    }
  }
} catch (error) {
  // Fail loudly: without .env the runner cannot derive AUTH_SECRET (QR/TOTP
  // crafting) or DATABASE_URL (fixture lookups), and every assertion would
  // fail confusingly later. Exception: CI ships no .env at all — there the
  // same two keys arrive through the job environment (the contract
  // prisma.config.ts already follows), so a readable file is not required.
  const message = error instanceof Error ? error.message : String(error);
  if (!process.env.AUTH_SECRET || !process.env.DATABASE_URL) {
    throw new Error(`e2e-env: cannot read ${envFile}: ${message}`);
  }
}

for (const required of ['AUTH_SECRET', 'DATABASE_URL'] as const) {
  if (!process.env[required]) {
    throw new Error(`e2e-env: missing ${required} in ${envFile}`);
  }
}

export const E2E_ENV_LOADED = loaded;
