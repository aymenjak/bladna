import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  isAppError,
  OPPORTUNITY_STATUSES,
  type OpportunityStatus,
  type OpportunityType,
} from '@bladna/types';
import { EmptyState } from '@bladna/ui';
import { getDictionary, isLocale, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import { opportunityRoutes } from '@/server/modules/opportunities';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import {
  OpportunityCreateControl,
  OpportunityRowActions,
  type OpportunityRowData,
} from '@/ui/components/workspace-opportunities';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const ROUTE_TABLES: AppRoute[][] = [opportunityRoutes];

/** Look up a handler from a module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Row shape of `GET /orgs/:orgId/opportunities` (LIST_SELECT + org extras). */
interface OpportunityItem extends OpportunityRowData {
  slug: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  type: OpportunityType;
  startDate: string | null;
  endDate: string | null;
  applicationDeadline: string | null;
  viewCount: number;
  applicationCount: number;
  createdAt: string | Date;
}

interface OpportunitiesResult {
  items: OpportunityItem[];
  meta: PageMeta;
}

/** Preserve the active status filter when moving between pages. */
function pageHref(locale: LocaleCode, orgId: string, page: number, status: string): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/workspace/${orgId}/opportunities${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.opportunities, robots: { index: false, follow: false } };
}

export default async function WorkspaceOpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const status = (OPPORTUNITY_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const path = `/${locale}/workspace/${orgId}/opportunities`;
  const next = encodeURIComponent(path);

  let result: OpportunitiesResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    result = await invoke<OpportunitiesResult>(
      requireHandler('GET', '/orgs/:orgId/opportunities'),
      {
        path: `/orgs/${orgId}/opportunities`,
        params: { orgId },
        locale,
        query: { page, limit: PAGE_SIZE, status: status || undefined },
      },
    );
  } catch (error) {
    // P31: the shell proved membership — FORBIDDEN is this page's permission,
    // shown as the access panel instead of a "page not found" the tabs link to.
    if (isAppError(error) && error.code === 'FORBIDDEN') {
      return <WorkspaceNoAccess locale={locale} orgId={orgId} />;
    }
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  const { items, meta } = result;
  const statusLabel = (value: OpportunityStatus): string =>
    dict.admin.opportunityStatuses[value] ?? value;

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-sand-900">{dict.workspace.tabs.opportunities}</h2>

        <OpportunityCreateControl locale={locale} orgId={orgId} />

        {/* Status filter — plain GET form, works without JS */}
        <form method="get" action={path} className="flex flex-wrap items-end gap-3">
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
              {OPPORTUNITY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {statusLabel(value)}
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

        {items.length === 0 ? (
          <EmptyState>{dict.workspace.opportunities.none}</EmptyState>
        ) : (
          <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white px-5">
            {items.map((item) => (
              <li key={item.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-sand-900">{titleFor(item, locale)}</p>
                    <p className="text-sm text-sand-500">
                      {dict.common.type}: {item.type} · {dict.common.startDate}:{' '}
                      {formatDate(item.startDate, locale)} · {dict.common.endDate}:{' '}
                      {formatDate(item.endDate, locale)} · {dict.common.deadline}:{' '}
                      {formatDate(item.applicationDeadline, locale)}
                    </p>
                    <p className="text-sm text-sand-500">
                      {dict.common.views}: {item.viewCount} · {dict.common.applicants}:{' '}
                      {item.applicationCount} · {dict.common.createdAt}:{' '}
                      {formatDate(item.createdAt, locale)}
                    </p>
                  </div>
                  <StatusBadge
                    data-testid="opportunity-status"
                    className="shrink-0"
                    status={item.status}
                    label={statusLabel(item.status)}
                  />
                </div>
                <OpportunityRowActions locale={locale} orgId={orgId} item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pagination */}
      {meta.totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-4 text-sm"
          aria-label={dict.common.page}
        >
          {meta.page > 1 ? (
            <Link
              href={pageHref(locale, orgId, meta.page - 1, status)}
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
              href={pageHref(locale, orgId, meta.page + 1, status)}
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
