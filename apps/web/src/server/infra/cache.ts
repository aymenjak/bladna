import { env } from '../env';

/**
 * Cache adapter.
 *
 *  - `memory` (always available): process-local TTL cache, bounds memory by
 *    sweeping expired entries. Correct for a single node.
 *  - Redis (`shared()`) is used by the queue when REDIS_URL is set; this cache
 *    deliberately stays process-local so self-hosting needs no extra infra.
 *    Feature flags, hot lookups and rate-limit snapshots use this.
 *
 * Nothing here pretends to be distributed: `backend()` reports what it is.
 */

interface Entry {
  value: string;
  expiresAt: number;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 10_000;

function prune(now = Date.now()): void {
  for (const [k, v] of store) if (v.expiresAt <= now) store.delete(k);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    prune();
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    prune();
    store.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  },

  async delete(key: string): Promise<void> {
    store.delete(key);
  },

  /** Namespace invalidation (e.g. all keys for one organization). */
  async deletePrefix(prefix: string): Promise<void> {
    for (const k of [...store.keys()]) if (k.startsWith(prefix)) store.delete(k);
  },

  backend(): 'memory' {
    return 'memory';
  },

  /** True when a shared Redis is configured for the queue. */
  shared(): boolean {
    return Boolean(env.redisUrl);
  },
};
