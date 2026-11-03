import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  isAppError,
  INTERNATIONAL_PROJECT_TYPES,
  type InternationalProjectType,
  type LocaleCode,
} from '@bladna/types';
import { EmptyState } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import {
  publicList as listInternational,
  internationalRoutes,
} from '@/server/modules/international';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { OpportunityCardIntl } from '@/ui/international/opportunity-card-intl';
import {
  isProjectType,
  isUuid,
  recommendationReasonLabel,
  textFor,
  type InternationalCountryOption,
  type InternationalListResult,
  type InternationalRecommendationItem,
} from '@/ui/international/types';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;
const SORTS = ['deadline', 'recent'] as const;
const RECOMMENDATION_LIMIT = 8;

type InternationalResult = InternationalListResult;

interface Filters {
  q: string;
  verifiedOnly: boolean;
  sort: string;
  category: InternationalProjectType | undefined;
  countryId: string | undefined;
}

/** Untrusted searchParams → validated filter values (never sent raw downstream). */
function categoryOf(value: string | undefined): InternationalProjectType | undefined {
  return isProjectType(value) ? value : undefined;
}

function countryIdOf(value: string | undefined): string | undefined {
  return value && isUuid(value) ? value : undefined;
}

/** Look up a handler from the international route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  const route = internationalRoutes.find((r) => r.method === method && r.path === path);
  return route?.handler ?? null;
}

/** Preserve the active filters when moving between pages. */
function pageHref(locale: LocaleCode, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.verifiedOnly) params.set('verifiedOnly', 'true');
  if (filters.sort && filters.sort !== 'deadline') params.set('sort', filters.sort);
  if (filters.category) params.set('category', filters.category);
  if (filters.countryId) params.set('countryId', filters.countryId);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/international${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.international.title, description: dict.international.subtitle };
}

export default async function InternationalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    q?: string;
    verifiedOnly?: string;
    sort?: string;
    category?: string;
    countryId?: string;
    page?: string;
  }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const q = (sp.q ?? '').slice(0, 120);
  const verifiedOnly = sp.verifiedOnly === 'true';
  const sort = (SORTS as readonly string[]).includes(sp.sort ?? '')
    ? (sp.sort as string)
    : 'deadline';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const category = categoryOf(sp.category);
  const countryId = countryIdOf(sp.countryId);
  const filters: Filters = { q, verifiedOnly, sort, category, countryId };

  let result: InternationalResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    result = await invoke<InternationalResult>(listInternational, {
      path: '/international/opportunities',
      locale,
      query: {
        q: q || undefined,
        verifiedOnly: verifiedOnly ? 'true' : undefined,
        sort,
        category,
        countryId,
        page,
        limit: PAGE_SIZE,
      },
    });
  } catch (error) {
    if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
  }

  const { items, meta } = result;

  // Country filter options — only countries with ≥1 open offer. Ancillary, so
  // a missing route or transient failure degrades to "no country select".
  let countries: InternationalCountryOption[] | null = null;
  const countriesHandler = handlerOf('GET', '/international/countries');
  if (countriesHandler) {
    try {
      const data = await invoke<{ items: InternationalCountryOption[] }>(countriesHandler, {
        path: '/international/countries',
        locale,
      });
      countries = data.items;
    } catch {
      countries = null;
    }
  }

  // "Recommended for you" strip — silent for anonymous visitors (UNAUTHORIZED)
  // and whenever the endpoint is unavailable; never blocks the list itself.
  let recommendations: InternationalRecommendationItem[] | null = null;
  const recommendationsHandler = handlerOf('GET', '/international/recommendations');
  if (recommendationsHandler) {
    try {
      const data = await invoke<{ items: InternationalRecommendationItem[] }>(
        recommendationsHandler,
        {
          path: '/international/recommendations',
          locale,
          query: { limit: RECOMMENDATION_LIMIT },
        },
      );
      recommendations = data.items;
    } catch {
      recommendations = null;
    }
  }

  return (
    <>
      <PageMasthead title={dict.international.title} subtitle={dict.international.subtitle} />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10">
        {/* Filters — plain GET form, works without JS */}
        <form
          method="get"
          className="mt-6 flex flex-wrap items-end gap-3"
          action={`/${locale}/international`}
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
            <label htmlFor="sort" className="block text-sm font-medium text-sand-700">
              {dict.opportunity.sortLabel}
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="deadline">{dict.opportunity.sorts.deadline}</option>
              <option value="recent">{dict.opportunity.sorts.recent}</option>
            </select>
          </div>
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-sand-700">
              {dict.international.filtersCategory}
            </label>
            <select
              id="category"
              name="category"
              defaultValue={category ?? ''}
              className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">{dict.international.filterAll}</option>
              {INTERNATIONAL_PROJECT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {dict.international.categories[type]}
                </option>
              ))}
            </select>
          </div>
          {countries ? (
            <div>
              <label htmlFor="countryId" className="block text-sm font-medium text-sand-700">
                {dict.international.filtersCountry}
              </label>
              <select
                id="countryId"
                name="countryId"
                defaultValue={countryId ?? ''}
                className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
              >
                <option value="">{dict.international.filterAll}</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>
                    {textFor(locale, country.nameAr, country.nameFr, country.nameEn) ??
                      country.code}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <label className="flex items-center gap-2 pb-2 text-sm text-sand-700">
            <input
              type="checkbox"
              name="verifiedOnly"
              value="true"
              defaultChecked={verifiedOnly}
              className="size-4 rounded border-sand-300 text-brand-700 focus:ring-brand-600"
            />
            {dict.international.verifiedOnly}
          </label>
          <button
            type="submit"
            className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
          >
            {dict.common.search}
          </button>
        </form>

        {/* Recommended for you — only when the personalized endpoint answered
          (authenticated); silently absent for anonymous visitors. */}
        {recommendations !== null ? (
          <section
            className="mt-8 rounded-xl border border-brand-100 bg-brand-50/60 p-5"
            aria-labelledby="recommended-heading"
          >
            <h2 id="recommended-heading" className="text-lg font-semibold text-brand-900">
              {dict.international.recommendedTitle}
            </h2>
            {recommendations.length === 0 ? (
              <p className="mt-2 text-sm text-sand-600">{dict.international.recommendedEmpty}</p>
            ) : (
              <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {recommendations.map(({ opportunity, reasons }) => {
                  const reasonLabels = reasons
                    .map((reason) => recommendationReasonLabel(dict, reason))
                    .filter((label): label is string => label !== null);
                  return (
                    <li
                      key={opportunity.id}
                      className="flex h-full flex-col rounded-lg border border-sand-200 bg-white p-4"
                    >
                      <Link
                        href={`/${locale}/international/${opportunity.id}`}
                        className="font-medium text-sand-900 hover:text-brand-700"
                      >
                        {titleFor(opportunity, locale) || opportunity.program}
                      </Link>
                      {reasonLabels.length > 0 ? (
                        <p className="mt-1 text-xs text-sand-500">
                          {dict.international.recommendedReason}: {reasonLabels.join(' · ')}
                        </p>
                      ) : null}
                      {opportunity.deadline ? (
                        <p className="mt-auto pt-2 text-xs text-sand-500">
                          {dict.common.deadline}: {formatDate(opportunity.deadline, locale)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {/* Results */}
        {items.length === 0 ? (
          <EmptyState className="mt-12">{dict.international.empty}</EmptyState>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <OpportunityCardIntl key={item.id} locale={locale} item={item} />
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
