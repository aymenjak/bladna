import { describe, expect, it } from 'vitest';
import * as OTPAuth from 'otpauth';
import { createTotpSetup, generateRecoveryCodes, verifyTotp } from './totp';

describe('TOTP 2FA', () => {
  it('creates a verifiable setup', () => {
    const setup = createTotpSetup({ userId: 'u1', email: 'user@bladna.test' });
    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.otpauthUri).toContain('otpauth://totp/');

    const totp = new OTPAuth.TOTP({
      issuer: 'BLADNA',
      label: 'user@bladna.test',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(setup.secret),
    });
    const token = totp.generate();

    expect(verifyTotp({ secretBase32: setup.secret, token })).toEqual({ valid: true });
  });

  it('rejects wrong or malformed codes', () => {
    const setup = createTotpSetup({ userId: 'u1' });
    expect(verifyTotp({ secretBase32: setup.secret, token: '000000' }).valid).toBe(false);
    expect(verifyTotp({ secretBase32: setup.secret, token: 'abcdef' }).valid).toBe(false);
    expect(verifyTotp({ secretBase32: setup.secret, token: '' }).valid).toBe(false);
  });

  it('rejects a code from a different secret', () => {
    const a = createTotpSetup({ userId: 'u1' });
    const b = createTotpSetup({ userId: 'u2' });
    const totp = new OTPAuth.TOTP({
      issuer: 'BLADNA',
      label: 'user:u2',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(b.secret),
    });
    expect(verifyTotp({ secretBase32: a.secret, token: totp.generate() }).valid).toBe(false);
  });

  it('generates unique recovery codes', () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code.startsWith('BLD-')).toBe(true);
  });
});
