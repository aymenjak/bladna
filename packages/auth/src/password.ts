// Password hashing — scrypt (RFC 7914) via Node's crypto module.
// Memory-hard, standard parameters, no custom cryptography.
// The PasswordHasher interface allows swapping in Argon2id without touching callers.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

const PARAMS = { N: 2 ** 15, r: 8, p: 1, keyLength: 32, saltLength: 16 } as const;
// maxmem must exceed 128 * N * r
const MAXMEM = 128 * PARAMS.N * PARAMS.r * 2;

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(PARAMS.saltLength);
    const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keyLength, {
      N: PARAMS.N,
      r: PARAMS.r,
      p: PARAMS.p,
      maxmem: MAXMEM,
    });
    return [
      'scrypt',
      PARAMS.N,
      PARAMS.r,
      PARAMS.p,
      salt.toString('base64'),
      derived.toString('base64'),
    ].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, nRaw, rRaw, pRaw, saltRaw, hashRaw] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
    try {
      const salt = Buffer.from(saltRaw, 'base64');
      const expected = Buffer.from(hashRaw, 'base64');
      const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
        N,
        r,
        p,
        maxmem: Math.max(MAXMEM, 128 * N * r * 2),
      });
      return derived.length === expected.length && timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
}

export const passwordHasher: PasswordHasher = new ScryptPasswordHasher();

export interface PasswordPolicyResult {
  ok: boolean;
  problems: string[];
}

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  '12345678',
  '123456789',
  'qwertyui',
  'iloveyou',
  'admin123',
  'bladna123',
]);

/** Modern baseline policy: length over composition gimmicks (NIST SP 800-63B). */
export function checkPasswordPolicy(
  password: string,
  context: { email?: string } = {},
): PasswordPolicyResult {
  const problems: string[] = [];
  if (password.length < 10) problems.push('PASSWORD_TOO_SHORT');
  if (password.length > 200) problems.push('PASSWORD_TOO_LONG');
  if (COMMON_PASSWORDS.has(password.toLowerCase())) problems.push('PASSWORD_TOO_COMMON');
  const localPart = context.email?.split('@')[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    problems.push('PASSWORD_CONTAINS_EMAIL');
  }
  return { ok: problems.length === 0, problems };
}
