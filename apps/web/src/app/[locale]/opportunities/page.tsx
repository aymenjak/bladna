import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { EmptyState, Badge, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale, LOCALES, type LocaleCode } from '@/ui/i18n';
import { formatNumber } from '@/ui/format';
import {
  categoryNameFor,
  nameFor,
  typeLabelFor,
  type OpportunityListItem,
  type PlaceRef,
} from '@/ui/opportunity';
import { discover } from '@/server/modules/opportunities';
import { listCategories } from '@/server/modules/taxonomies';
import { listWilayas } from '@/server/modules/locations';
import { cmsRoutes } from '@/server/modules/cms';
import { invoke } from '@/server/ssr';
import type { Handler } from '@/server/http';
import { QuickChips } from '@/ui/components/quick-chips';
import { FilterTray } from '@/ui/components/filter-tray';
import { InitiativeCard } from '@/ui/components/initiative-card';
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from '@/ui/components/icons';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

const TYPES = ['LOCAL', 'NATIONAL', 'ONLINE', 'INTERNATIONAL', 'EVENT', 'CAMPAIGN'] as const;
const SORTS = ['recent', 'deadline', 'soonest', 'popular'] as const;
const NEEDS = ['VOLUNTEERS', 'ANY', 'FINANCIAL', 'EQUIPMENT', 'MATERIAL', 'SERVICE'] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_SIZE = 12;

const SELECT_CLS =
  'mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

interface DiscoverResult {
  items: OpportunityListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface CategoriesResult {
  items: NonNullable<OpportunityListItem['category']>[];
}

interface WilayasResult {
  items: PlaceRef[];
}

/** Only well-formed ids are forwarded; garbage is ignored (never a crash). */
function uuidParam(value: unknown): string {
  return typeof value === 'string' && UUID_RE.test(value) ? value : '';
}

interface FilterState {
  q: string;
  type: string;
  sort: string;
  organizationId: string;
  campaignId: string;
  wilayaId: string;
  categoryId: string;
  needs: string;
  verifiedOnly: boolean;
  thisWeek: boolean;
}

/**
 * Build the list URL from the active filters. `omit` drops one filter (the
 * active-filter chips remove themselves with it), `page` preserves paging.
 */
function searchHref(
  locale: LocaleCode,
  filters: FilterState,
  options?: { omit?: keyof FilterState; page?: number },
): string {
  const params = new URLSearchParams();
  const keep = (key: keyof FilterState): boolean => key !== options?.omit;
  if (keep('q') && filters.q) params.set('q', filters.q);
  if (keep('type') && filters.type) params.set('type', filters.type);
  if (keep('sort') && filters.sort !== 'recent') params.set('sort', filters.sort);
  if (keep('organizationId') && filters.organizationId)
    params.set('organizationId', filters.organizationId);
  if (keep('campaignId') && filters.campaignId) params.set('campaignId', filters.campaignId);
  if (keep('wilayaId') && filters.wilayaId) params.set('wilayaId', filters.wilayaId);
  if (keep('categoryId') && filters.categoryId) params.set('categoryId', filters.categoryId);
  if (keep('needs') && filters.needs) params.set('needs', filters.needs);
  if (keep('verifiedOnly') && filters.verifiedOnly) params.set('verifiedOnly', 'true');
  if (keep('thisWeek') && filters.thisWeek) params.set('thisWeek', '1');
  const page = options?.page ?? 1;
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/opportunities${qs ? `?${qs}` : ''}`;
}

/** Preserve the active filters when moving between pages. */
function pageHref(locale: LocaleCode, page: number, filters: FilterState): string {
  return searchHref(locale, filters, { page });
}

// ── Featured placements (P12): the console's DISCOVER_FEATURED section ──────

interface FeaturedTarget {
  slug: string;
  titleAr?: string | null;
  titleFr?: string | null;
  titleEn?: string | null;
  name?: string | null;
}

interface FeaturedItem {
  id: string;
  section: string;
  targetType: 'OPPORTUNITY' | 'ORGANIZATION' | 'CAMPAIGN';
  label: string | null;
  target: FeaturedTarget | null;
}

interface FeaturedResult {
  items: FeaturedItem[];
}

/** Look up a CMS handler from the module route table so SSR can call it in-process. */
function cmsHandlerOf(method: string, path: string): Handler | null {
  return cmsRoutes.find((route) => route.method === method && route.path === path)?.handler ?? null;
}

/** DISCOVER_FEATURED placements — a failing CMS read degrades to no strip. */
async function fetchDiscoverFeatured(locale: string): Promise<FeaturedItem[]> {
  const handler = cmsHandlerOf('GET', '/featured');
  if (!handler) return [];
  try {
    const result = await invoke<FeaturedResult>(handler, {
      path: '/featured',
      locale,
      query: { page: 1, limit: 6 },
    });
    return result.items.filter((item) => item.section === 'DISCOVER_FEATURED' && item.target);
  } catch {
    return [];
  }
}

function featuredTitleOf(locale: LocaleCode, item: FeaturedItem): string {
  const target = item.target;
  if (!target) return '';
  if (item.targetType !== 'OPPORTUNITY') return target.name ?? '';
  if (locale === 'ar') return target.titleAr ?? '';
  if (locale === 'fr') return target.titleFr ?? '';
  return target.titleEn ?? '';
}

function featuredHrefOf(locale: LocaleCode, item: FeaturedItem): string {
  const slug = item.target?.slug ?? '';
  if (item.targetType === 'ORGANIZATION') return `/${locale}/organizations/${slug}`;
  if (item.targetType === 'CAMPAIGN') return `/${locale}/campaigns/${slug}`;
  return `/${locale}/opportunities/${slug}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.nav.opportunities, description: dict.opportunity.listSubtitle };
}

