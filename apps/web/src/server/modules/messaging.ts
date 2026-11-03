// Messaging module (spec §47).
//
// Access model:
//  - DIRECT conversations carry a member row for both parties at creation and
//    honor UserBlock in both directions on start and on every send.
//  - ORGANIZATION conversations are either volunteer→org (the volunteer's row
//    carries the target organizationId) or staff→volunteer (both rows carry it).
//    Staff discover conversations whose member rows reference one of their
//    ACTIVE organization memberships and join on the first post — the join
//    goes through requireOrgMembership('messaging.send').
//  - Message history uses a keyset cursor (`<createdAtMs>_<messageId>`);
//    mark-read only ever advances lastReadAt, so it is idempotent.

import { getPrisma, type Prisma } from '@bladna/database';
import { AppError, type LocaleCode } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  conversationQuerySchema,
  markReadSchema,
  messagesQuerySchema,
  sendMessageSchema,
  startConversationSchema,
  uuidSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { requireAuth, requireOrgMembership, type SessionUser } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

type ConversationTypeLiteral = 'DIRECT' | 'ORGANIZATION' | 'GROUP';

/** Hard cap on notification fan-out per message. */
const NOTIFY_FANOUT_LIMIT = 20;
/** Cap on candidate conversations scanned for the unreadOnly filter. */
const UNREAD_CANDIDATE_CAP = 500;
/** Cap on MessageRead rows written per mark-read call. */
const MARK_READ_BATCH = 500;

const conversationParamsSchema = z.object({ id: uuidSchema });

const CURSOR_PATTERN = /^(\d{13})_([0-9a-fA-F-]{36})$/;

const MESSAGE_COPY: Record<LocaleCode, { title: string; body: string }> = {
  ar: { title: 'رسالة جديدة', body: 'لديك رسالة جديدة في محادثة على منصة بلادنا.' },
  fr: {
    title: 'Nouveau message',
    body: 'Vous avez reçu un nouveau message sur la plateforme Bladna.',
  },
  en: { title: 'New message', body: 'You have received a new message on the Bladna platform.' },
};

const CONVERSATION_SELECT = {
  id: true,
  type: true,
  subject: true,
  createdAt: true,
  updatedAt: true,
} as const;

const MEMBER_SELECT = {
  conversationId: true,
  userId: true,
  organizationId: true,
  lastReadAt: true,
  muted: true,
  user: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
} as const;

const MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  senderId: true,
  body: true,
  attachmentId: true,
  createdAt: true,
  editedAt: true,
  sender: { select: { id: true, firstName: true, lastName: true, profileImage: true } },
} as const satisfies Prisma.MessageSelect;

/** Display metadata + ready-made bytes URL for a message attachment. */
export interface MessageAttachmentInfo {
  id: string;
  fileName: string;
  mimeType: string;
  downloadUrl: string;
}

/**
 * Decorate message rows with their attachment's metadata and a working
 * `GET /files` URL.
 *
 * The storage key only ever travels inside payloads gated by conversation
 * membership (the same rule `loadConversation` enforces), and `serveFile`
 * re-authorizes every fetch — a tombstoned message or lost membership stops
 * granting access immediately. A document that was hard-deleted since the send
 * yields `attachment: null` rather than a link that would 404.
 */
async function withAttachments<T extends { attachmentId: string | null }>(
  rows: T[],
): Promise<Array<T & { attachment: MessageAttachmentInfo | null }>> {
  const ids = [...new Set(rows.map((row) => row.attachmentId).filter((id): id is string => !!id))];
  const documents =
    ids.length > 0
      ? await getPrisma().document.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true, fileName: true, mimeType: true, storageKey: true },
        })
      : [];
  const byId = new Map(documents.map((document) => [document.id, document]));
  return rows.map((row) => {
    const document = row.attachmentId ? byId.get(row.attachmentId) : undefined;
    return {
      ...row,
      attachment: document
        ? {
            id: document.id,
            fileName: document.fileName,
            mimeType: document.mimeType,
            downloadUrl: `/api/v1/files?key=${encodeURIComponent(document.storageKey)}`,
          }
        : null,
    };
  });
}

