import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError, type CampaignStatus, type LocaleCode } from '@bladna/types';
import { Card, EmptyState } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { StatusBadge } from '@/ui/status';
import { publicList as listCampaigns } from '@/server/modules/campaigns';
import { invoke } from '@/server/ssr';
import { PageMasthead } from '@/ui/components/page-masthead';
import { ProgressBar, campaignTiming } from '@/ui/components/campaign-meta';
import {
  ArrowRightIcon,
  CalendarIcon,
  CompassIcon,
  HandshakeIcon,
  HeartIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@/ui/components/icons';

const EXPLAINER_ICONS = [ShieldCheckIcon, UsersIcon, HeartIcon] as const;

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
        {/* "What is a campaign?" — three illustrated cards so a first-time
            visitor understands the page before reading any campaign. */}
        <section aria-labelledby="campaigns-explainer" className="mt-4">
          <h2 id="campaigns-explainer" className="text-lg font-bold text-sand-900">
            {dict.campaigns.explainerTitle}
          </h2>
          <ol className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {dict.campaigns.explainerSteps.map((step, i) => {
              const Icon = EXPLAINER_ICONS[i] ?? HandshakeIcon;
              return (
                <li
                  key={step.title}
                  className="flex gap-4 rounded-card border border-brand-100 bg-brand-50/60 p-4"
                >
                  <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-brand-700 text-white">
                    <Icon className="size-6" />
                    <span className="absolute -top-1 -end-1 grid size-5 place-items-center rounded-full bg-clay-500 text-[11px] font-bold">
                      {formatNumber(i + 1, locale)}
                    </span>
                  </span>
                  <span>
                    <span className="block font-semibold text-sand-900">{step.title}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-sand-600">
                      {step.body}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

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

        {/* Results — each card is one link to the campaign page: cover,
            timing, organizer, volunteers progress and the initiatives count. */}
        {items.length === 0 ? (
          <EmptyState className="mt-12">{dict.campaigns.empty}</EmptyState>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const timing = campaignTiming(item.startDate, item.endDate, dict.campaigns, locale);
              const href = `/${locale}/campaigns/${item.id}`;
              return (
                <Card
                  as="li"
                  key={item.id}
                  className="group relative flex h-full flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
                >
                  <div className="relative aspect-[16/9] overflow-hidden bg-sand-100">
                    {item.coverImage ? (
                      <img
                        src={item.coverImage}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover transition duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="grid size-full place-items-center bg-gradient-to-br from-brand-700 to-brand-900">
                        <HeartIcon className="size-10 text-brand-200" />
                      </div>
                    )}
                    <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                      <StatusBadge
                        status={item.status}
                        label={dict.campaigns.statuses[item.status] ?? item.status}
                      />
                      {timing.label ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm ${
                            timing.tone === 'ended'
                              ? 'bg-sand-900/80 text-white'
                              : 'bg-white/95 text-brand-800'
                          }`}
                        >
                          {timing.label}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col p-5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-sand-500">
                      {item.organization.verificationStatus === 'VERIFIED' ? (
                        <ShieldCheckIcon className="size-4 text-brand-600" />
                      ) : null}
                      <span className="truncate">
                        {dict.campaigns.organizedBy} {item.organization.name}
                      </span>
                    </p>
                    <h2
                      dir="auto"
                      className="mt-2 text-start text-lg font-bold leading-snug text-sand-900"
                    >
                      <Link
                        href={href}
                        className="after:absolute after:inset-0 hover:text-brand-800 focus-visible:outline-none"
                      >
                        {item.name}
                      </Link>
                    </h2>
                    {item.description ? (
                      <p
                        dir="auto"
                        className="mt-2 line-clamp-2 text-start text-sm leading-relaxed text-sand-600"
                      >
                        {item.description}
                      </p>
                    ) : null}

                    <div className="mt-4">
                      <ProgressBar
                        label={dict.campaigns.volunteersProgress}
                        value={item._count.participants}
                        target={item.volunteerTarget}
                        locale={locale}
                        copy={dict.campaigns}
                      />
                    </div>

                    <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-sand-100 pt-3 text-xs text-sand-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarIcon className="size-3.5" />
                        {formatDate(item.startDate, locale)}
                        {item.endDate ? ` – ${formatDate(item.endDate, locale)}` : ''}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CompassIcon className="size-3.5" />
                        {formatNumber(item._count.opportunities, locale)}{' '}
                        {dict.campaigns.initiatives}
                      </span>
                      <span className="ms-auto inline-flex items-center gap-1 font-semibold text-brand-700">
                        {dict.campaigns.viewDetails}
                        <ArrowRightIcon className="size-3.5 rtl:rotate-180" />
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
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
