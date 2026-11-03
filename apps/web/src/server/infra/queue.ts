import { env } from '../env';

/**
 * Job queue (§91).
 *
 *  - With `REDIS_URL`: jobs go through BullMQ (persistent, retries, backoff).
 *  - Without Redis  : jobs execute **inline, awaited** — real execution with
 *    real error handling, just without durability. Documented single-node
 *    behaviour, never a silent drop.
 *
 * Workers are registered per queue via registerWorker(); enqueuing an
 * unregistered queue in inline mode is a no-op (nothing to run yet).
 */

export const QUEUE_NAMES = {
  EMAIL: 'email',
  NOTIFICATIONS: 'notifications',
  CERTIFICATES: 'certificates',
  REPORTS: 'reports',
  RISK: 'risk',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface JobPayloads {
  email: {
    deliveryId?: string;
    to: string;
    template: string;
    locale: string;
    data: Record<string, unknown>;
  };
  notifications: { userId: string; type: string; data: Record<string, unknown>; locale: string };
  certificates: { certificateId: string };
  reports: { reportId: string; requestedBy: string };
  risk: { subject: string; subjectId: string };
}

type Worker<T extends QueueName> = (payload: JobPayloads[T]) => Promise<void>;

const workers = new Map<string, Worker<QueueName>>();

export function registerWorker<T extends QueueName>(queue: T, handler: Worker<T>): void {
  workers.set(queue, handler as Worker<QueueName>);
}

export async function enqueue<T extends QueueName>(
  queue: T,
  payload: JobPayloads[T],
  options: { delayMs?: number } = {},
): Promise<{ mode: 'inline' | 'queued'; id: string }> {
  const id = `${queue}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const worker = workers.get(queue);

  if (env.redisUrl) {
    const [{ Queue }, { default: Redis }] = await Promise.all([
      import('bullmq'),
      import('ioredis'),
    ]);
    const connection = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
    const q = new Queue(queue, { connection });
    try {
      await q.add(queue, payload, {
        jobId: id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        delay: options.delayMs ?? 0,
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
      return { mode: 'queued', id };
    } finally {
      await q.close();
      connection.disconnect();
    }
  }

  // Inline execution (no Redis): run now, surface failures to the caller.
  if (options.delayMs) {
    await new Promise((r) => setTimeout(r, options.delayMs));
  }
  if (worker) {
    try {
      await worker(payload);
    } catch (error) {
      console.error(`[queue:${queue}] job failed`, error);
      throw error;
    }
  }
  return { mode: 'inline', id };
}
