import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ATTENDANCE_STATUSES, isAppError, type LocaleCode } from '@bladna/types';
import { Card, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { titleFor } from '@/ui/opportunity';
import { attendanceRoutes } from '@/server/modules/attendance';
import { opportunityRoutes } from '@/server/modules/opportunities';
import { volunteerRoutes } from '@/server/modules/volunteers';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { formatDateTime } from '@/ui/format';
import {
  CreateSessionForm,
  ManualAttendanceForm,
  RecordActions,
  SessionActions,
} from '@/ui/components/workspace-attendance';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const RECORD_PAGE_SIZE = 20;
const SESSION_PAGE_SIZE = 10;
const ROUTE_TABLES: AppRoute[][] = [attendanceRoutes, opportunityRoutes, volunteerRoutes];

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

interface OpportunityOption {
  id: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
}

interface VolunteerOption {
  id: string;
  volunteerId: string;
  firstName: string;
  lastName: string;
}

interface SessionRow {
  id: string;
  name: string;
  startsAt: string | Date;
  expiresAt: string | Date;
  revokedAt: string | Date | null;
  opportunity: OpportunityOption;
  _count: { attendance: number };
}

interface RecordRow {
  id: string;
  status: 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'REJECTED' | 'ABSENT';
  method: string;
  date: string | Date;
  checkInAt: string | Date | null;
  checkOutAt: string | Date | null;
  hours: number | null;
  rejectReason: string | null;
  sessionId: string | null;
  volunteerProfile: {
    id: string;
    volunteerId: string;
    user: { firstName: string; lastName: string; email: string };
  };
  opportunity: OpportunityOption;
  session: { id: string; name: string } | null;
  hour: { id: string; status: string } | null;
}

interface SessionsResult {
  items: SessionRow[];
  meta: PageMeta;
}

interface RecordsResult {
  items: RecordRow[];
  meta: PageMeta;
}

interface VolunteersResult {
  items: VolunteerOption[];
  meta: PageMeta;
}

interface Filters {
  status: string;
  opp: string;
}

/** Preserve the active filters when moving between record pages. */
function recordsHref(locale: LocaleCode, orgId: string, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.opp) params.set('opp', filters.opp);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/workspace/${orgId}/attendance${qs ? `?${qs}` : ''}`;
}

/** Sessions use their own pager key so both lists can paginate independently. */
function sessionsHref(locale: LocaleCode, orgId: string, spage: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.opp) params.set('opp', filters.opp);
  if (spage > 1) params.set('spage', String(spage));
  const qs = params.toString();
  return `/${locale}/workspace/${orgId}/attendance${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.attendance, robots: { index: false, follow: false } };
}

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ status?: string; opp?: string; page?: string; spage?: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);
  const next = encodeURIComponent(`/${locale}/workspace/${orgId}/attendance`);

  const status = (ATTENDANCE_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const opp = (sp.opp ?? '').trim();
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const spage = Math.max(1, Number.parseInt(sp.spage ?? '1', 10) || 1);
  const filters: Filters = { status, opp };

  let opportunities: { items: OpportunityOption[]; meta: PageMeta } = {
    items: [],
    meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
  };
  let sessions: SessionsResult = {
    items: [],
    meta: { page: spage, limit: SESSION_PAGE_SIZE, total: 0, totalPages: 0 },
  };
  let records: RecordsResult = {
    items: [],
    meta: { page, limit: RECORD_PAGE_SIZE, total: 0, totalPages: 0 },
  };
  let volunteers: VolunteersResult | null = null;

  try {
    opportunities = await invoke<{ items: OpportunityOption[]; meta: PageMeta }>(
      requireHandler('GET', '/orgs/:orgId/opportunities'),
      {
        path: `/orgs/${orgId}/opportunities`,
        locale,
        params: { orgId },
        query: { page: 1, limit: 100 },
      },
    );
    // Attendance routes resolve the org from the `orgId` query parameter —
    // these paths carry no :orgId segment.
    sessions = await invoke<SessionsResult>(requireHandler('GET', '/attendance/sessions'), {
      path: '/attendance/sessions',
      locale,
      query: { orgId, page: spage, limit: SESSION_PAGE_SIZE },
    });
    records = await invoke<RecordsResult>(requireHandler('GET', '/attendance'), {
      path: '/attendance',
      locale,
      query: {
        orgId,
        page,
        limit: RECORD_PAGE_SIZE,
        status: status || undefined,
        opportunityId: opp || undefined,
      },
    });
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

  // Optional enrichment: the public directory powers the manual form's
  // volunteer select (opt-in profiles only, first page).
  try {
    volunteers = await invoke<VolunteersResult>(requireHandler('GET', '/volunteers'), {
      path: '/volunteers',
      locale,
      query: { page: 1, limit: 100 },
    });
  } catch (error) {
    if (!isAppError(error)) throw error;
    volunteers = null;
  }

  const volunteerOptions = new Map<string, VolunteerOption>();
  for (const item of volunteers?.items ?? []) {
    volunteerOptions.set(item.id, item);
  }
  for (const row of records.items) {
    if (!volunteerOptions.has(row.volunteerProfile.id)) {
      volunteerOptions.set(row.volunteerProfile.id, {
        id: row.volunteerProfile.id,
        volunteerId: row.volunteerProfile.volunteerId,
        firstName: row.volunteerProfile.user.firstName,
        lastName: row.volunteerProfile.user.lastName,
      });
    }
  }

  const hasOpportunity = opportunities.items.length > 0;

  return (
    <div className="space-y-6">
      {hasOpportunity ? (
        <CreateSessionForm locale={locale} opportunities={opportunities.items} />
      ) : (
        <section className="rounded-xl border border-dashed border-sand-300 bg-white p-8 text-center">
          <p className="text-sm text-sand-600">{dict.workspace.attendance.noOpportunities}</p>
          <Link
            href={`/${locale}/workspace/${orgId}/opportunities`}
            className={buttonClasses({ className: 'mt-3' })}
          >
            {dict.workspace.tabs.opportunities} →
          </Link>
        </section>
      )}

      {/* Check-in sessions — QR panel lives inside each row's actions. */}
      <Card className="p-6">
        {sessions.items.length === 0 ? (
          <p className="py-4 text-center text-sm text-sand-500">{dict.common.empty}</p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {sessions.items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-3 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sand-900">{row.name}</span>
                    {row.revokedAt ? (
                      <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                        {dict.workspace.attendance.revoked}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-sand-600">{titleFor(row.opportunity, locale)}</p>
                  <p className="text-xs text-sand-500">
                    {dict.workspace.attendance.startsAt}: {formatDateTime(row.startsAt, locale)} ·{' '}
                    {dict.workspace.attendance.expiresAt}: {formatDateTime(row.expiresAt, locale)}
                  </p>
                  <p className="text-xs text-sand-500">
                    {dict.workspace.attendance.records}: {row._count.attendance}
                  </p>
                </div>
                <SessionActions
                  locale={locale}
                  sessionId={row.id}
                  revoked={row.revokedAt !== null}
                />
              </li>
            ))}
          </ul>
        )}
        {sessions.meta.totalPages > 1 ? (
          <nav
            className="mt-4 flex items-center justify-center gap-4 text-sm"
            aria-label={dict.common.page}
          >
            {sessions.meta.page > 1 ? (
              <a
                href={sessionsHref(locale, orgId, sessions.meta.page - 1, filters)}
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
              {dict.common.page} {sessions.meta.page} {dict.common.of} {sessions.meta.totalPages} ·{' '}
              {sessions.meta.total}
            </span>
            {sessions.meta.page < sessions.meta.totalPages ? (
              <a
                href={sessionsHref(locale, orgId, sessions.meta.page + 1, filters)}
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
      </Card>

      {hasOpportunity && volunteerOptions.size > 0 ? (
        <ManualAttendanceForm
          locale={locale}
          opportunities={opportunities.items}
          volunteers={Array.from(volunteerOptions.values())}
        />
      ) : null}

      {/* Records filter — plain GET form, works without JS. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-white p-6"
        action={`/${locale}/workspace/${orgId}/attendance`}
      >
        <div className="min-w-64 flex-1">
          <label htmlFor="att-opp" className="block text-sm font-medium text-sand-700">
            {dict.workspace.attendance.opportunity}
          </label>
          <select
            id="att-opp"
            name="opp"
            defaultValue={opp}
            className="mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">{dict.common.all}</option>
            {opportunities.items.map((item) => (
              <option key={item.id} value={item.id}>
                {titleFor(item, locale)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="att-status" className="block text-sm font-medium text-sand-700">
            {dict.common.status}
          </label>
          <select
            id="att-status"
            name="status"
            defaultValue={status}
            className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">{dict.common.all}</option>
            {ATTENDANCE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {dict.workspace.attendance.statuses[value]}
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
        <h2 className="text-base font-semibold text-sand-900">
          {dict.workspace.attendance.records}
        </h2>
        {records.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-sand-500">{dict.workspace.attendance.none}</p>
        ) : (
          <ul className="mt-3 divide-y divide-sand-100">
            {records.items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-3 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sand-900">
                      {`${row.volunteerProfile.user.firstName} ${row.volunteerProfile.user.lastName}`.trim()}
                    </span>
                    <StatusBadge
                      status={row.status}
                      label={dict.workspace.attendance.statuses[row.status]}
                    />
                  </div>
                  <p className="text-sm text-sand-600">{titleFor(row.opportunity, locale)}</p>
                  <p className="text-xs text-sand-500">
                    {dict.workspace.attendance.dateLabel}: {formatDateTime(row.date, locale)}
                    {row.hours !== null ? (
                      <>
                        {' · '}
                        {dict.workspace.attendance.hoursLabel}: {row.hours}
                      </>
                    ) : null}
                    {row.session ? <> · {row.session.name}</> : null}
                  </p>
                  {row.rejectReason ? (
                    <p className="text-xs text-red-700">
                      {dict.workspace.attendance.reasonLabel}: {row.rejectReason}
                    </p>
                  ) : null}
                </div>
                <RecordActions
                  locale={locale}
                  attendanceId={row.id}
                  hours={row.hours}
                  decided={row.status !== 'PENDING_CONFIRMATION'}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Record pagination — filters preserved across pages. */}
      {records.meta.totalPages > 1 ? (
        <nav
          className="flex items-center justify-center gap-4 text-sm"
          aria-label={dict.common.page}
        >
          {records.meta.page > 1 ? (
            <a
              href={recordsHref(locale, orgId, records.meta.page - 1, filters)}
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
            {dict.common.page} {records.meta.page} {dict.common.of} {records.meta.totalPages} ·{' '}
            {records.meta.total}
          </span>
          {records.meta.page < records.meta.totalPages ? (
            <a
              href={recordsHref(locale, orgId, records.meta.page + 1, filters)}
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