export default async function OpportunitiesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    type?: string;
    sort?: string;
    page?: string;
    organizationId?: string;
    campaignId?: string;
    wilayaId?: string;
    categoryId?: string;
    needs?: string;
    verifiedOnly?: string;
    thisWeek?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const q = (sp.q ?? '').slice(0, 120);
  const type = (TYPES as readonly string[]).includes(sp.type ?? '') ? (sp.type as string) : '';
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? '')
    ? (sp.sort as string)
    : 'recent';
  const needs = (NEEDS as readonly string[]).includes(sp.needs ?? '') ? (sp.needs as string) : '';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  // Organization/campaign scoping (teasers) and geography/cause filters — only
  // well-formed ids are forwarded; garbage is ignored rather than confusing.
  const organizationId = uuidParam(sp.organizationId);
  const campaignId = uuidParam(sp.campaignId);
  const wilayaId = uuidParam(sp.wilayaId);
  const categoryId = uuidParam(sp.categoryId);
  const verifiedOnly = sp.verifiedOnly === 'true';
  const thisWeek = sp.thisWeek === '1' || sp.thisWeek === 'true';

  const filters: FilterState = {
    q,
    type,
    sort,
    organizationId,
    campaignId,
    wilayaId,
    categoryId,
    needs,
    verifiedOnly,
    thisWeek,
  };

  // “This week” (spec §9 chip) reuses the existing availableFrom/availableTo
  // discover filters: initiatives overlapping [today, today + 7 days].
  const today = new Date();
  const dayIso = (date: Date): string => date.toISOString().slice(0, 10);

  const [discovered, categories, wilayas, featured] = await Promise.all([
    invoke<DiscoverResult>(discover, {
      path: '/opportunities',
      locale,
      query: {
        q: q || undefined,
        type: type || undefined,
        sort,
        organizationId: organizationId || undefined,
        campaignId: campaignId || undefined,
        wilayaId: wilayaId || undefined,
        categoryId: categoryId || undefined,
        needs: needs || undefined,
        verifiedOnly: verifiedOnly ? 'true' : undefined,
        availableFrom: thisWeek ? dayIso(today) : undefined,
        availableTo: thisWeek ? dayIso(new Date(today.getTime() + 7 * 86_400_000)) : undefined,
        page,
        limit: PAGE_SIZE,
      },
    }).catch((error: unknown) => {
      // Invalid filter values (e.g. malformed ids injected in the URL) degrade
      // to an empty result instead of crashing the page; else it propagates.
      if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
      return null;
    }),
    invoke<CategoriesResult>(listCategories, {
      path: '/taxonomies/categories',
      locale,
      query: { page: 1, limit: 50 },
    }),
    invoke<WilayasResult>(listWilayas, {
      path: '/locations/wilayas',
      locale,
      query: { page: 1, limit: 100 },
    }),
    fetchDiscoverFeatured(locale),
  ]);

  const result: DiscoverResult = discovered ?? {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  const { items, meta } = result;
  const hasFilters = Boolean(
    q ||
    type ||
    sort !== 'recent' ||
    organizationId ||
    campaignId ||
    wilayaId ||
    categoryId ||
    needs ||
    verifiedOnly ||
    thisWeek,
  );

  const needsOptions: Array<{ value: string; label: string }> = [
    { value: '', label: dict.common.all },
    { value: 'VOLUNTEERS', label: dict.opportunity.filterNeedsVolunteers },
    { value: 'ANY', label: dict.opportunity.filterNeedsSupport },
    ...(['FINANCIAL', 'EQUIPMENT', 'MATERIAL', 'SERVICE'] as const).map((kind) => ({
      value: kind,
      label: dict.opportunity.needKinds[kind],
    })),
  ];

  // Active-filter chips (P3): the filter state stays visible beside the
  // results even when the tray above collapses on mobile — every chip is a
  // link that drops exactly its own filter (scopes like organizationId or
  // campaignId survive, since they are not chipped).
  const wilayaName = wilayas.items.find((item) => item.id === wilayaId);
  const categoryName = categories.items.find((item) => item.id === categoryId);
  const activeChips: Array<{ key: keyof FilterState; label: string }> = [];
  if (q) activeChips.push({ key: 'q', label: `${dict.common.search}: ${q}` });
  if (type) {
    activeChips.push({
      key: 'type',
      label: `${dict.common.type}: ${typeLabelFor(type, dict)}`,
    });
  }
  if (needs) {
    activeChips.push({
      key: 'needs',
      label: needsOptions.find((option) => option.value === needs)?.label ?? needs,
    });
  }
  if (wilayaId) {
    const name = wilayaName ? (nameFor(wilayaName, locale) ?? wilayaId) : wilayaId;
    activeChips.push({ key: 'wilayaId', label: `${dict.opportunity.filterWilaya}: ${name}` });
  }
  if (categoryId) {
    const name = categoryName ? (categoryNameFor(categoryName, locale) ?? categoryId) : categoryId;
    activeChips.push({ key: 'categoryId', label: `${dict.opportunity.filterCategory}: ${name}` });
  }
  if (sort !== 'recent') {
    activeChips.push({
      key: 'sort',
      // `sort` was validated against SORTS at parse time (see above).
      label: `${dict.opportunity.sortLabel}: ${dict.opportunity.sorts[sort as (typeof SORTS)[number]]}`,
    });
  }
  if (verifiedOnly) {
    activeChips.push({ key: 'verifiedOnly', label: dict.opportunity.filterVerified });
  }
  if (thisWeek) activeChips.push({ key: 'thisWeek', label: dict.opportunity.filterThisWeek });

  return (
    <>
      <PageMasthead
        eyebrow={dict.opportunity.listEyebrow}
        title={dict.nav.opportunities}
        subtitle={dict.opportunity.listSubtitle}
      />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10">
        {/* Featured placements (P12) — the console's DISCOVER_FEATURED section
          as a compact editorial row above the controls (dead targets are
          already dropped by the module). */}
        {featured.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2" data-testid="featured-strip">
            {featured.map((item) => (
              <li key={item.id}>
                <Link
                  href={featuredHrefOf(locale, item)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-200 bg-brand-50 ps-3 pe-4 text-sm font-medium text-brand-900 transition hover:border-brand-300 hover:bg-brand-100"
                >
                  <Badge tone="success">{dict.featured.kinds[item.targetType]}</Badge>
                  {featuredTitleOf(locale, item)}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Quick discovery chips (spec §9) */}
        <div className="mt-5">
          <QuickChips
            locale={locale}
            active={{
              needs: needs || undefined,
              wilayaId: wilayaId || undefined,
              thisWeek,
            }}
          />
        </div>

        {/* Filters — plain GET form (works without JS) inside a progressive
          tray: full inline on desktop, collapsed to a trigger above the
          results below lg (P3 / NN-g mobile filter pattern). */}
        <FilterTray locale={locale} activeCount={activeChips.length}>
          <div className="rounded-xl border border-sand-200 bg-white p-4">
            <form
              method="get"
              className="flex flex-wrap items-end gap-3"
              action={`/${locale}/opportunities`}
            >
              {organizationId ? (
                <input type="hidden" name="organizationId" value={organizationId} />
              ) : null}
              {campaignId ? <input type="hidden" name="campaignId" value={campaignId} /> : null}
              {/* “This week” is chip-driven — preserve it across filter submits. */}
              {thisWeek ? <input type="hidden" name="thisWeek" value="1" /> : null}
              <div className="min-w-56 flex-1">
                <label htmlFor="q" className="block text-sm font-medium text-sand-700">
                  {dict.common.search}
                </label>
                <input
                  id="q"
                  name="q"
                  defaultValue={q}
                  maxLength={120}
                  className={SELECT_CLS}
                  placeholder={dict.common.search}
                />
              </div>
              <div>
                <label htmlFor="needs" className="block text-sm font-medium text-sand-700">
                  {dict.opportunity.filterNeeds}
                </label>
                <select id="needs" name="needs" defaultValue={needs} className={SELECT_CLS}>
                  {needsOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="categoryId" className="block text-sm font-medium text-sand-700">
                  {dict.opportunity.filterCategory}
                </label>
                <select
                  id="categoryId"
                  name="categoryId"
                  defaultValue={categoryId}
                  className={SELECT_CLS}
                >
                  <option value="">{dict.common.all}</option>
                  {categories.items.map((category) => (
                    <option key={category.id} value={category.id}>
                      {categoryNameFor(category, locale)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="wilayaId" className="block text-sm font-medium text-sand-700">
                  {dict.opportunity.filterWilaya}
                </label>
                <select
                  id="wilayaId"
                  name="wilayaId"
                  defaultValue={wilayaId}
                  className={SELECT_CLS}
                >
                  <option value="">{dict.common.all}</option>
                  {wilayas.items.map((wilaya) => (
                    <option key={wilaya.id} value={wilaya.id}>
                      {nameFor(wilaya, locale) ?? wilaya.id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="type" className="block text-sm font-medium text-sand-700">
                  {dict.common.type}
                </label>
                <select id="type" name="type" defaultValue={type} className={SELECT_CLS}>
                  <option value="">{dict.common.all}</option>
                  {TYPES.map((value) => (
                    <option key={value} value={value}>
                      {typeLabelFor(value, dict)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="sort" className="block text-sm font-medium text-sand-700">
                  {dict.opportunity.sortLabel}
                </label>
                <select id="sort" name="sort" defaultValue={sort} className={SELECT_CLS}>
                  {SORTS.map((value) => (
                    <option key={value} value={value}>
                      {dict.opportunity.sorts[value]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex min-h-9 items-center gap-2 pb-1 text-sm font-medium text-sand-700">
                <input
                  type="checkbox"
                  name="verifiedOnly"
                  value="true"
                  defaultChecked={verifiedOnly}
                  className="size-4 rounded border-sand-300 text-brand-600 focus:ring-brand-500"
                />
                {dict.opportunity.filterVerified}
              </label>
              <button
                type="submit"
                className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
              >
                {dict.common.search}
              </button>
              {hasFilters ? (
                <Link
                  href={`/${locale}/opportunities`}
                  className="px-2 py-2 text-sm font-medium text-brand-700 hover:text-brand-800"
                >
                  {dict.opportunity.clearFilters}
                </Link>
              ) : null}
            </form>
          </div>
        </FilterTray>

        {/* Active-filter chips — state visible with the results even while the
          tray above is collapsed; each chip removes exactly its filter. */}
        {activeChips.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2" data-testid="filter-chips">
            {activeChips.map((chip) => (
              <li key={chip.key}>
                <Link
                  href={searchHref(locale, filters, { omit: chip.key })}
                  aria-label={`${dict.opportunity.removeFilter}: ${chip.label}`}
                  className="min-h-11 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm font-medium text-brand-800 transition hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
                >
                  {chip.label}
                  <span aria-hidden className="text-base leading-none">
                    ×
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Results — the count comes from the same query that fills the grid
          (live, honest); empty lists explain why and offer the next step. */}
        <p aria-live="polite" className="mt-6 text-sm font-medium text-sand-600">
          {dict.opportunity.resultsCount.replace('{count}', formatNumber(meta.total, locale))}
        </p>
        {items.length === 0 ? (
          <EmptyState className="mt-4">
            <SearchIcon className="mx-auto size-8 text-sand-400" />
            <p className="mt-2 font-semibold text-sand-700">{dict.opportunity.noResults}</p>
            <p className="mt-1">{dict.opportunity.noResultsHint}</p>
            {hasFilters ? (
              <Link
                href={`/${locale}/opportunities`}
                className={buttonClasses({ variant: 'outline', className: 'mt-4' })}
              >
                {dict.opportunity.clearFilters}
              </Link>
            ) : null}
          </EmptyState>
        ) : (
          <ul className="rise mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <InitiativeCard
                key={item.id}
                locale={locale}
                dict={dict}
                item={item}
                titleAs="h2"
                showApplicants
              />
            ))}
          </ul>
        )}

        {/* Pagination — directional chevrons mirror automatically in RTL. */}
        {meta.totalPages > 1 ? (
          <nav
            className="mt-10 flex items-center justify-center gap-4 text-sm"
            aria-label={dict.common.page}
          >
            {meta.page > 1 ? (
              <Link
                href={pageHref(locale, meta.page - 1, filters)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-4 font-medium text-sand-700 hover:bg-sand-100"
              >
                <ChevronLeftIcon className="size-4 rtl:rotate-180" />
                {dict.common.previous}
              </Link>
            ) : (
              <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sand-100 px-4 text-sand-400">
                <ChevronLeftIcon className="size-4 rtl:rotate-180" />
                {dict.common.previous}
              </span>
            )}
            <span className="tabular-nums text-sand-600">
              {dict.common.page} {meta.page} {dict.common.of} {meta.totalPages} · {meta.total}
            </span>
            {meta.page < meta.totalPages ? (
              <Link
                href={pageHref(locale, meta.page + 1, filters)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sand-200 bg-white px-4 font-medium text-sand-700 hover:bg-sand-100"
              >
                {dict.common.next}
                <ChevronRightIcon className="size-4 rtl:rotate-180" />
              </Link>
            ) : (
              <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-sand-100 px-4 text-sand-400">
                {dict.common.next}
                <ChevronRightIcon className="size-4 rtl:rotate-180" />
              </span>
            )}
          </nav>
        ) : null}
      </div>
    </>
  );
}

void LOCALES;
