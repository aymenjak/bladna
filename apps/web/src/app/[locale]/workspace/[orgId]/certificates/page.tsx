import { notFound, redirect } from 'next/navigation';
import {
  CERTIFICATE_STATUSES,
  isAppError,
  type CertificateStatus,
  type LocaleCode,
} from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { certificateRoutes } from '@/server/modules/certificates';
import { hourRoutes } from '@/server/modules/hours';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { formatDate } from '@/ui/format';
import {
  IssueCertificateForm,
  RevokeCertificateButton,
} from '@/ui/components/workspace-certificates';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const ROUTE_TABLES: AppRoute[][] = [certificateRoutes, hourRoutes];

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

interface CertificateRow {
  id: string;
  title: string;
  certificateNumber: string;
  hours: number;
  status: CertificateStatus;
  issuedAt: string | Date;
  expiresAt: string | Date | null;
  revokeReason: string | null;
  volunteerProfile: {
    id: string;
    volunteerId: string;
    user: { firstName: string; lastName: string; email: string };
  };
}

interface CertificatesResult {
  items: CertificateRow[];
  meta: PageMeta;
}

/** A VERIFIED hour row with an activity — the only thing issuable. */
export interface EligibleHour {
  id: string;
  activityId: string;
  volunteerProfileId: string;
  hours: number;
  date: string | Date;
  volunteerName: string;
}

interface HoursResult {
  items: Array<{
    id: string;
    activityId: string | null;
    volunteerProfileId: string;
    hours: number;
    date: string | Date;
    volunteerProfile: { user: { firstName: string; lastName: string } };
  }>;
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
  return `/${locale}/workspace/${orgId}/certificates${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.certificates, robots: { index: false, follow: false } };
}

export default async function CertificatesPage({
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
  const next = encodeURIComponent(`/${locale}/workspace/${orgId}/certificates`);

  const status = (CERTIFICATE_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const filters: Filters = { status };

  let certificates: CertificatesResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  let eligible: EligibleHour[] = [];
  let eligibleLoaded = false;

  try {
    certificates = await invoke<CertificatesResult>(
      requireHandler('GET', '/orgs/:orgId/certificates'),
      {
        path: `/orgs/${orgId}/certificates`,
        locale,
        params: { orgId },
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

  // Optional enrichment: issue candidates are VERIFIED hour rows that carry an
  // activity (issuance requires an activity + its participant). AppError →
  // hide the issue form; success → render it even when no row qualifies.
  try {
    const hours = await invoke<HoursResult>(requireHandler('GET', '/orgs/:orgId/hours'), {
      path: `/orgs/${orgId}/hours`,
      locale,
      params: { orgId },
      query: { page: 1, limit: 100, status: 'VERIFIED' },
    });
    eligible = hours.items
      .filter((row) => row.activityId !== null)
      .map((row) => ({
        id: row.id,
        activityId: row.activityId as string,
        volunteerProfileId: row.volunteerProfileId,
        hours: row.hours,
        date: row.date,
        volunteerName:
          `${row.volunteerProfile.user.firstName} ${row.volunteerProfile.user.lastName}`.trim(),
      }));
    eligibleLoaded = true;
  } catch (error) {
    if (!isAppError(error)) throw error;
    eligibleLoaded = false;
  }

  const { items, meta } = certificates;

  return (
    <div className="space-y-6">
      {eligibleLoaded ? (
        eligible.length > 0 ? (
          <IssueCertificateForm locale={locale} orgId={orgId} candidates={eligible} />
        ) : (
          <section className="rounded-xl border border-dashed border-sand-300 bg-white p-8 text-center">
            <p className="text-sm text-sand-600">{dict.workspace.certificates.noEligibleHours}</p>
          </section>
        )
      ) : null}

      {/* Status filter — plain GET form, works without JS. */}
      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-white p-6"
        action={`/${locale}/workspace/${orgId}/certificates`}
      >
        <div className="min-w-64 flex-1">
          <label htmlFor="cert-status" className="block text-sm font-medium text-sand-700">
            {dict.common.status}
          </label>
          <select
            id="cert-status"
            name="status"
            defaultValue={status}
            className="mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          >
            <option value="">{dict.common.all}</option>
            {CERTIFICATE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {dict.workspace.certificates.statuses[value]}
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
          <p className="py-6 text-center text-sm text-sand-500">
            {dict.workspace.certificates.none}
          </p>
        ) : (
          <ul className="divide-y divide-sand-100">
            {items.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start gap-3 py-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sand-900">{row.title}</span>
                    <StatusBadge
                      status={row.status}
                      label={dict.workspace.certificates.statuses[row.status] ?? row.status}
                    />
                    <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-sand-700">
                      {row.certificateNumber}
                    </span>
                  </div>
                  <p className="text-sm text-sand-600">
                    {`${row.volunteerProfile.user.firstName} ${row.volunteerProfile.user.lastName}`.trim()}
                    {' · '}
                    {row.volunteerProfile.user.email}
                  </p>
                  <p className="text-xs text-sand-500">
                    {dict.workspace.certificates.hoursLabel}: {row.hours} ·{' '}
                    {dict.workspace.hours.dateLabel}: {formatDate(row.issuedAt, locale)}
                  </p>
                  {row.revokeReason ? (
                    <p className="text-xs text-red-700">
                      {dict.workspace.certificates.reasonLabel}: {row.revokeReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  {/* H1 (org side): an issued credential is downloadable and
                      checkable straight from its row — no dead ends. */}
                  <a
                    href={`/api/v1/certificates/${row.id}/pdf?locale=${locale}`}
                    target="_blank"
                    rel="noopener"
                    className="inline-flex min-h-11 items-center rounded-lg border border-sand-200 bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-sand-100"
                  >
                    {dict.profile.certificatePdf}
                  </a>
                  <a
                    href={`/${locale}/verify/certificate?code=${encodeURIComponent(row.certificateNumber)}`}
                    className="inline-flex min-h-11 items-center rounded-lg border border-sand-200 bg-white px-4 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100"
                  >
                    {dict.landing.verifyCta}
                  </a>
                  <RevokeCertificateButton
                    locale={locale}
                    certificateId={row.id}
                    status={row.status}
                  />
                </div>
              </li>
            ))}
          </ul>
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