async function myActiveOrgIds(userId: string): Promise<string[]> {
  const rows = await getPrisma().organizationMember.findMany({
    where: { userId, status: 'ACTIVE' },
    select: { organizationId: true },
  });
  return rows.map((row) => row.organizationId);
}

/** Either direction of a block stops a DIRECT conversation. */
async function assertNotBlocked(blockerId: string, blockedId: string): Promise<void> {
  const block = await getPrisma().userBlock.findFirst({
    where: {
      OR: [
        { blockerId, blockedId },
        { blockerId: blockedId, blockedId: blockerId },
      ],
    },
    select: { id: true },
  });
  if (block) throw AppError.forbidden('You cannot message this user.');
}

interface ConversationAccess {
  id: string;
  type: ConversationTypeLiteral;
  subject: string | null;
  createdAt: Date;
  updatedAt: Date;
  members: Array<{
    userId: string;
    organizationId: string | null;
    lastReadAt: Date | null;
    muted: boolean;
  }>;
  isMember: boolean;
}

/** Load a conversation the caller may see (member, or staff of its org). */
async function loadConversation(
  conversationId: string,
  user: SessionUser,
): Promise<ConversationAccess> {
  const conversation = await getPrisma().conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      type: true,
      subject: true,
      createdAt: true,
      updatedAt: true,
      members: { select: { userId: true, organizationId: true, lastReadAt: true, muted: true } },
    },
  });
  if (!conversation) throw AppError.notFound('Conversation not found.');

  const isMember = conversation.members.some((member) => member.userId === user.userId);
  if (isMember) return { ...conversation, isMember: true };

  if (conversation.type !== 'ORGANIZATION') {
    throw AppError.forbidden('You do not have access to this conversation.');
  }
  const orgIds = [
    ...new Set(
      conversation.members
        .map((member) => member.organizationId)
        .filter((value): value is string => value !== null),
    ),
  ];
  const mine = await myActiveOrgIds(user.userId);
  if (!orgIds.some((orgId) => mine.includes(orgId))) {
    throw AppError.forbidden('You do not have access to this conversation.');
  }
  return { ...conversation, isMember: false };
}

function visibilityWhere(userId: string, orgIds: string[]): Prisma.ConversationWhereInput {
  const clauses: Prisma.ConversationWhereInput[] = [{ members: { some: { userId } } }];
  if (orgIds.length > 0) {
    clauses.push({ type: 'ORGANIZATION', members: { some: { organizationId: { in: orgIds } } } });
  }
  return { OR: clauses };
}

