/**
 * Dev-only E2E probe helper: prints one fresh TOTP code for a demo account.
 *
 * The privileged demo logins (org@, admin@) are protected by TOTP, so the
 * PowerShell probes generate the RFC 6238 code here: the encrypted seed is
 * read straight from the database and decrypted with the same
 * AUTH_SECRET-derived key as apps/web/src/server/lib/crypto.ts, then hashed
 * with the same parameters as packages/auth/src/totp.ts (SHA1, 6 digits, 30 s
 * period, issuer "BLADNA"). The single code is printed for the caller;
 * nothing is stored and the running application is not involved.
 *
 * Usage (with .env loaded into the process environment):
 *   npx tsx scripts/totp-code.ts org@bladna.dz
 */
import { createDecipheriv, createHmac, scryptSync } from 'node:crypto';
import { getPrisma } from '@bladna/database';

/** Same format/derivation as server/lib/crypto.ts: v1.<iv>.<tag>.<data>. */
function decryptSecret(stored: string, authSecret: string): string {
  const parts = stored.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed encrypted secret.');
  const [, ivB64, tagB64, dataB64] = parts;
  const key = scryptSync(authSecret, 'bladna-secrets-v1', 32);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

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
function totp(secretBase32: string, atMs: number = Date.now()): string {
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

async function main(): Promise<void> {
  const email = process.argv[2];
  const authSecret = process.env.AUTH_SECRET;
  if (!email || !authSecret) {
    console.error('usage: npx tsx scripts/totp-code.ts <email>  (with .env loaded)');
    process.exit(2);
  }

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, twoFactor: { select: { secretEnc: true, enabledAt: true } } },
  });
  if (!user || !user.twoFactor || !user.twoFactor.enabledAt) {
    console.error(`no enabled TOTP for ${email}`);
    await prisma.$disconnect();
    process.exit(3);
  }
  console.log(totp(decryptSecret(user.twoFactor.secretEnc, authSecret)));
  await prisma.$disconnect();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
