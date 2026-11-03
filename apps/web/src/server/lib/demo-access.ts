// Login-page demo-access card data (DEMO_MODE only).
//
// When DEMO_MODE=true the login page lists the seeded demo accounts with the
// shared demo password and a *live* TOTP code per MFA account, so anyone can
// walk through the product without a terminal. This intentionally exposes
// credentials for the three seed accounts, so it must never be enabled on a
// deployment with real users (.env.example documents this). Fail-soft by
// design: any error just hides the card — the login form itself must never
// break because of a demo nicety.

import { createHmac } from 'node:crypto';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, getPrisma } from '@bladna/database';
import { env } from '../env';
import { decryptSecret } from './crypto';

export type DemoAccessData = {
  password: string;
  accounts: Array<{ email: string; code: string | null }>;
};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(value: string): Buffer {
  const clean = value.replace(/=+$/g, '').toUpperCase();
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Seed is not valid base32.');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 6238 with the exact parameters of packages/auth/src/totp.ts. */
function totp(secretBase32: string, atMs: number): string {
  const counter = Math.floor(atMs / 30_000);
  const block = Buffer.alloc(8);
  block.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(block).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/**
 * Demo accounts + live codes, or `null` when demo mode is off / nothing is
 * seeded / anything fails. One small query, only on the login page render.
 */
export async function loadDemoAccess(): Promise<DemoAccessData | null> {
  if (!env.demoMode) return null;
  try {
    const prisma = getPrisma();
    const users = await prisma.user.findMany({
      where: { email: { in: DEMO_ACCOUNTS.map((account) => account.email) } },
      select: {
        email: true,
        twoFactor: { select: { secretEnc: true, enabledAt: true } },
      },
    });
    if (users.length === 0) return null;
    const now = Date.now();
    const accounts: Array<{ email: string; code: string | null }> = [];
    for (const { email } of DEMO_ACCOUNTS) {
      const user = users.find((candidate) => candidate.email === email);
      if (!user) continue;
      const code =
        user.twoFactor?.enabledAt != null
          ? totp(decryptSecret(user.twoFactor.secretEnc), now)
          : null;
      accounts.push({ email, code });
    }
    if (accounts.length === 0) return null;
    return { password: DEMO_PASSWORD, accounts };
  } catch (error) {
    console.warn('[demo-access] hidden:', error instanceof Error ? error.message : error);
    return null;
  }
}
