// Sliding-window rate limiter (in-process).
// Production deployments with Redis should swap in the Redis-backed adapter;
// the interface stays identical (spec §58, §114).

export interface RateLimitRule {
  /** Maximum requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export const RATE_LIMIT_TIERS: Record<string, RateLimitRule> = {
  public: { limit: 120, windowMs: 60_000 },
  authenticated: { limit: 300, windowMs: 60_000 },
  auth: { limit: 10, windowMs: 60_000 },
  passwordReset: { limit: 5, windowMs: 15 * 60_000 },
  search: { limit: 40, windowMs: 60_000 },
  messaging: { limit: 60, windowMs: 60_000 },
  upload: { limit: 20, windowMs: 60_000 },
  admin: { limit: 120, windowMs: 60_000 },
  qrVerification: { limit: 30, windowMs: 60_000 },
};

interface Bucket {
  timestamps: number[];
}

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  consume(key: string, rule: RateLimitRule, now = Date.now()): RateLimitResult {
    this.maybeSweep(now);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }
    const windowStart = now - rule.windowMs;
    while (bucket.timestamps.length > 0 && bucket.timestamps[0] <= windowStart) {
      bucket.timestamps.shift();
    }
    if (bucket.timestamps.length >= rule.limit) {
      const resetAt = bucket.timestamps[0] + rule.windowMs;
      return { allowed: false, remaining: 0, resetAt };
    }
    bucket.timestamps.push(now);
    return {
      allowed: true,
      remaining: rule.limit - bucket.timestamps.length,
      resetAt: now + rule.windowMs,
    };
  }

  reset(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }

  private maybeSweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    // Drop empty buckets opportunistically to bound memory.
    for (const [key, bucket] of this.buckets) {
      if (bucket.timestamps.length === 0) this.buckets.delete(key);
    }
  }
}

export const rateLimiter = new InMemoryRateLimiter();
