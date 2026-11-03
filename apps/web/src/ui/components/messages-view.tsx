'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Input, Textarea } from '@bladna/ui';
import { api, errorMessageFor, fieldErrors as extractFieldErrors } from '@/ui/api/client';
import { useFocusFirstError } from '@/ui/use-focus-first-error';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { formatDate, formatDateTime, formatTime } from '@/ui/format';
import { PaperclipIcon, SendIcon } from '@/ui/components/icons';
import { conversationTitle, mergeMessagesDesc, parseContactParams } from '@/ui/messages-utils';

/**
 * Conversations list + thread → `GET/POST /conversations*`, `POST
 * /conversations/:id/read`, `POST /me/documents` (attachment upload).
 *
 * Message history travels DESC (createdAt, then id) and the thread renders it
 * reversed; incoming batches are unioned by id (`mergeMessagesDesc`) so polls
 * and sends never duplicate or drop rows. A 15s poll while a thread is open
 * keeps it current — there is no push channel in this stack — and every
 * fetch-while-viewing advances the read pointer (the server call is
 * idempotent).
 */

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ConversationMember {
  userId: string;
  organizationId: string | null;
  firstName: string;
  lastName: string;
  profileImage: string | null;
  isMe: boolean;
}

export interface ConversationItem {
  id: string;
  type: string;
  subject: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  joined: boolean;
  unreadCount: number;
  myLastReadAt: string | Date | null;
  members: ConversationMember[];
}

export interface ConversationsResult {
  items: ConversationItem[];
  meta: PageMeta;
}

interface MessageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  downloadUrl: string;
}

interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  attachmentId: string | null;
  createdAt: string | Date;
  editedAt: string | Date | null;
  sender: { id: string; firstName: string; lastName: string; profileImage: string | null };
  attachment: MessageAttachment | null;
}

interface MessagesResult {
  items: MessageItem[];
  meta: { limit: number; nextCursor: string | null; total: number };
}

const LIST_LIMIT = 20;
const THREAD_LIMIT = 30;
const POLL_MS = 15_000;

/** The id embedded in a pasted conversation link (P19). */
const LOOSE_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** File → base64 payload segment (the upload API takes raw base64). */
function readFileBase64(file: File, failureMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(failureMessage));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error(failureMessage));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Local calendar day key — the thread renders one date separator per day, so
 * consecutive messages only compare equal when they share this key.
 */
