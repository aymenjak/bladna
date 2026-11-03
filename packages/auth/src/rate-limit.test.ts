import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter, RATE_LIMIT_TIERS } from './rate-limit';

describe('rate limiting', () => {
  it('allows up to the limit then blocks', () => {
    const limiter = new InMemoryRateLimiter();
    const rule = { limit: 3, windowMs: 1000 };
    const now = 1_000_000;
    expect(limiter.consume('k', rule, now).allowed).toBe(true);
    expect(limiter.consume('k', rule, now).allowed).toBe(true);
    expect(limiter.consume('k', rule, now).allowed).toBe(true);
    const blocked = limiter.consume('k', rule, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('resets after the window elapses', () => {
    const limiter = new InMemoryRateLimiter();
    const rule = { limit: 1, windowMs: 1000 };
    const now = 1_000_000;
    expect(limiter.consume('k', rule, now).allowed).toBe(true);
    expect(limiter.consume('k', rule, now + 500).allowed).toBe(false);
    expect(limiter.consume('k', rule, now + 1500).allowed).toBe(true);
  });

  it('isolates keys', () => {
    const limiter = new InMemoryRateLimiter();
    const rule = { limit: 1, windowMs: 1000 };
    expect(limiter.consume('a', rule).allowed).toBe(true);
    expect(limiter.consume('b', rule).allowed).toBe(true);
    expect(limiter.consume('a', rule).allowed).toBe(false);
  });

  it('defines aggressive limits for auth endpoints', () => {
    expect(RATE_LIMIT_TIERS.auth.limit).toBeLessThanOrEqual(15);
    expect(RATE_LIMIT_TIERS.passwordReset.limit).toBeLessThanOrEqual(5);
    expect(RATE_LIMIT_TIERS.qrVerification.limit).toBeLessThanOrEqual(60);
  });
});
