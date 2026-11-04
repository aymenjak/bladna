// E2E fixture — called by scripts/e2e-global-setup.ts through a `tsx` child
// process (same as the offers and report fixtures). The privileged demo
// accounts (org@, admin@) sign in with TOTP, but a freshly reset database has
// no enrolment: seed.ts deliberately leaves that to /auth/two-factor/setup.
// When a `totp: true` demo account has no enabled factor, one is enrolled
// here with a random secret, encrypted in the same v1.<iv>.<tag>.<data> format
// and AUTH_SECRET-derived key as apps/web/src/server/lib/crypto.ts, so
// scripts/totp-code.ts can mint its codes. An existing factor is never
// touched, and the secret itself is never printed.
import './e2e-env';
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto';
import { DEMO_ACCOUNTS, getPrisma } from '@bladna/database';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function encryptSecret(plain: string, authSecret: string): string {
  const key = scryptSync(authSecret, 'bladna-secrets-v1', 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

async function main(): Promise<void> {
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) throw new Error('AUTH_SECRET is not set.');
  const prisma = getPrisma();
  try {
    for (const account of DEMO_ACCOUNTS) {
      if (!account.totp) continue;
      const user = await prisma.user.findUnique({
        where: { email: account.email },
        select: { id: true, twoFactor: { select: { enabledAt: true } } },
      });
      if (!user || user.twoFactor?.enabledAt) continue; // seeds absent, or already enrolled
      const secretEnc = encryptSecret(base32Encode(randomBytes(20)), authSecret);
      await prisma.twoFactorSecret.upsert({
        where: { userId: user.id },
        create: { userId: user.id, secretEnc, enabledAt: new Date() },
        update: { secretEnc, enabledAt: new Date() },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