function dayKey(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** "Amina Benali" → "AB": the fallback tile in the conversation list. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export function MessagesView({
  locale,
  meId,
  initial,
}: {
  locale: LocaleCode;
  meId: string;
  initial: ConversationsResult;
}) {
  const { dict } = getDictionary(locale);

  // ── Conversation list ─────────────────────────────────────────
  const [conversations, setConversations] = useState<ConversationItem[]>(initial.items);
  const [meta, setMeta] = useState<PageMeta>(initial.meta);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // ── Thread ────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [threadBusy, setThreadBusy] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  // ── Composer / new conversation ───────────────────────────────
  const [draft, setDraft] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [subject, setSubject] = useState('');
  const [startBusy, setStartBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startFieldErrors, setStartFieldErrors] = useState<Record<string, string>>({});
  /** P23: an organization addressed by `?org=` (initiative / profile button). */
  const [orgTarget, setOrgTarget] = useState<{ id: string; name: string } | null>(null);
  // DESIGN §8: failed submit focuses the first invalid control (RESEARCH M4).
  useFocusFirstError(startFieldErrors);

  // P19/P23: contact links open the new-conversation form already addressed —
  // `/messages?to=<id>` (Settings, a directory card) fills the recipient,
  // `?org=<id>&name=` (an initiative's or an organization's Message button)
  // targets the organization instead, so nobody hunts for a raw UUID.
  useEffect(() => {
    const { to, org, name } = parseContactParams(window.location.search);
    if (to) {
      setRecipient(to);
      setNewOpen(true);
      return;
    }
    if (org) {
      setOrgTarget({ id: org, name });
      setNewOpen(true);
    }
  }, []);

  async function loadConversations(
    targetPage: number,
    override?: { q?: string; unreadOnly?: boolean },
  ): Promise<void> {
    const effectiveQ = (override?.q ?? q).trim();
    const effectiveUnread = override?.unreadOnly ?? unreadOnly;
    const params = new URLSearchParams({ page: String(targetPage), limit: String(LIST_LIMIT) });
    if (effectiveQ) params.set('q', effectiveQ);
    if (effectiveUnread) params.set('unreadOnly', 'true');
    setListBusy(true);
    setListError(null);
    try {
      const result = await api.get<ConversationsResult>(`/conversations?${params.toString()}`);
      setConversations(result.data.items);
      setMeta(result.data.meta);
      setPage(targetPage);
    } catch (cause) {
      setListError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setListBusy(false);
    }
  }

  /**
   * Fetch the newest page of a thread (`open` resets state, `sync` unions into
   * what is loaded) and advance the read pointer — the visitor is looking at
   * these messages right now. Background sync failures stay silent: the next
   * explicit action (send, refresh, open) surfaces connectivity problems.
   */
  const fetchMessages = useCallback(
    async (id: string, mode: 'open' | 'sync'): Promise<void> => {
      if (mode === 'open') {
        setThreadBusy(true);
        setThreadError(null);
        setMessages([]);
        setNextCursor(null);
      }
      try {
        const result = await api.get<MessagesResult>(
          `/conversations/${id}/messages?limit=${THREAD_LIMIT}`,
        );
        if (activeRef.current !== id) return; // switched threads mid-flight
        setMessages((previous) =>
          mode === 'open' ? result.data.items : mergeMessagesDesc(previous, result.data.items),
        );
        if (mode === 'open') setNextCursor(result.data.meta.nextCursor);
        setTotal(result.data.meta.total);
        void api
          .post(`/conversations/${id}/read`, {})
          .then(() => {
            if (activeRef.current !== id) return;
            setConversations((previous) =>
              previous.map((conversation) =>
                conversation.id === id ? { ...conversation, unreadCount: 0 } : conversation,
              ),
            );
          })
          .catch(() => {
            /* background: read-pointer sync is retried on the next fetch */
          });
      } catch (cause) {
        if (activeRef.current === id && mode === 'open') {
          setThreadError(
            errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
          );
        }
      } finally {
        if (activeRef.current === id && mode === 'open') setThreadBusy(false);
      }
    },
    [dict.errors],
  );

  const openThread = useCallback(
    (id: string): void => {
      activeRef.current = id;
      setActiveId(id);
      setThreadError(null);
      // Below lg the thread pane sits under the list — bring it into view so
      // opening a conversation doesn't leave the visitor staring at the list.
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        window.requestAnimationFrame(() => {
          document
            .getElementById('thread-pane')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      void fetchMessages(id, 'open');
    },
    [fetchMessages],
  );

  // Poll the open thread — the stack has no websocket, so freshness comes from
  // this interval (documented in the page contract).
  useEffect(() => {
    if (!activeId) return;
    const timer = window.setInterval(() => {
      void fetchMessages(activeId, 'sync');
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, fetchMessages]);

  async function loadOlder(): Promise<void> {
    if (!activeId || !nextCursor || threadBusy) return;
    const id = activeId;
    setThreadBusy(true);
    setThreadError(null);
    try {
      const result = await api.get<MessagesResult>(
        `/conversations/${id}/messages?limit=${THREAD_LIMIT}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (activeRef.current !== id) return;
      setMessages((previous) => mergeMessagesDesc(previous, result.data.items));
      setNextCursor(result.data.meta.nextCursor);
      setTotal(result.data.meta.total);
    } catch (cause) {
      if (activeRef.current === id) {
        setThreadError(
          errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
        );
      }
    } finally {
      if (activeRef.current === id) setThreadBusy(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!activeId || !draft.trim()) return;
    const id = activeId;
    const body = draft.trim();
    setSendBusy(true);
    setSendError(null);
    try {
      let attachmentId: string | undefined;
      if (pendingFile) {
        const contentBase64 = await readFileBase64(pendingFile, dict.errors.generic);
        const uploaded = await api.post<{ document: { id: string } }>('/me/documents', {
          type: 'ATTACHMENT',
          fileName: pendingFile.name,
          mimeType: pendingFile.type || 'application/octet-stream',
          contentBase64,
        });
        attachmentId = uploaded.data.document.id;
      }
      const result = await api.post<{ message: MessageItem }>(`/conversations/${id}/messages`, {
        body,
        ...(attachmentId ? { attachmentId } : {}),
      });
      if (activeRef.current === id) {
        setMessages((previous) => mergeMessagesDesc(previous, [result.data.message]));
        setTotal((previous) => previous + 1);
        setDraft('');
        setPendingFile(null);
        // The server advances only the sender's read pointer on send.
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === id ? { ...conversation, unreadCount: 0 } : conversation,
          ),
        );
      }
    } catch (cause) {
      setSendError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setSendBusy(false);
    }
  }

  async function startConversation(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!orgTarget && !recipient.trim()) return;
    setStartBusy(true);
    setStartError(null);
    setStartFieldErrors({});
    try {
      const started = await api.post<{ conversation: { id: string } }>('/conversations', {
        // Direct: a whole pasted conversation link or a bare id (P19).
        // Organization (P23): the target arrived as `?org=` — the server opens
        // the ORGANIZATION conversation its staff side already sees in the list.
        ...(orgTarget
          ? { organizationId: orgTarget.id }
          : { participantUserId: recipient.match(LOOSE_UUID_RE)?.[0] ?? recipient.trim() }),
        ...(subject.trim() ? { subject: subject.trim() } : {}),
      });
      const detail = await api.get<{ conversation: ConversationItem }>(
        `/conversations/${started.data.conversation.id}`,
      );
      const conversation = detail.data.conversation;
      setConversations((previous) => [
        conversation,
        ...previous.filter((item) => item.id !== conversation.id),
      ]);
      setNewOpen(false);
      setRecipient('');
      setSubject('');
      setOrgTarget(null);
      openThread(conversation.id);
    } catch (cause) {
      setStartFieldErrors(extractFieldErrors(cause));
      setStartError(
        errorMessageFor(cause, { errors: dict.errors, genericFallback: dict.errors.generic }),
      );
    } finally {
      setStartBusy(false);
    }
  }

  const active = conversations.find((conversation) => conversation.id === activeId) ?? null;
  /** The API ships messages DESC (newest first); the thread reads oldest → newest. */
  const ordered = [...messages].reverse();

  function searchSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void loadConversations(1);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* ── Conversations ─────────────────────────────────────── */}
      <Card
        as="section"
        aria-label={dict.messages.title}
        className="flex max-h-[70vh] flex-col p-0 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 px-4 py-3">
          <h2 className="text-base font-semibold text-sand-900">{dict.messages.title}</h2>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                // Closing the form drops an `?org=` target — reopening starts fresh.
                if (newOpen) setOrgTarget(null);
                setNewOpen(!newOpen);
              }}
            >
              {dict.messages.newConversation}
            </Button>
            <Button
              size="sm"
              variant="outline"
              loading={listBusy}
              onClick={() => void loadConversations(page)}
            >
              {dict.messages.refresh}
            </Button>
          </div>
        </div>

        {newOpen ? (
          <form
            onSubmit={startConversation}
            className="space-y-3 border-b border-sand-100 px-4 py-3"
          >
            {startError ? <Alert role="alert">{startError}</Alert> : null}
            {orgTarget ? (
              // P23: addressed from `?org=` — the id is fixed by the link, so
              // show who it is instead of a raw-UUID input (server-side validated).
              <div className="rounded-lg border border-sand-200 bg-sand-50 px-3 py-2 text-sm">
                <span className="text-sand-500">{dict.common.organization}: </span>
                <span className="font-medium text-sand-800">{orgTarget.name || orgTarget.id}</span>
              </div>
            ) : (
              <Input
                label={dict.messages.recipientLabel}
                hint={dict.messages.recipientHint}
                required
                value={recipient}
                onChange={(event) => setRecipient(event.target.value)}
                error={startFieldErrors.participantUserId}
              />
            )}
            <Input
              label={dict.messages.subjectLabel}
              placeholder={dict.messages.subjectPlaceholder}
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              error={startFieldErrors.subject}
            />
            <Button
              type="submit"
              size="sm"
              loading={startBusy}
              disabled={!orgTarget && !recipient.trim()}
            >
              {dict.messages.start}
            </Button>
          </form>
        ) : null}

        <form onSubmit={searchSubmit} className="space-y-2 border-b border-sand-100 px-4 py-3">
          <div className="flex gap-2">
            <Input
              aria-label={dict.common.search}
              placeholder={dict.messages.searchPlaceholder}
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" loading={listBusy}>
              {dict.common.search}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-sand-700">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => {
                const checked = event.target.checked;
                setUnreadOnly(checked);
                void loadConversations(1, { unreadOnly: checked });
              }}
              className="size-4 rounded border-sand-300"
            />
            {dict.messages.unreadOnly}
          </label>
        </form>

        {listError ? (
          <Alert role="alert" className="mx-4 mt-3">
            {listError}
          </Alert>
        ) : null}

        <ul className="min-h-0 flex-1 divide-y divide-sand-100 overflow-y-auto">
          {conversations.length === 0 ? (
            <li className="px-4 py-6">
              <EmptyState>{dict.messages.noConversations}</EmptyState>
            </li>
          ) : null}
          {conversations.map((conversation) => {
            // The avatar shows the other side (falling back to the first
            // member); the row itself carries title, date and unread count.
            const peer =
              conversation.members.find((member) => !member.isMe) ?? conversation.members[0];
            const peerName = peer ? `${peer.firstName} ${peer.lastName}`.trim() : '';
            const isActive = conversation.id === activeId;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => openThread(conversation.id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex w-full items-center gap-3 border-s-2 px-4 py-3 text-start ${
                    isActive
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-transparent hover:bg-sand-50'
                  }`}
                >
                  <Avatar
                    size="sm"
                    aria-hidden
                    src={peer?.profileImage ?? undefined}
                    className="shrink-0"
                  >
                    {initialsOf(peerName)}
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-sand-900">
                        {conversationTitle(conversation, {
                          direct: dict.messages.fallbackDirect,
                          organization: dict.messages.fallbackGroup,
                        })}
                      </span>
                      {conversation.unreadCount > 0 ? (
                        <Badge tone="info">{conversation.unreadCount}</Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-sand-500">
                      {formatDateTime(conversation.updatedAt, locale)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {meta.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-sand-100 px-4 py-2 text-sm">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1 || listBusy}
              onClick={() => void loadConversations(page - 1)}
            >
              {dict.common.previous}
            </Button>
            <span className="text-sand-600">
              {dict.common.page} {meta.page} {dict.common.of} {meta.totalPages}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={page >= meta.totalPages || listBusy}
              onClick={() => void loadConversations(page + 1)}
            >
              {dict.common.next}
            </Button>
          </div>
        ) : null}
      </Card>

      {/* ── Thread ────────────────────────────────────────────── */}
      <Card
        as="section"
        id="thread-pane"
        aria-label={
          active
            ? conversationTitle(active, {
                direct: dict.messages.fallbackDirect,
                organization: dict.messages.fallbackGroup,
              })
            : dict.messages.selectPrompt
        }
        className="flex max-h-[70vh] min-h-[420px] scroll-mt-20 flex-col p-0 shadow-sm"
      >
        {!activeId ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState>{dict.messages.selectPrompt}</EmptyState>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-sand-900">
                  {active
                    ? conversationTitle(active, {
                        direct: dict.messages.fallbackDirect,
                        organization: dict.messages.fallbackGroup,
                      })
                    : dict.messages.title}
                </h2>
                {active && active.members.some((member) => !member.isMe) ? (
                  <p className="truncate text-xs text-sand-500">
                    {active.members
                      .filter((member) => !member.isMe)
                      .map((member) => `${member.firstName} ${member.lastName}`.trim())
                      .join(' · ')}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                loading={threadBusy}
                onClick={() => activeId && void fetchMessages(activeId, 'sync')}
              >
                {dict.messages.refresh}
              </Button>
            </div>

            {threadError ? (
              <Alert role="alert" className="mx-4 mt-3">
                {threadError}
              </Alert>
            ) : null}

            <ol className="min-h-0 flex-1 overflow-y-auto bg-sand-50 px-4 py-4">
              {threadBusy && messages.length === 0 ? (
                <li className="text-center text-sm text-sand-500">{dict.common.loading}</li>
              ) : null}
              {!threadBusy && messages.length === 0 ? (
                <li>
                  <EmptyState>{dict.messages.noMessages}</EmptyState>
                </li>
              ) : null}
              {ordered.map((message, index) => {
                const mine = message.senderId === meId;
                const previous = index > 0 ? ordered[index - 1] : null;
                const newDay =
                  !previous || dayKey(previous.createdAt) !== dayKey(message.createdAt);
                // Consecutive messages from one sender drop the repeated name
                // and tighten their gap — one visual "group" per turn.
                const grouped =
                  Boolean(previous) && !newDay && previous?.senderId === message.senderId;
                const senderName = `${message.sender.firstName} ${message.sender.lastName}`.trim();
                return (
                  <Fragment key={message.id}>
                    {newDay ? (
                      <li className="mt-4 flex items-center gap-3 first:mt-0">
                        <span aria-hidden className="h-px flex-1 bg-sand-200" />
                        <span className="text-xs font-medium text-sand-500">
                          {formatDate(message.createdAt, locale)}
                        </span>
                        <span aria-hidden className="h-px flex-1 bg-sand-200" />
                      </li>
                    ) : null}
                    <li
                      className={`flex first:mt-0 ${grouped ? 'mt-1.5' : 'mt-3'} ${
                        mine ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div className="max-w-[85%]">
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm ${
                            mine
                              ? 'rounded-ee-md bg-brand-600 text-white'
                              : 'rounded-es-md border border-sand-200 bg-white text-sand-900'
                          }`}
                        >
                          {!mine && !grouped ? (
                            <p className="mb-0.5 text-xs font-semibold text-brand-700">
                              {senderName}
                            </p>
                          ) : null}
                          <p dir="auto" className="whitespace-pre-wrap break-words">
                            {message.body}
                          </p>
                          {message.attachment ? (
                            <a
                              href={message.attachment.downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-2 ${
                                mine ? 'text-white' : 'text-brand-700'
                              }`}
                            >
                              <PaperclipIcon className="size-3.5" />
                              {message.attachment.fileName}
                            </a>
                          ) : message.attachmentId ? (
                            <p
                              className={`mt-1 inline-flex items-center gap-1 text-xs ${
                                mine ? 'text-white' : 'text-sand-500'
                              }`}
                            >
                              <PaperclipIcon className="size-3.5" />
                              {dict.messages.attachments}
                            </p>
                          ) : null}
                        </div>
                        {/* Meta sits outside the bubble: colour contrast on the
                            tinted thread background, no noise inside the text. */}
                        <p
                          className={`mt-1 text-[11px] text-sand-500 ${
                            mine ? 'text-end' : 'text-start'
                          }`}
                        >
                          {formatTime(message.createdAt, locale)}
                        </p>
                      </div>
                    </li>
                  </Fragment>
                );
              })}
            </ol>

            {nextCursor ? (
              <div className="border-t border-sand-200 bg-white px-4 py-2 text-center">
                <Button
                  size="sm"
                  variant="ghost"
                  loading={threadBusy}
                  onClick={() => void loadOlder()}
                >
                  {dict.messages.loadOlder}
                </Button>
                <span className="ms-2 text-xs text-sand-500">({total})</span>
              </div>
            ) : null}

            <form onSubmit={send} className="space-y-2 border-t border-sand-200 bg-white px-4 py-3">
              {sendError ? <Alert role="alert">{sendError}</Alert> : null}
              {pendingFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-sand-100 px-3 py-1.5 text-xs text-sand-700">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <PaperclipIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{pendingFile.name}</span>
                  </span>
                  <button
                    type="button"
                    className="font-medium text-red-700 hover:text-red-800"
                    onClick={() => setPendingFile(null)}
                  >
                    {dict.common.cancel}
                  </button>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <Textarea
                  aria-label={dict.messages.messagePlaceholder}
                  placeholder={dict.messages.messagePlaceholder}
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Chat convention: Enter sends, Shift+Enter keeps the
                    // newline (IME composition stays out of the way).
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  className="min-h-0 flex-1"
                />
                <Button
                  type="submit"
                  loading={sendBusy}
                  disabled={!draft.trim()}
                  className="shrink-0"
                >
                  <SendIcon className="size-4" />
                  {dict.messages.send}
                </Button>
              </div>
              {/* The native file control stays keyboard-reachable (sr-only
                  input) while the label wears the visible affordance. */}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sand-200 px-3 py-1.5 text-xs font-medium text-sand-700 hover:bg-sand-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600">
                <PaperclipIcon className="size-3.5" />
                {dict.messages.attachments}
                <input
                  type="file"
                  aria-label={dict.messages.attachments}
                  onChange={(event) => setPendingFile(event.target.files?.[0] ?? null)}
                  className="sr-only"
                />
              </label>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
