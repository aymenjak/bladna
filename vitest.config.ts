import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next needs `jsx: preserve` in tsconfig.json, but the test transform must
  // actually compile JSX to run component tests — override it here
  // (config-scoped, the Next build is unaffected). Vite 8 transforms TS/JSX
  // with oxc, so the option lives under `oxc`.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  resolve: {
    // `apps/web` imports through the `@/*` tsconfig alias; mirror it here so
    // app modules that import `@/server/...` also resolve under Vitest. The
    // anchored regex keeps `@bladna/*` workspace imports out of the match.
    alias: [
      {
        find: /^@\//,
        replacement: fileURLToPath(new URL('./apps/web/src/', import.meta.url)),
      },
    ],
  },
  test: {
    // `.test.tsx` = kit component tests (M8). They opt into jsdom per file via
    // a `@vitest-environment jsdom` docblock so the suites stay node-default.
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/web/src/**/*.test.{ts,tsx}',
      'tests/**/*.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/.next/**'],
    environment: 'node',
    // Globals let React Testing Library register its auto-cleanup `afterEach`
    // (without them it never runs and DOM leaks between component tests).
    globals: true,
    passWithNoTests: false,
    testTimeout: 20000,
  },
});
