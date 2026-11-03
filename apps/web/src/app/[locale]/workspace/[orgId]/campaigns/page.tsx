import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CAMPAIGN_STATUSES, isAppError, type CampaignStatus } from '@bladna/types';
import { EmptyState } from '@bladna/ui';
import { getDictionary, isLocale, type LocaleCode } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { campaignRoutes } from '@/server/modules/campaigns';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { WorkspaceNoAccess } from '@/ui/components/workspace-no-access';
import {
  CampaignContributions,
  CampaignCreateControl,
  CampaignParticipants,
  CampaignRowActions,
} from '@/ui/components/workspace-campaigns';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const ROUTE_TABLES: AppRoute[][] = [campaignRoutes];

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

/**
 * Row shape of `GET /orgs/:orgId/campaigns` (CAMPAIGN_DETAIL_SELECT). Decimal
 * columns survive SSR in-process (Prisma Decimal) or as strings over JSON, so
 * they are widened to `number | string` and normalized before rendering.
 */
interface CampaignItem {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  startDate: string | Date;
  endDate: string | Date;
  status: CampaignStatus;
  volunteerTarget: number | null;
  hourTarget: number | string | null;
  beneficiaryTarget: number | null;
  budget: number | string | null;
  currency: string;
  createdAt: string | Date;
  _count: { participants: number; opportunities: number };
}

interface CampaignsResult {
  items: CampaignItem[];
  meta: PageMeta;
}

/** `Date` from the in-process handler, ISO string after JSON — always ISO here. */
function isoDate(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function numeric(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Preserve the active status filter when moving between pages. */
function pageHref(locale: LocaleCode, orgId: string, page: number, status: string): string {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/workspace/${orgId}/campaigns${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.workspace.tabs.campaigns, robots: { index: false, follow: false } };
}

export default async function WorkspaceCampaignsPage({
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
  const labels = dict.workspace.campaigns;

  const status = (CAMPAIGN_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const path = `/${locale}/workspace/${orgId}/campaigns`;
  const next = encodeURIComponent(path);

  let result: CampaignsResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    result = await invoke<CampaignsResult>(requireHandler('GET', '/orgs/:orgId/campaigns'), {
      path: `/orgs/${orgId}/campaigns`,
      params: { orgId },
      locale,
      query: { page, limit: PAGE_SIZE, status: status || undefined },
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

  const { items, meta } = result;
  const hourTarget = (item: CampaignItem): string => {
    const value = numeric(item.hourTarget);
    return value === null ? '—' : formatNumber(value, locale);
  };
  const budget = (item: CampaignItem): string => {
    const value = numeric(item.budget);
    return value === null ? '—' : `${formatNumber(value, locale)} ${item.currency}`;
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-sand-900">{dict.workspace.tabs.campaigns}</h2>

        <CampaignCreateControl locale={locale} orgId={orgId} />

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
              {CAMPAIGN_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {dict.campaigns.statuses[value]}
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
          <EmptyState>{labels.none}</EmptyState>
        ) : (
          <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white px-5">
            {items.map((item) => (
              <li key={item.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-sand-900">{item.name}</p>
                    <p className="text-sm text-sand-500">
                      {labels.startLabel}: {formatDate(item.startDate, locale)} · {labels.endLabel}:{' '}
                      {formatDate(item.endDate, locale)}
                    </p>
                    <p className="text-sm text-sand-500">
                      {dict.campaigns.volunteersTarget}: {item.volunteerTarget ?? '—'} ·{' '}
                      {dict.campaigns.hoursTarget}: {hourTarget(item)} ·{' '}
                      {dict.campaigns.beneficiariesTarget}: {item.beneficiaryTarget ?? '—'} ·{' '}
                      {labels.budgetLabel}: {budget(item)}
                    </p>
                    <p className="text-sm text-sand-500">
                      {dict.campaigns.participants}: {item._count.participants} ·{' '}
                      {dict.campaigns.relatedOpportunities}: {item._count.opportunities}
                    </p>
                  </div>
                  <StatusBadge
                    data-testid="campaign-status"
                    className="shrink-0"
                    status={item.status}
                    label={dict.campaigns.statuses[item.status] ?? item.status}
                  />
                </div>
                <CampaignRowActions
                  locale={locale}
                  orgId={orgId}
                  row={{
                    id: item.id,
                    name: item.name,
                    description: item.description,
                    goal: item.goal,
                    startDate: isoDate(item.startDate),
                    endDate: isoDate(item.endDate),
                    status: item.status,
                    volunteerTarget: item.volunteerTarget,
                    hourTarget: numeric(item.hourTarget),
                    beneficiaryTarget: item.beneficiaryTarget,
                    budget: numeric(item.budget),
                    currency: item.currency,
                  }}
                />
                <CampaignParticipants locale={locale} orgId={orgId} campaignId={item.id} />
                <CampaignContributions locale={locale} orgId={orgId} campaignId={item.id} />
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
