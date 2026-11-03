import { describe, expect, it } from 'vitest';
import {
  generateOpaqueSecret,
  generateRefreshToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from './tokens';

const SECRET = 'test-secret-that-is-long-enough-0123456789';

describe('access tokens', () => {
  it('signs and verifies', async () => {
    const token = await signAccessToken(
      { sub: 'user-1', sid: 'session-1', jti: 'jti-1', roles: ['VOLUNTEER'] },
      { secret: SECRET, ttlSeconds: 60 },
    );
    const result = await verifyAccessToken(token, SECRET);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe('user-1');
      expect(result.claims.sid).toBe('session-1');
      expect(result.claims.roles).toEqual(['VOLUNTEER']);
    }
  });

  it('rejects tokens signed with another secret', async () => {
    const token = await signAccessToken(
      { sub: 'user-1', sid: 'session-1', jti: 'j', roles: ['USER'] },
      { secret: SECRET, ttlSeconds: 60 },
    );
    const result = await verifyAccessToken(token, 'another-secret-aaaaaaaaaaaaaaaaaaaaaa');
    expect(result.ok).toBe(false);
  });

  it('rejects garbage', async () => {
    expect((await verifyAccessToken('not-a-jwt', SECRET)).ok).toBe(false);
  });

  it('does not accept refresh-style tokens as access tokens', async () => {
    // A bare opaque string must fail — type claim is enforced.
    expect((await verifyAccessToken(generateRefreshToken(), SECRET)).ok).toBe(false);
  });
});

describe('refresh tokens', () => {
  it('are high-entropy and unique', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });

  it('hash deterministically for storage', () => {
    const token = generateRefreshToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe('opaque secrets', () => {
  it('are url-safe and non-sequential', () => {
    const secrets = Array.from({ length: 5 }, () => generateOpaqueSecret());
    expect(new Set(secrets).size).toBe(5);
    for (const secret of secrets) {
      expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
