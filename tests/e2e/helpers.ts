import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';
// Side-effect import: repository `.env` → process.env, so the TOTP child
// process sees the same AUTH_SECRET/DATABASE_URL the server does.
import '../../scripts/e2e-env';

export const REPO_ROOT = path.resolve(__dirname, '..', '..');
export const DEMO_PASSWORD = 'Sahra-2026-Atlas!';
/**
 * Seeded identifiers, read from the database once per worker
 * (scripts/e2e-seed-ids.ts): the seed mints random UUIDs and certificate
 * numbers, so nothing here is pinned to one particular `db:seed` run.
 */
export const SEEDED: { orgId: string; orgOwnerId: string; certificateNumber: string } = JSON.parse(
  execFileSync(
    process.execPath,
    [
      path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
      path.join(REPO_ROOT, 'scripts', 'e2e-seed-ids.ts'),
    ],
    { cwd: REPO_ROOT, encoding: 'utf8', env: process.env },
  ),
);
/** Seeded organization behind org@bladna.dz (packages/database/src/seed.ts). */
export const ORG_ID = SEEDED.orgId;

/**
 * One fresh RFC 6238 code for a TOTP-protected demo account, minted by the
 * same `scripts/totp-code.ts` the PowerShell probes shell out to — one source
 * of truth for seed decryption and algorithm parameters.
 */
export function freshTotpCode(email: string): string {
  const cli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const output = execFileSync(
    process.execPath,
    [cli, path.join(REPO_ROOT, 'scripts', 'totp-code.ts'), email],
    { cwd: REPO_ROOT, encoding: 'utf8', env: process.env },
  ).trim();
  if (!/^\d{6}$/.test(output)) throw new Error(`totp-code.ts printed "${output}" for ${email}`);
  return output;
}

function waitForPost(page: Page, urlFragment: string) {
  return page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes(urlFragment),
  );
}

async function attemptSignIn(
  page: Page,
  email: string,
  options: { mfa?: boolean },
): Promise<'ok' | 'rate-limited'> {
  await page.goto('/en/login');
  // Hydration barrier: the inputs are controlled React state, so they must be
  // attached before fill() or the value would be overwritten on re-render.
  await page.waitForLoadState('networkidle');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(DEMO_PASSWORD);

  const login = waitForPost(page, '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  const loginResponse = await login;
  if (loginResponse.status() === 429) return 'rate-limited';
  expect(loginResponse.ok(), `POST /auth/login → ${loginResponse.status()}`).toBe(true);

  if (options.mfa) {
    // The form swaps into its inline code step on the same URL.
    const code = page.locator('input[name="code"]');
    await expect(code).toBeVisible();
    await code.fill(freshTotpCode(email));
    const verify = waitForPost(page, '/api/v1/auth/mfa/verify');
    await page.getByRole('button', { name: 'Verify' }).click();
    const verifyResponse = await verify;
    if (verifyResponse.status() === 429) return 'rate-limited';
    expect(verifyResponse.ok(), `POST /auth/mfa/verify → ${verifyResponse.status()}`).toBe(true);
  }

  await page.waitForURL(/\/en\/dashboard/, { timeout: 20_000 });
  return 'ok';
}

/**
 * Signs in through the real form (never a back door) and waits for the
 * client-side redirect to `/en/dashboard`. Accounts with TOTP swap the form
 * into its inline code step; a fresh code is minted at that moment.
 *
 * `/auth/login` shares `RATE_LIMIT_TIERS.auth` (10/min per IP) with the probe
 * scripts, so a 429 is retried once after the window slides.
 */
export async function signIn(
  page: Page,
  email: string,
  options: { mfa?: boolean } = {},
): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if ((await attemptSignIn(page, email, options)) === 'ok') return;
    await page.waitForTimeout(61_000);
  }
  throw new Error(`sign-in for ${email} stayed rate-limited after two attempts`);
}
