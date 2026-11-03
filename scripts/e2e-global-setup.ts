// Playwright global setup.
//
// 1. Loads the repository `.env` into the runner's process.env (workers and
//    the `tsx` child process that mints TOTP codes inherit it) — the same
//    values `next start` reads. CI ships no `.env`; there the keys arrive
//    through the job environment and e2e-env.ts accepts that.
//
// 2. Waits out the shared auth rate-limit bucket. The local server on :3002 is
//    also driven by the PowerShell probe scripts, and `/auth/login` allows
//    `RATE_LIMIT_TIERS.auth` = 10 requests/minute per IP (a rejected request
//    does not consume quota, so this probe is free while it reports "limited").
//    Probes that ran seconds before `npm run test:e2e` would otherwise burn
//    the suite's quota. Bounded: at most one 61s slide.
//
// 3. P18: refreshes the offers fixture — one PENDING support offer on a
//    self-healing ladder need (see scripts/e2e-ensure-pending-offer.ts), so
//    offers.spec.ts always has a real decision to take.
//
// 4. P20: drops the previous run's report on the seeded initiative (see
//    scripts/e2e-ensure-clean-report.ts) — `POST /reports` refuses a second
//    open report on the same target, so safety.spec.ts can file every run.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import './e2e-env';

const LOGIN_URL = 'http://localhost:3002/api/v1/auth/login';
const REPO_ROOT = path.resolve(__dirname, '..');

async function isAuthLimited(): Promise<boolean | null> {
  try {
    const response = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    });
    return response.status === 429;
  } catch {
    // Nothing is listening yet (Playwright starts the web server around this
    // hook) — there is no bucket to wait for.
    return null;
  }
}

/** Step 3 — a fresh PENDING offer for offers.spec.ts (tsx child, like TOTP). */
function refreshOffersFixture(): void {
  const cli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  execFileSync(
    process.execPath,
    [cli, path.join(REPO_ROOT, 'scripts', 'e2e-ensure-pending-offer.ts')],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    },
  );
}

/** Step 4 — P20: clear the previous run's report for safety.spec.ts. */
function refreshReportFixture(): void {
  const cli = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  execFileSync(
    process.execPath,
    [cli, path.join(REPO_ROOT, 'scripts', 'e2e-ensure-clean-report.ts')],
    {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    },
  );
}

export default async function globalSetup(): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const limited = await isAuthLimited();
    if (limited === null || !limited) break;
    await new Promise((resolve) => setTimeout(resolve, 61_000));
  }
  refreshOffersFixture();
  refreshReportFixture();
}
