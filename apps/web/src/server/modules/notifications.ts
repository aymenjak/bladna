// Notifications module (spec §46).
//
// Strictly self-scoped: a user only ever reads and mutates their own inbox.
// Marking read is idempotent — already-read rows are skipped and repeated
// calls converge to the same state.

import { getPrisma } from '@bladna/database';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import { markNotificationsReadSchema, notificationsQuerySchema } from '@bladna/validation';
import { requireAuth } from '../guards';
import { body, query, type RequestContext } from '../http';
import type { AppRoute } from '../router';

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const;

async function list(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, notificationsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = {
    userId: user.userId,
    ...(f.unreadOnly === 'true' ? { readAt: null } : {}),
    ...(f.type ? { type: f.type } : {}),
  };

  const [total, unreadCount, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      select: NOTIFICATION_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, unreadCount, meta: buildPageMeta(total, { page, limit }) };
}

async function markRead(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, markNotificationsReadSchema);
  const prisma = getPrisma();
  const now = new Date();

  if (input.all) {
    const result = await prisma.notification.updateMany({
      where: { userId: user.userId, readAt: null },
      data: { readAt: now },
    });
    return { updated: result.count };
  }

  const ids = input.notificationIds ?? [];
  if (ids.length === 0) return { updated: 0 };

  // `userId` in the filter keeps other people's notifications out even when
  // ids are guessed; already-read rows are untouched (idempotent).
  const result = await prisma.notification.updateMany({
    where: { id: { in: ids }, userId: user.userId, readAt: null },
    data: { readAt: now },
  });
  return { updated: result.count };
}

export const notificationRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/me/notifications',
    handler: list,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own notifications (paginated, unread count included)',
  },
  {
    method: 'POST',
    path: '/me/notifications/read',
    handler: markRead,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Mark notifications read (idempotent)',
  },
];
