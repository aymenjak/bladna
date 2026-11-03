import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  APPLICATION_STATUSES,
  isAppError,
  type ApplicationStatus,
  type LocaleCode,
} from '@bladna/types';
import { Card, EmptyState, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { titleFor } from '@/ui/opportunity';
import { applicationRoutes } from '@/server/modules/applications';
import { opportunityRoutes } from '@/server/modules/opportunities';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import { ApplicationsTable } from '@/ui/components/workspace-applications';
import { SectionHeading } from '@/ui/components/section-heading';
import { ArrowRightIcon, BuildingIcon } from '@/ui/components/icons';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const ROUTE_TABLES: AppRoute[][] = [applicationRoutes, opportunityRoutes];

/** Look up a handler from the module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

interface OpportunitiesResult {
  items: OpportunityOption[];
  meta: PageMeta;
}

export interface ApplicationRow {
  id: string;
  status: ApplicationStatus;
  submittedAt: string | Date | null;
  reviewedAt: string | Date | null;
  decisionNote: string | null;
  motivation: string | null;
  volunteerProfile: {
    id: string;
    volunteerId: string;
    verificationStatus: string;
    publicEmail: boolean;
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      profileImage: string | null;
    };
  };
}

interface ApplicationsResult {
  items: ApplicationRow[];
  meta: PageMeta;
}

interface Filters {
  opp: string;
  status: string;
}

/** Preserve the active filters when moving between pages. */
function pageHref(locale: LocaleCode, orgId: string, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.opp) params.set('opp', filters.opp);
  if (filters.status) params.set('status', filters.status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/workspace/${orgId}/applications${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.applications, robots: { index: false, follow: false } };
}

export default async function ApplicationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; orgId: string }>;
  searchParams: Promise<{ opp?: string; status?: string; page?: string }>;
}) {
  const { locale, orgId } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);
  const next = encodeURIComponent(`/${locale}/workspace/${orgId}/applications`);

  const opp = (sp.opp ?? '').trim();
  const status = (APPLICATION_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const filters: Filters = { opp, status };
  const hasOpportunity = opp.length > 0;
  if (hasOpportunity && !UUID_RE.test(opp)) notFound();

  // The org's opportunities — powers the selector and the zero-state link.
  let opportunities: OpportunitiesResult = {
    items: [],
    meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
  };
  let applications: ApplicationsResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    opportunities = await invoke<OpportunitiesResult>(
      requireHandler('GET', '/orgs/:orgId/opportunities'),
      {
        path: `/orgs/${orgId}/opportunities`,
        locale,
        params: { orgId },
        query: { page: 1, limit: 100 },
      },
    );
    if (hasOpportunity) {
      applications = await invoke<ApplicationsResult>(
        requireHandler('GET', '/orgs/:orgId/opportunities/:id/applications'),
        {
          path: `/orgs/${orgId}/opportunities/${opp}/applications`,
          locale,
          params: { orgId, id: opp },
          query: { page, limit: PAGE_SIZE, status: status || undefined },
        },
      );
    }
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

  const current = opportunities.items.find((item) => item.id === opp) ?? null;
  const { items, meta } = applications;

  return (
    <div className="space-y-6">
      {/* Opportunity selector — plain GET form, works without JS. */}
      {opportunities.items.length === 0 ? (
        <EmptyState>
          <BuildingIcon className="mx-auto size-8 text-sand-400" />
          <p className="mt-2 font-medium text-sand-600">
            {dict.workspace.applications.noOpportunities}
          </p>
          <Link
            href={`/${locale}/workspace/${orgId}/opportunities`}
            className={`${buttonClasses({ className: 'mt-3 inline-flex items-center gap-1' })}`}
          >
            {dict.workspace.tabs.opportunities}
            <ArrowRightIcon className="size-4 rtl:rotate-180" />
          </Link>
        </EmptyState>
      ) : (
        <form
          method="get"
          className="flex flex-wrap items-end gap-3 rounded-xl border border-sand-200 bg-white p-6"
          action={`/${locale}/workspace/${orgId}/applications`}
        >
          <div className="min-w-64 flex-1">
            <label htmlFor="opp" className="block text-sm font-medium text-sand-700">
              {dict.workspace.applications.filterOpportunity}
            </label>
            <select
              id="opp"
              name="opp"
              defaultValue={hasOpportunity ? opp : ''}
              className="mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">—</option>
              {opportunities.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {titleFor(item, locale)}
                </option>
              ))}
            </select>
          </div>
          {hasOpportunity ? (
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
                {APPLICATION_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {dict.statuses[value]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="submit"
            className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
          >
            {dict.common.search}
          </button>
        </form>
      )}

      {hasOpportunity && current ? (
        <>
          <Card className="p-6">
            <SectionHeading
              eyebrow={dict.workspace.applications.opportunityColumn}
              title={titleFor(current, locale)}
            />
            {items.length === 0 ? (
              <EmptyState className="mt-4">{dict.workspace.applications.none}</EmptyState>
            ) : (
              <ApplicationsTable
                locale={locale}
                orgId={orgId}
                rows={items.map((row) => ({
                  id: row.id,
                  status: row.status,
                  submittedAt: row.submittedAt,
                  motivation: row.motivation,
                  volunteerName:
                    `${row.volunteerProfile.user.firstName} ${row.volunteerProfile.user.lastName}`.trim(),
                  volunteerEmail: row.volunteerProfile.user.email,
                  volunteerId: row.volunteerProfile.volunteerId,
                }))}
              />
            )}
          </Card>

          {/* Pagination — filters preserved across pages. */}
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
        </>
      ) : null}
    </div>
  );
}
