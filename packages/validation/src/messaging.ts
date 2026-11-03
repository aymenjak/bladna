import { z } from 'zod';
import { notificationTypeSchemaHelper } from './helpers';
import { paginationQuerySchema, uuidSchema } from './common';

export const startConversationSchema = z.object({
  /** direct user-to-user / user-to-org conversations */
  participantUserId: uuidSchema.optional(),
  organizationId: uuidSchema.optional(),
  subject: z.string().trim().max(200).optional(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(5000),
  attachmentId: uuidSchema.optional(),
});

export const conversationQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  unreadOnly: z.enum(['true', 'false']).optional(),
});

export const messagesQuerySchema = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const markReadSchema = z.object({
  lastMessageId: uuidSchema.optional(),
});

export const notificationsQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z.enum(['true', 'false']).optional(),
  type: notificationTypeSchemaHelper.optional(),
});

export const markNotificationsReadSchema = z.object({
  notificationIds: z.array(uuidSchema).max(200).optional(),
  all: z.boolean().default(false),
});

export const blockUserSchema = z.object({
  userId: uuidSchema,
  reason: z.string().trim().max(500).optional(),
});
