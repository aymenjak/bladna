import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { EmptyState, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale, type LocaleCode } from '@/ui/i18n';
import { formatDateTime } from '@/ui/format';
import { notificationRoutes } from '@/server/modules/notifications';
import { pageSession } from '@/server/page-session';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { MarkReadButton } from '@/ui/components/account-actions';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const ROUTE_TABLES: AppRoute[][] = [notificationRoutes];

/** Look up a handler from a module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | Date | null;
  createdAt: string | Date;
}

interface NotificationsResult {
  items: NotificationItem[];
  unreadCount: number;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Preserve the unread filter when moving between pages. */
function pageHref(locale: LocaleCode, page: number, unreadOnly: boolean): string {
  const params = new URLSearchParams();
  if (unreadOnly) params.set('unreadOnly', 'true');
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/notifications${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.inbox.title, robots: { index: false, follow: false } };
}

export default async function NotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ unreadOnly?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const unreadOnly = sp.unreadOnly === 'true';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const sessionPath = `/${locale}/notifications`;
  await pageSession(locale, sessionPath);
  const next = encodeURIComponent(sessionPath);

  let result: NotificationsResult = {
    items: [],
    unreadCount: 0,
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    result = await invoke<NotificationsResult>(requireHandler('GET', '/me/notifications'), {
      path: '/me/notifications',
      locale,
      query: { page, limit: PAGE_SIZE, unreadOnly: unreadOnly ? 'true' : undefined },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  const { items, unreadCount, meta } = result;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold text-sand-900">{dict.inbox.title}</h1>
          <p className="text-sm text-sand-600">{dict.inbox.subtitle}</p>
        </div>
        {unreadCount > 0 ? (
          <div className="flex items-center gap-3">
            <span
              data-testid="unread-count"
              className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"
            >
              {dict.inbox.unread}: {unreadCount}
            </span>
            <MarkReadButton locale={locale} all label={dict.inbox.markAllRead} />
          </div>
        ) : null}
      </header>

      {/* Unread filter — GET links work without JS */}
      <nav className="flex gap-2 text-sm" aria-label={dict.common.status}>
        <Link
          href={`/${locale}/notifications`}
          className={buttonClasses({ variant: unreadOnly ? 'outline' : 'primary' })}
        >
          {dict.common.all}
        </Link>
        <Link
          href={`/${locale}/notifications?unreadOnly=true`}
          className={buttonClasses({ variant: unreadOnly ? 'primary' : 'outline' })}
        >
          {dict.inbox.unreadOnly}
        </Link>
      </nav>

      {items.length === 0 ? (
        <EmptyState>{dict.inbox.empty}</EmptyState>
      ) : (
        <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white px-5">
          {items.map((item) => {
            const unread = item.readAt === null;
            return (
              <li key={item.id} className="flex items-start justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm ${
                      unread ? 'font-semibold text-sand-900' : 'font-medium text-sand-700'
                    }`}
                  >
                    {item.title}
                  </p>
                  <p className="mt-0.5 text-sm text-sand-600">{item.body}</p>
                  <p className="mt-1 text-xs text-sand-400">
                    {unread ? (
                      <span className="me-2 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                        {dict.inbox.unread}
                      </span>
                    ) : null}
                    {formatDateTime(item.createdAt, locale)}
                  </p>
                </div>
                {unread ? (
                  <MarkReadButton
                    locale={locale}
                    notificationIds={[item.id]}
                    label={dict.inbox.markRead}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-4 text-sm"
          aria-label={dict.common.page}
        >
          {meta.page > 1 ? (
            <Link
              href={pageHref(locale, meta.page - 1, unreadOnly)}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
            >
              {dict.common.previous}
            </Link>
          ) : (
            <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
              {dict.common.previous}
            </span>
          )}
          <span className="text-sand-600">
            {dict.common.page} {meta.page} {dict.common.of} {meta.totalPages} · {meta.total}
          </span>
          {meta.page < meta.totalPages ? (
            <Link
              href={pageHref(locale, meta.page + 1, unreadOnly)}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
            >
              {dict.common.next}
            </Link>
          ) : (
            <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
              {dict.common.next}
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
