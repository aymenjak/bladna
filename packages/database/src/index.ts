// @bladna/database — Prisma client access + shared DB helpers.
// All server code must go through getPrisma() (lazy singleton) so builds and
// tests never construct a client at import time.

import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';
export { DEMO_PASSWORD, DEMO_ACCOUNTS } from './demo-accounts';

/**
 * Lazily instantiated Prisma client.
 * DATABASE_URL is only required when a query actually executes.
 */
const globalForPrisma = globalThis as unknown as { __bladnaPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__bladnaPrisma) {
    globalForPrisma.__bladnaPrisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }
  return globalForPrisma.__bladnaPrisma;
}

/** For tests: reset the singleton between cases. */
export function resetPrismaSingleton(): void {
  delete globalForPrisma.__bladnaPrisma;
}

export async function pingDatabase(timeoutMs = 3000): Promise<{ ok: boolean; error?: string }> {
  try {
    const prisma = getPrisma();
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
  }
}