async function decorate(
  rows: ReadonlyArray<{
    id: string;
    type: ConversationTypeLiteral;
    subject: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>,
  userId: string,
): Promise<Array<Record<string, unknown>>> {
  if (rows.length === 0) return [];
  const prisma = getPrisma();
  const ids = rows.map((row) => row.id);
  const members = await prisma.conversationMember.findMany({
    where: { conversationId: { in: ids } },
    select: MEMBER_SELECT,
    orderBy: { joinedAt: 'asc' },
  });
  const counts = await Promise.all(
    ids.map((conversationId) => {
      const mine = members.find((m) => m.conversationId === conversationId && m.userId === userId);
      const since = mine?.lastReadAt ?? new Date(0);
      return prisma.message.count({
        where: {
          conversationId,
          senderId: { not: userId },
          createdAt: { gt: since },
          deletedAt: null,
        },
      });
    }),
  );

  return rows.map((row, index) => {
    const conversationMembers = members.filter((m) => m.conversationId === row.id);
    const mine = conversationMembers.find((m) => m.userId === userId);
    return {
      ...row,
      joined: Boolean(mine),
      unreadCount: counts[index],
      myLastReadAt: mine?.lastReadAt ?? null,
      members: conversationMembers.map((m) => ({
        userId: m.userId,
        organizationId: m.organizationId,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        profileImage: m.user.profileImage,
        isMe: m.userId === userId,
      })),
    };
  });
}

// ── Conversation list / detail ─────────────────────────────────

async function listConversations(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, conversationQuerySchema);
  const prisma = getPrisma();
  const orgIds = await myActiveOrgIds(user.userId);

  const visibility = visibilityWhere(user.userId, orgIds);
  const baseWhere: Prisma.ConversationWhereInput = f.q
    ? { AND: [visibility, { subject: { contains: f.q, mode: 'insensitive' } }] }
    : visibility;

  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });

  if (f.unreadOnly === 'true') {
    // Capped scan: candidates → latest message from others → compare with my
    // lastReadAt, then paginate in memory (documented cap of 500).
    const candidates = await prisma.conversation.findMany({
      where: baseWhere,
      orderBy: { updatedAt: 'desc' },
      take: UNREAD_CANDIDATE_CAP,
      select: { id: true },
    });
    const ids = candidates.map((row) => row.id);
    const [maxima, myMembers] = await Promise.all([
      prisma.message.groupBy({
        by: ['conversationId'],
        where: { conversationId: { in: ids }, senderId: { not: user.userId }, deletedAt: null },
        _max: { createdAt: true },
      }),
      prisma.conversationMember.findMany({
        where: { conversationId: { in: ids }, userId: user.userId },
        select: { conversationId: true, lastReadAt: true },
      }),
    ]);
    const maxMap = new Map(maxima.map((row) => [row.conversationId, row._max.createdAt]));
    const readMap = new Map(myMembers.map((row) => [row.conversationId, row.lastReadAt]));
    const unreadIds = ids.filter((id) => {
      const latest = maxMap.get(id);
      if (!latest) return false;
      const lastRead = readMap.get(id);
      return !lastRead || latest.getTime() > lastRead.getTime();
    });

    const pageIds = unreadIds.slice(skip, skip + take);
    const rows = pageIds.length
      ? await prisma.conversation.findMany({
          where: { id: { in: pageIds } },
          select: CONVERSATION_SELECT,
        })
      : [];
    const ordered = pageIds
      .map((id) => rows.find((row) => row.id === id))
      .filter((row): row is (typeof rows)[number] => row !== undefined);
    return {
      items: await decorate(ordered, user.userId),
      meta: buildPageMeta(unreadIds.length, { page, limit }),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.conversation.count({ where: baseWhere }),
    prisma.conversation.findMany({
      where: baseWhere,
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
      select: CONVERSATION_SELECT,
    }),
  ]);
  return { items: await decorate(rows, user.userId), meta: buildPageMeta(total, { page, limit }) };
}

async function getConversation(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, conversationParamsSchema);
  const conversation = await loadConversation(id, user);
  const rows = await getPrisma().conversation.findUnique({
    where: { id: conversation.id },
    select: CONVERSATION_SELECT,
  });
  if (!rows) throw AppError.notFound('Conversation not found.');
  const [item] = await decorate([rows], user.userId);
  return { conversation: item };
}

// ── Start a conversation ───────────────────────────────────────

