import { notFound } from 'next/navigation';
import { isAppError, type CampaignStatus, type LocaleCode } from '@bladna/types';
import { Card, EmptyState } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { StatusBadge } from '@/ui/status';
import { publicList as listCampaigns } from '@/server/modules/campaigns';
import { invoke } from '@/server/ssr';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;
/** Statuses the public surface can ever receive from the API. */
const PUBLIC_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED'] as const;

interface CampaignListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  goal: string | null;
  startDate: string;
  endDate: string | null;
  status: CampaignStatus;
  volunteerTarget: number | null;
  hourTarget: number | null;
  beneficiaryTarget: number | null;
  budget: unknown;
  currency: string;
  coverImage: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    verificationStatus: string;
    trustLevel: string;
  };
  _count: { participants: number; opportunities: number };
}

interface CampaignsResult {
  items: CampaignListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface Filters {
  q: string;
  status: string;
}

/** Preserve the active filters when moving between pages. */
function pageHref(locale: LocaleCode, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/campaigns${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.campaigns.title, description: dict.campaigns.subtitle };
}

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const q = (sp.q ?? '').slice(0, 120);
  const status = (PUBLIC_STATUSES as readonly string[]).includes(sp.status ?? '')
    ? (sp.status as string)
    : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const filters: Filters = { q, status };

  let result: CampaignsResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    result = await invoke<CampaignsResult>(listCampaigns, {
      path: '/campaigns',
      locale,
      query: { q: q || undefined, status: status || undefined, page, limit: PAGE_SIZE },
    });
  } catch (error) {
    if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
  }

  const { items, meta } = result;

  return (
    <>
      <PageMasthead title={dict.campaigns.title} subtitle={dict.campaigns.subtitle} />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10">
        {/* Filters — plain GET form, works without JS */}
        <form
          method="get"
          className="mt-6 flex flex-wrap items-end gap-3"
          action={`/${locale}/campaigns`}
        >
          <div className="min-w-56 flex-1">
            <label htmlFor="q" className="block text-sm font-medium text-sand-700">
              {dict.common.search}
            </label>
            <input
              id="q"
              name="q"
              defaultValue={q}
              maxLength={120}
              className="mt-1 w-full h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 placeholder:text-sand-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder={dict.common.search}
            />
          </div>
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
              {PUBLIC_STATUSES.map((value) => (
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

        {/* Results */}
        {items.length === 0 ? (
          <EmptyState className="mt-12">{dict.campaigns.empty}</EmptyState>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <Card as="li" key={item.id} className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <StatusBadge
                    status={item.status}
                    label={dict.campaigns.statuses[item.status] ?? item.status}
                  />
                  {item.organization.verificationStatus === 'VERIFIED' ? (
                    <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                      {dict.common.verified}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-base font-semibold leading-snug text-sand-900">
                  {item.name}
                </h2>
                <p className="mt-1 text-sm text-sand-500">{item.organization.name}</p>
                {item.description ? (
                  <p className="mt-2 line-clamp-3 text-sm text-sand-600">{item.description}</p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-sand-100 pt-3 text-xs text-sand-500">
                  <span>
                    {dict.common.startDate}: {formatDate(item.startDate, locale)}
                  </span>
                  {item.endDate ? (
                    <span>
                      {dict.common.endDate}: {formatDate(item.endDate, locale)}
                    </span>
                  ) : null}
                  <span>
                    {dict.campaigns.participants}: {item._count.participants}
                  </span>
                  {item.volunteerTarget !== null ? (
                    <span>
                      {dict.campaigns.volunteersTarget}: {item.volunteerTarget}
                    </span>
                  ) : null}
                  {item.hourTarget !== null ? (
                    <span>
                      {dict.campaigns.hoursTarget}: {item.hourTarget}
                    </span>
                  ) : null}
                  {item.beneficiaryTarget !== null ? (
                    <span>
                      {dict.campaigns.beneficiariesTarget}: {item.beneficiaryTarget}
                    </span>
                  ) : null}
                </div>
              </Card>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 ? (
          <nav
            className="mt-10 flex items-center justify-center gap-4 text-sm"
            aria-label={dict.common.page}
          >
            {meta.page > 1 ? (
              <a
                href={pageHref(locale, meta.page - 1, filters)}
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
                href={pageHref(locale, meta.page + 1, filters)}
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
    </>
  );
}
