// TOTP two-factor authentication (RFC 6238) via the otpauth library.
// Required for privileged accounts (spec §145), optional for volunteers.

import { randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';

export interface TotpSetup {
  /** base32 secret — store encrypted, never return it again after setup. */
  secret: string;
  /** otpauth:// provisioning URI for the QR code. */
  otpauthUri: string;
}

export interface TotpVerification {
  valid: boolean;
}

const ISSUER = 'BLADNA';

function buildTotp(label: string, secretBase32?: string): InstanceType<typeof OTPAuth.TOTP> {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secretBase32
      ? OTPAuth.Secret.fromBase32(secretBase32)
      : new OTPAuth.Secret({ size: 20 }),
  });
}

export function createTotpSetup(input: { userId: string; email?: string }): TotpSetup {
  const label = input.email ?? `user:${input.userId}`;
  const totp = buildTotp(label);
  return { secret: totp.secret.base32, otpauthUri: totp.toString() };
}

export function verifyTotp(input: {
  secretBase32: string;
  token: string;
  /** Allowed clock drift in time steps (default ±1 step = ±30s). */
  window?: number;
}): TotpVerification {
  const token = input.token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(token)) return { valid: false };
  const totp = buildTotp(`verify:${ISSUER}`, input.secretBase32);
  const delta = totp.validate({ token, window: input.window ?? 1 });
  return { valid: delta !== null };
}

/** Recovery codes: shown once at enablement, stored as hashes (CSPRNG, 40+ bits each). */
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const bytes = randomBytes(8);
    let raw = '';
    for (let j = 0; j < 8; j += 1) {
      raw += RECOVERY_ALPHABET[bytes[j] % RECOVERY_ALPHABET.length];
    }
    codes.push(`BLD-${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}
