import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  INTERNATIONAL_APPLICATION_STATUSES,
  isAppError,
  type InternationalApplicationStatus,
} from '@bladna/types';
import { Alert, EmptyState } from '@bladna/ui';
import { getDictionary, isLocale, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import { StatusBadge } from '@/ui/status';
import { internationalRoutes } from '@/server/modules/international';
import { pageSession } from '@/server/page-session';
import type { Handler } from '@/server/http';
import type { AppRoute } from '@/server/router';
import { invoke } from '@/server/ssr';
import { WithdrawInternationalApplicationButton } from './withdraw-button';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/** Statuses `POST /international/applications/:id/withdraw` still accepts. */
const WITHDRAWABLE: readonly InternationalApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'WAITLISTED',
];

const ROUTE_TABLES: AppRoute[][] = [internationalRoutes];

/** Look up a handler from the module route tables so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

/** Fields this page renders from `GET /international/applications` items. */
interface InternationalApplicationItem {
  id: string;
  status: InternationalApplicationStatus;
  submittedAt: string | Date | null;
  updatedAt: string | Date;
  decisionNote: string | null;
  opportunity: {
    id: string;
    titleAr: string;
    titleFr: string;
    titleEn: string;
    provider: string;
  };
}

interface ApplicationsResult {
  items: InternationalApplicationItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Preserve the active filter when moving between pages. */
function pageHref(locale: LocaleCode, page: number, status: string): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/international/applications${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.international.applicationsTitle, robots: { index: false, follow: false } };
}

export default async function InternationalApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const status = (INTERNATIONAL_APPLICATION_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const sessionPath = `/${locale}/international/applications`;
  await pageSession(locale, sessionPath);
  const next = encodeURIComponent(sessionPath);

  let listError: string | null = null;
  let result: ApplicationsResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    result = await invoke<ApplicationsResult>(
      requireHandler('GET', '/international/applications'),
      {
        path: '/international/applications',
        locale,
        query: { page, limit: PAGE_SIZE, status: status || undefined },
      },
    );
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    if (isAppError(error) && error.code === 'BUSINESS_RULE_ERROR') {
      // No volunteer profile — surface the server's honest message instead of
      // rendering a fake empty list.
      listError = error.message;
    } else {
      throw error;
    }
  }

  const { items, meta } = result;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.international.applicationsTitle}</h1>
        <p className="text-sm text-sand-600">{dict.international.applicationsSubtitle}</p>
      </header>

      {/* Status filter — plain GET form, works without JS */}
      {listError ? null : (
        <form method="get" action={sessionPath} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="status" className="block text-sm font-medium text-sand-700">
              {dict.common.status}
            </label>
            <select
              id="status"
              name="status"
              defaultValue={status}
              className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">{dict.common.all}</option>
              {INTERNATIONAL_APPLICATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {dict.international.statuses[value] ?? value}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
          >
            {dict.common.search}
          </button>
        </form>
      )}

      {listError ? (
        <Alert tone="warning">
          <p>{listError}</p>
          <Link
            href={`/${locale}/profile`}
            className="mt-1 inline-block font-semibold text-brand-700 hover:text-brand-800"
          >
            {dict.profile.title} →
          </Link>
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState>
          {dict.international.applicationsEmpty}{' '}
          <Link
            href={`/${locale}/international`}
            className="font-semibold text-brand-700 hover:text-brand-800"
          >
            {dict.international.title} →
          </Link>
        </EmptyState>
      ) : (
        <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white px-5">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0 space-y-1">
                <Link
                  href={`/${locale}/international/${item.opportunity.id}`}
                  className="block truncate font-medium text-sand-900 hover:text-brand-700"
                >
                  {titleFor(item.opportunity, locale)}
                </Link>
                <p className="text-sm text-sand-500">
                  {dict.international.provider}: {item.opportunity.provider}
                </p>
                <p className="text-sm text-sand-500">
                  {dict.international.applicationDate} {formatDate(item.submittedAt, locale)} ·{' '}
                  {dict.international.lastUpdateLabel} {formatDate(item.updatedAt, locale)}
                </p>
                <p className="text-sm text-sand-700">
                  {dict.international.nextActionLabel}:{' '}
                  {dict.international.nextActions[item.status]}
                </p>
                {item.decisionNote ? (
                  <p className="text-xs text-sand-600">{item.decisionNote}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge
                  data-testid="application-status"
                  className="shrink-0"
                  status={item.status}
                  label={dict.international.statuses[item.status] ?? item.status}
                />
                {WITHDRAWABLE.includes(item.status) ? (
                  <WithdrawInternationalApplicationButton locale={locale} applicationId={item.id} />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {listError ? null : meta.totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-4 text-sm"
          aria-label={dict.common.page}
        >
          {meta.page > 1 ? (
            <Link
              href={pageHref(locale, meta.page - 1, status)}
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
              href={pageHref(locale, meta.page + 1, status)}
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