async function start(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, startConversationSchema);
  const prisma = getPrisma();

  if (!input.participantUserId && !input.organizationId) {
    throw AppError.validation('Provide participantUserId or organizationId.', [
      { path: 'participantUserId', code: 'required', message: 'Name who you want to talk to.' },
    ]);
  }

  // ── DIRECT: user → user ──
  if (!input.organizationId) {
    const participantId = input.participantUserId as string;
    if (participantId === user.userId) {
      throw AppError.validation('participantUserId must be another user.', [
        {
          path: 'participantUserId',
          code: 'self',
          message: 'You cannot start a conversation with yourself.',
        },
      ]);
    }
    const target = await prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true, deletedAt: true },
    });
    if (!target || target.deletedAt) throw AppError.notFound('User not found.');
    await assertNotBlocked(user.userId, participantId);

    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'DIRECT',
        AND: [
          { members: { some: { userId: user.userId } } },
          { members: { some: { userId: participantId } } },
        ],
      },
      select: CONVERSATION_SELECT,
    });
    if (existing) return { conversation: existing, created: false };

    const conversation = await prisma.$transaction(async (tx) => {
      const created = await tx.conversation.create({
        data: {
          type: 'DIRECT' as const,
          subject: input.subject ?? null,
          members: {
            create: [
              { userId: user.userId, lastReadAt: new Date() },
              { userId: participantId, lastReadAt: new Date() },
            ],
          },
        },
        select: CONVERSATION_SELECT,
      });
      return created;
    });
    return { conversation, created: true };
  }

  // ── ORGANIZATION: volunteer → org, or staff → volunteer ──
  const organizationId = input.organizationId;
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!organization) throw AppError.notFound('Organization not found.');

  const membership = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: user.userId } },
    select: { status: true },
  });
  const staffFlow = membership?.status === 'ACTIVE';

  if (staffFlow) {
    // Staff must hold messaging.send inside this organization.
    const org = await requireOrgMembership(ctx, 'messaging.send', { orgId: organizationId });
    if (!input.participantUserId) {
      throw AppError.validation('participantUserId is required for staff conversations.', [
        {
          path: 'participantUserId',
          code: 'required',
          message: 'Choose the volunteer to message.',
        },
      ]);
    }
    const participantId = input.participantUserId;
    const target = await prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true, deletedAt: true },
    });
    if (!target || target.deletedAt) throw AppError.notFound('User not found.');
    if (participantId === user.userId) {
      throw AppError.validation('participantUserId must be another user.', [
        { path: 'participantUserId', code: 'self', message: 'You cannot message yourself.' },
      ]);
    }
    await assertNotBlocked(user.userId, participantId);

    const existing = await prisma.conversation.findFirst({
      where: {
        type: 'ORGANIZATION',
        AND: [
          { members: { some: { userId: user.userId, organizationId } } },
          { members: { some: { userId: participantId } } },
        ],
      },
      select: CONVERSATION_SELECT,
    });
    if (existing) return { conversation: existing, created: false };

    const conversation = await prisma.conversation.create({
      data: {
        type: 'ORGANIZATION' as const,
        subject: input.subject ?? null,
        members: {
          create: [
            { userId: user.userId, organizationId, lastReadAt: new Date() },
            { userId: participantId, organizationId, lastReadAt: new Date() },
          ],
        },
      },
      select: CONVERSATION_SELECT,
    });
    await audit({
      actorUserId: org.user.userId,
      organizationId,
      action: 'conversation.start',
      entityType: 'conversation',
      entityId: conversation.id,
      after: { type: 'ORGANIZATION', participantUserId: participantId },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { conversation, created: true };
  }

  if (input.participantUserId) {
    throw AppError.forbidden(
      'Only organization staff can message a specific user on behalf of an organization.',
    );
  }

  const existing = await prisma.conversation.findFirst({
    where: { type: 'ORGANIZATION', members: { some: { userId: user.userId, organizationId } } },
    select: CONVERSATION_SELECT,
  });
  if (existing) return { conversation: existing, created: false };

  const conversation = await prisma.conversation.create({
    data: {
      type: 'ORGANIZATION' as const,
      subject: input.subject ?? null,
      members: { create: [{ userId: user.userId, organizationId, lastReadAt: new Date() }] },
    },
    select: CONVERSATION_SELECT,
  });
  return { conversation, created: true };
}

// ── Messages ───────────────────────────────────────────────────

