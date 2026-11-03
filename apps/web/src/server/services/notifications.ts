import { getPrisma } from '@bladna/database';
import type { Prisma } from '@bladna/database';
import type { NotificationType } from '@bladna/types';
import { sendEmail } from '../infra/email';
import { registerWorker, QUEUE_NAMES } from '../infra/queue';

/**
 * Notification fan-out (§46).
 *
 * Every notification is persisted first (in-app inbox, unread counts), then
 * delivered per the user's NotificationPreference rows (absent row = enabled).
 * Delivery failures never lose the persisted notification: each channel gets a
 * NotificationDelivery row whose status is updated by the worker.
 */

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface UserDeliveryInfo {
  email: string;
  preferredLanguage: string;
  deletedAt: Date | null;
}

export async function notify(input: NotifyInput): Promise<void> {
  const prisma = getPrisma();

  const user = (await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, preferredLanguage: true, deletedAt: true },
  })) as UserDeliveryInfo | null;
  if (!user || user.deletedAt) return;

  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
    },
  });

  // Email preference: enabled unless an explicit row disables it.
  const pref = await prisma.notificationPreference.findUnique({
    where: {
      userId_type_channel: {
        userId: input.userId,
        type: input.type,
        channel: 'EMAIL',
      },
    },
  });
  if (pref && !pref.enabled) return;

  const delivery = await prisma.notificationDelivery.create({
    data: { notificationId: notification.id, channel: 'EMAIL', status: 'QUEUED' },
  });

  const locale = (user.preferredLanguage as string).toLowerCase();
  enqueueEmail({
    deliveryId: delivery.id,
    to: user.email,
    template: input.type,
    locale,
    data: { title: input.title, body: input.body, ...(input.data ?? {}) },
  }).catch((error) => {
    console.error('[notify] email enqueue failed', error);
  });
}

async function enqueueEmail(payload: {
  deliveryId: string;
  to: string;
  template: string;
  locale: string;
  data: Record<string, unknown>;
}): Promise<void> {
  const { enqueue } = await import('../infra/queue');
  await enqueue(QUEUE_NAMES.EMAIL, payload);
}

export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<number> {
  const unique = [...new Set(userIds)];
  for (const userId of unique) {
    await notify({ ...input, userId });
  }
  return unique.length;
}

/** Registers queue workers used by the notification pipeline (inline mode). */
export function registerNotificationWorkers(): void {
  registerWorker(QUEUE_NAMES.EMAIL, async (payload) => {
    const { renderNotificationEmail } = await import('../email/templates');
    const prisma = getPrisma();
    const rendered = renderNotificationEmail(payload.template, payload.locale, payload.data);
    try {
      await sendEmail({
        to: payload.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        locale: payload.locale,
        tags: [payload.template],
      });
      if (payload.deliveryId) {
        await prisma.notificationDelivery.update({
          where: { id: payload.deliveryId },
          data: { status: 'SENT', sentAt: new Date() },
        });
      }
    } catch (error) {
      if (payload.deliveryId) {
        await prisma.notificationDelivery.update({
          where: { id: payload.deliveryId },
          data: {
            status: 'FAILED',
            error: error instanceof Error ? error.message.slice(0, 500) : 'unknown',
          },
        });
      }
      throw error;
    }
  });
}
