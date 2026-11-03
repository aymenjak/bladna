/**
 * Demo account identities — single source of truth shared by the seeder
 * (seed.ts) and the login-page demo-access card
 * (apps/web/src/server/lib/demo-access.ts), so credentials shown in the UI can
 * never drift from what the seed actually creates.
 *
 * The card itself only renders when `DEMO_MODE=true` (see .env.example —
 * never enable it on a deployment with real users).
 */
export const DEMO_PASSWORD = 'Sahra-2026-Atlas!';

export const DEMO_ACCOUNTS = [
  { email: 'volunteer@bladna.dz', totp: false },
  { email: 'org@bladna.dz', totp: true },
  { email: 'admin@bladna.dz', totp: true },
] as const;
