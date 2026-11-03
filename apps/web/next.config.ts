import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

/**
 * BLADNA web app config.
 *
 * Workspace packages ship TypeScript sources (`main` points at `src/`), so they
 * must be transpiled by Next. `outputFileTracingRoot` keeps the standalone
 * build's file tracing inside the monorepo (used by the Docker image).
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The documented contract is a single root `.env` (README: `cp .env.example .env`),
// but `next dev|start` executes with cwd=apps/web, so Next only auto-loads
// `apps/web/.env`. Load the root file explicitly at config time: values already
// present in the real environment win (same semantics as `node --env-file`), and a
// missing file is a no-op — containers that inject their config through the
// compose `environment:` block keep working unchanged.
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // no root .env (fresh clone, or container with injected env) — nothing to load
}

// next-intl (P6): aliases `next-intl/config` to `src/ui/i18n/request.ts`, which
// resolves the locale from the proxy's `x-locale` header and serves the
// existing TS dictionaries as messages.
const withNextIntl = createNextIntlPlugin('./src/ui/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    '@bladna/types',
    '@bladna/utils',
    '@bladna/domain',
    '@bladna/validation',
    '@bladna/auth',
    '@bladna/ui',
    '@bladna/database',
  ],
  outputFileTracingRoot: repoRoot,
};

export default withNextIntl(nextConfig);