async function listMessages(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, conversationParamsSchema);
  await loadConversation(id, user);
  const f = query(ctx, messagesQuerySchema);
  const prisma = getPrisma();

  const where: Prisma.MessageWhereInput = { conversationId: id, deletedAt: null };
  if (f.cursor) {
    const match = CURSOR_PATTERN.exec(f.cursor);
    if (!match) {
      throw AppError.validation('Invalid cursor.', [
        {
          path: 'cursor',
          code: 'invalid',
          message: 'Cursor must look like <createdAtMs>_<messageId>.',
        },
      ]);
    }
    const cursorDate = new Date(Number(match[1]));
    const cursorId = match[2];
    where.OR = [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: cursorId } }];
  }

  const [rows, total] = await Promise.all([
    prisma.message.findMany({
      where,
      select: MESSAGE_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: f.limit + 1,
    }),
    prisma.message.count({ where: { conversationId: id, deletedAt: null } }),
  ]);

  const hasMore = rows.length > f.limit;
  const items = hasMore ? rows.slice(0, f.limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? `${last.createdAt.getTime()}_${last.id}` : null;

  // Documented deviation: keyset pagination reports {limit, nextCursor, total}
  // instead of the page/limit envelope used by offset-paginated lists.
  return { items: await withAttachments(items), meta: { limit: f.limit, nextCursor, total } };
}

async function notifyRecipients(
  conversation: ConversationAccess,
  senderId: string,
  messageId: string,
): Promise<void> {
  const recipientIds = [
    ...new Set(
      conversation.members
        .filter((member) => member.userId !== senderId && !member.muted)
        .map((member) => member.userId),
    ),
  ].slice(0, NOTIFY_FANOUT_LIMIT);
  if (recipientIds.length === 0) return;

  const users = await getPrisma().user.findMany({
    where: { id: { in: recipientIds }, deletedAt: null },
    select: { id: true, preferredLanguage: true },
  });
  for (const recipient of users) {
    const copy =
      MESSAGE_COPY[(recipient.preferredLanguage as string).toLowerCase() as LocaleCode] ??
      MESSAGE_COPY.en;
    try {
      await notify({
        userId: recipient.id,
        type: 'MESSAGE_RECEIVED',
        title: copy.title,
        body: copy.body,
        data: { conversationId: conversation.id, messageId },
      });
    } catch (error) {
      // The message is already persisted — a failed notification never 500s.
      console.warn('[messaging] MESSAGE_RECEIVED notification failed', {
        conversationId: conversation.id,
        messageId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function sendMessage(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, conversationParamsSchema);
  const input = await body(ctx, sendMessageSchema);
  const prisma = getPrisma();
  const conversation = await loadConversation(id, user);

  let joined = conversation.isMember;
  if (!joined) {
    // Staff joining on first post — membership is re-checked by the guard.
    const orgIds = [
      ...new Set(
        conversation.members
          .map((member) => member.organizationId)
          .filter((value): value is string => value !== null),
      ),
    ];
    const mine = await myActiveOrgIds(user.userId);
    const matchedOrg = orgIds.find((orgId) => mine.includes(orgId));
    if (!matchedOrg) throw AppError.forbidden('You do not have access to this conversation.');
    await requireOrgMembership(ctx, 'messaging.send', { orgId: matchedOrg });
    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: id, userId: user.userId } },
      create: {
        conversationId: id,
        userId: user.userId,
        organizationId: matchedOrg,
        lastReadAt: new Date(),
      },
      update: {},
    });
    conversation.members.push({
      userId: user.userId,
      organizationId: matchedOrg,
      lastReadAt: new Date(),
      muted: false,
    });
    joined = true;
  }

  if (conversation.type === 'DIRECT') {
    const others = conversation.members
      .filter((member) => member.userId !== user.userId)
      .map((member) => member.userId);
    for (const other of others) await assertNotBlocked(user.userId, other);
  }

  if (input.attachmentId) {
    const document = await prisma.document.findUnique({
      where: { id: input.attachmentId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!document || document.ownerId !== user.userId || document.status !== 'AVAILABLE') {
      throw AppError.validation('attachmentId must reference one of your available documents.', [
        {
          path: 'attachmentId',
          code: 'not_available',
          message: 'Attachment not found or not available.',
        },
      ]);
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      senderId: user.userId,
      body: input.body,
      attachmentId: input.attachmentId ?? null,
    },
    select: MESSAGE_SELECT,
  });

  // Keep list ordering fresh and advance only the sender's read pointer.
  await prisma.$transaction([
    prisma.conversation.update({ where: { id }, data: { updatedAt: message.createdAt } }),
    prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: user.userId } },
      data: { lastReadAt: message.createdAt },
    }),
  ]);

  await notifyRecipients(conversation, user.userId, message.id);
  const [decorated] = await withAttachments([message]);
  return { message: decorated };
}

