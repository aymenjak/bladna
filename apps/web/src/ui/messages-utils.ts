/**
 * Pure helpers for the Messages UI (kept free of React so they unit-test in
 * Node). Message lists travel the API in DESC order — `createdAt` desc with
 * `id` desc as the tie-break, matching the server's keyset ordering
 * (`modules/messaging.ts`).
 */

export interface MessageLike {
  id: string;
  createdAt: string | Date;
}

export interface ConversationLike {
  subject: string | null;
  type: string;
  members: Array<{ userId: string; firstName: string; lastName: string; isMe: boolean }>;
}

/** Newest first: `createdAt` desc, then `id` desc (Prisma `[{ createdAt: 'desc' }, { id: 'desc' }]` order). */
export function compareMessagesDesc(a: MessageLike, b: MessageLike): number {
  const aTime = new Date(a.createdAt).getTime();
  const bTime = new Date(b.createdAt).getTime();
  if (aTime !== bTime) return bTime - aTime;
  return a.id < b.id ? 1 : b.id < a.id ? -1 : 0;
}

/**
 * Union two DESC-ordered batches by `id` and return them sorted in server
 * order. Used when a poll/send response overlaps what is already loaded —
 * dedupe by id so the same message never renders twice, and keep both sides
 * so a partially-overlapping page cannot silently drop messages.
 */
export function mergeMessagesDesc<T extends MessageLike>(existing: T[], incoming: T[]): T[] {
  const byId = new Map<string, T>();
  for (const message of [...existing, ...incoming]) byId.set(message.id, message);
  return [...byId.values()].sort(compareMessagesDesc);
}

/**
 * Display title for a conversation: the explicit subject wins, otherwise the
 * other members' names (own membership is excluded), otherwise a fallback by
 * conversation type.
 */
export function conversationTitle(
  conversation: ConversationLike,
  fallback: { direct: string; organization: string },
): string {
  if (conversation.subject && conversation.subject.trim()) return conversation.subject.trim();
  const others = conversation.members.filter((member) => !member.isMe);
  const names = others.map((member) => `${member.firstName} ${member.lastName}`.trim());
  if (names.length > 0) return names.join(', ');
  return conversation.type === 'DIRECT' ? fallback.direct : fallback.organization;
}

// ── P23: contact entry points ───────────────────────────────────────────────
/** An exact user/org id — the only shape the compose form (and `?next=`) accepts. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Display-only org name riding in the URL — capped so `?next=` stays small. */
const CONTACT_NAME_MAX = 120;

export interface ContactParams {
  /** `/messages?to=` — a directory card or a Settings conversation link. */
  to: string | null;
  /** `/messages?org=` (+ `name`) — an initiative or an organization profile. */
  org: string | null;
  name: string;
}

/**
 * Read the contact deep-links off a query string, keeping only what the
 * compose form accepts: a UUID recipient, or a UUID organization plus its
 * (capped) display name. Anything else — junk ids, extra params — is dropped
 * instead of being echoed back through the login/MFA `?next=` bounce.
 */
export function parseContactParams(
  search: string | Readonly<Record<string, string | string[] | undefined>>,
): ContactParams {
  let params: URLSearchParams;
  if (typeof search === 'string') {
    params = new URLSearchParams(search.replace(/^\?/, ''));
  } else {
    params = new URLSearchParams();
    for (const key of Object.keys(search)) {
      const value = search[key];
      if (typeof value === 'string') params.set(key, value);
    }
  }
  const to = params.get('to');
  const toId = to && UUID_RE.test(to) ? to : null;
  const org = params.get('org');
  const orgId = org && UUID_RE.test(org) ? org : null;
  const name = params.get('name') ?? '';
  return {
    to: toId,
    org: orgId,
    // The display name only travels with a valid organization target — inert
    // otherwise, so `contactQuery` can never emit it on its own.
    name: orgId ? name.slice(0, CONTACT_NAME_MAX) : '',
  };
}

/**
 * The validated `?next=` fragment for `/messages`: the page folds its own
 * contact params back into the path it bounces through login with, so an
 * anonymous visitor who clicked "Message" lands on an already-addressed form
 * after signing in (P23).
 */
export function contactQuery(
  search: string | Readonly<Record<string, string | string[] | undefined>>,
): string {
  const { to, org, name } = parseContactParams(search);
  const params = new URLSearchParams();
  if (to) params.set('to', to);
  if (org) {
    params.set('org', org);
    if (name) params.set('name', name);
  }
  return params.toString();
}
