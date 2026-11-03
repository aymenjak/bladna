import { defineConfig } from '@playwright/test';

/**
 * Browser E2E suite (M8 / roadmap P4).
 *
 * Environment constraints (documented in docs/RESEARCH.md M8):
 * - `cdn.playwright.dev` is unreachable from this machine, so no browser is
 *   downloaded: `channel: 'chrome'` drives the system Chrome already present.
 * - No Docker/CI here — `npm run test:e2e` is the CI-equivalent run: the
 *   `webServer` block starts `next start` itself when nothing is listening,
 *   and reuses the already-running local build (port 3002) otherwise.
 * - One worker: every spec shares one seeded demo database, and the auth tier
 *   allows only 10 login requests per minute per IP.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './scripts/e2e-global-setup.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Sign-in steps mint a TOTP code through `tsx` (a few seconds) and some
  // flows walk several server-rendered pages.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3002',
    channel: 'chrome',
    locale: 'en-GB',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run start --workspace @bladna/web -- -p 3002',
    url: 'http://localhost:3002/en',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