async function markRead(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, conversationParamsSchema);
  const input = await body(ctx, markReadSchema);
  const prisma = getPrisma();
  const conversation = await loadConversation(id, user);

  if (!conversation.isMember) {
    if (conversation.type !== 'ORGANIZATION') {
      throw AppError.forbidden('You do not have access to this conversation.');
    }
    const orgIds = [
      ...new Set(
        conversation.members
          .map((member) => member.organizationId)
          .filter((value): value is string => value !== null),
      ),
    ];
    const mine = await myActiveOrgIds(user.userId);
    const matchedOrg = orgIds.find((orgId) => mine.includes(orgId));
    if (!matchedOrg) throw AppError.forbidden('You do not have access to this conversation.');
    await requireOrgMembership(ctx, 'messaging.send', { orgId: matchedOrg });
    await prisma.conversationMember.upsert({
      where: { conversationId_userId: { conversationId: id, userId: user.userId } },
      create: {
        conversationId: id,
        userId: user.userId,
        organizationId: matchedOrg,
        lastReadAt: new Date(),
      },
      update: {},
    });
    conversation.members.push({
      userId: user.userId,
      organizationId: matchedOrg,
      lastReadAt: new Date(),
      muted: false,
    });
  }

  let target = new Date();
  if (input.lastMessageId) {
    const message = await prisma.message.findFirst({
      where: { id: input.lastMessageId, conversationId: id, deletedAt: null },
      select: { createdAt: true },
    });
    if (!message) throw AppError.notFound('Message not found in this conversation.');
    target = message.createdAt;
  }

  const mine = conversation.members.find((member) => member.userId === user.userId);
  const current = mine?.lastReadAt ?? null;
  const advanced = !current || target.getTime() > current.getTime();
  const nextLastReadAt = advanced ? target : current;

  if (advanced) {
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: user.userId } },
      data: { lastReadAt: target },
    });
  }

  const candidates = await prisma.message.findMany({
    where: { conversationId: id, createdAt: { lte: target }, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'desc' },
    take: MARK_READ_BATCH,
  });
  const result = await prisma.messageRead.createMany({
    data: candidates.map((row) => ({ messageId: row.id, userId: user.userId })),
    skipDuplicates: true,
  });

  return { lastReadAt: nextLastReadAt, marked: result.count };
}

// ── Route table ─────────────────────────────────────────────────

export const messagingRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/conversations',
    handler: listConversations,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'My conversations (paginated, unread counts)',
  },
  {
    method: 'POST',
    path: '/conversations',
    handler: start,
    options: { rateLimit: 'messaging' },
    auth: 'authenticated',
    summary: 'Start or reuse a conversation',
  },
  {
    method: 'GET',
    path: '/conversations/:id',
    handler: getConversation,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Conversation detail',
  },
  {
    method: 'GET',
    path: '/conversations/:id/messages',
    handler: listMessages,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Message history (keyset cursor)',
  },
  {
    method: 'POST',
    path: '/conversations/:id/messages',
    handler: sendMessage,
    options: { rateLimit: 'messaging' },
    auth: 'authenticated',
    summary: 'Send a message (blocks honored)',
  },
  {
    method: 'POST',
    path: '/conversations/:id/read',
    handler: markRead,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Mark conversation read (idempotent)',
  },
];
