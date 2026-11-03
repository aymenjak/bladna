import { notFound, redirect } from 'next/navigation';
import { HOUR_STATUSES, isAppError, type HourStatus, type LocaleCode } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { hourRoutes } from '@/server/modules/hours';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { HoursTable } from '@/ui/components/workspace-hours';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const ROUTE_TABLES: AppRoute[][] = [hourRoutes];

/** Look up a handler from the module route table so SSR can call it in-process. */
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

export interface HourRow {
  id: string;
  activityId: string | null;
  hours: number;
  date: string | Date;
  status: HourStatus;
  source: string;
  verifiedAt: string | Date | null;
  rejectReason: string | null;
  revokedAt: string | Date | null;
  revokeReason: string | null;
  createdAt: string | Date;
  volunteerProfile: {
    id: string;
    volunteerId: string;
    user: { firstName: string; lastName: string; email: string };
  };
}

interface HoursResult {
  items: HourRow[];
  meta: PageMeta;
}

interface Filters {
  status: string;
}

/** Preserve the active filter when moving between pages. */
function pageHref(locale: LocaleCode, orgId: string, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/workspace/${orgId}/hours${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.hours, robots: { index: false, follow: false } };
}

export default async function HoursPage({
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
  const next = encodeURIComponent(`/${locale}/workspace/${orgId}/hours`);

  const status = (HOUR_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const filters: Filters = { status };

  let hours: HoursResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };

  try {
    hours = await invoke<HoursResult>(requireHandler('GET', '/orgs/:orgId/hours'), {
      path: `/orgs/${orgId}/hours`,
      locale,
      params: { orgId },
      query: { page, limit: PAGE_SIZE, status: status || undefined },
    });
  } catch (error) {
    // The shell already proved membership; a FORBIDDEN here is this page's
    // own permission — show the access panel, not a "page not found" the
    // workspace tabs contradict (P31).
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

  const { items, meta } = hours;

  return (
    <div className="space-y-6">
      {/* Status filter — plain GET form, works without JS. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-white p-6"
        action={`/${locale}/workspace/${orgId}/hours`}
      >
        <div className="min-w-64 flex-1">
          <label htmlFor="hours-status" className="block text-sm font-medium text-sand-700">
            {dict.common.status}
          </label>
          <select
            id="hours-status"
            name="status"
            defaultValue={status}
            className="mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">{dict.common.all}</option>
            {HOUR_STATUSES.map((value) => (
              <option key={value} value={value}>
                {dict.workspace.hours.statuses[value]}
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

      <Card className="p-6">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-sand-500">{dict.workspace.hours.none}</p>
        ) : (
          <HoursTable
            locale={locale}
            orgId={orgId}
            rows={items.map((row) => ({
              id: row.id,
              status: row.status,
              hours: row.hours,
              date: row.date,
              source: row.source,
              rejectReason: row.rejectReason,
              revokeReason: row.revokeReason,
              verifiedAt: row.verifiedAt,
              volunteerName:
                `${row.volunteerProfile.user.firstName} ${row.volunteerProfile.user.lastName}`.trim(),
              volunteerEmail: row.volunteerProfile.user.email,
              volunteerId: row.volunteerProfile.volunteerId,
            }))}
          />
        )}
      </Card>

      {/* Pagination — filter preserved across pages. */}
      {meta.totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-4 text-sm"
          aria-label={dict.common.page}
        >
          {meta.page > 1 ? (
            <a
              href={pageHref(locale, orgId, meta.page - 1, filters)}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
            >
              {dict.common.previous}
            </a>
          ) : (
            <span className="rounded-lg border border-sand-100 inline-flex min-h-11 items-center px-4 text-sand-400">
              {dict.common.previous}
            </span>
          )}
          <span className="text-sand-600">
            {dict.common.page} {meta.page} {dict.common.of} {meta.totalPages} · {meta.total}
          </span>
          {meta.page < meta.totalPages ? (
            <a
              href={pageHref(locale, orgId, meta.page + 1, filters)}
              className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 font-medium text-sand-700 hover:bg-sand-100"
            >
              {dict.common.next}
            </a>
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
