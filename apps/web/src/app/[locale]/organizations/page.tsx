import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ORGANIZATION_TYPES,
  isAppError,
  type LocaleCode,
  type OrganizationType,
} from '@bladna/types';
import { Avatar, Card, EmptyState } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { nameFor, type PlaceRef } from '@/ui/opportunity';
import { directory } from '@/server/modules/organizations';
import { invoke } from '@/server/ssr';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

interface OrgListItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  organizationType: OrganizationType;
  verificationStatus: string;
  trustLevel: string;
  verifiedAt: string | null;
  createdAt: string;
  wilaya: PlaceRef | null;
  city: PlaceRef | null;
  _count: { members: number; opportunities: number };
}

interface DirectoryResult {
  items: OrgListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface Filters {
  q: string;
  type: string;
  verifiedOnly: boolean;
}

/** Preserve the active filters when moving between pages. */
function pageHref(locale: LocaleCode, page: number, filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  if (filters.verifiedOnly) params.set('verifiedOnly', 'true');
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/organizations${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.organizations.title, description: dict.organizations.subtitle };
}

export default async function OrganizationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; type?: string; verifiedOnly?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const q = (sp.q ?? '').slice(0, 120);
  const type = (ORGANIZATION_TYPES as readonly string[]).includes(sp.type ?? '')
    ? (sp.type as string)
    : '';
  const verifiedOnly = sp.verifiedOnly === 'true';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const filters: Filters = { q, type, verifiedOnly };

  let result: DirectoryResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  try {
    result = await invoke<DirectoryResult>(directory, {
      path: '/organizations',
      locale,
      query: {
        q: q || undefined,
        organizationType: type || undefined,
        verifiedOnly: verifiedOnly ? 'true' : undefined,
        page,
        limit: PAGE_SIZE,
      },
    });
  } catch (error) {
    // Malformed filter values degrade to an empty result; anything else propagates.
    if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
  }

  const { items, meta } = result;

  return (
    <>
      <PageMasthead title={dict.organizations.title} subtitle={dict.organizations.subtitle} />
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-10">
        {/* Filters — plain GET form, works without JS */}
        <form
          method="get"
          className="mt-6 flex flex-wrap items-end gap-3"
          action={`/${locale}/organizations`}
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
            <label htmlFor="type" className="block text-sm font-medium text-sand-700">
              {dict.common.type}
            </label>
            <select
              id="type"
              name="type"
              defaultValue={type}
              className="mt-1 h-10 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm text-sand-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              <option value="">{dict.common.all}</option>
              {ORGANIZATION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {dict.organizations.types[value]}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-sand-700">
            <input
              type="checkbox"
              name="verifiedOnly"
              value="true"
              defaultChecked={verifiedOnly}
              className="size-4 rounded border-sand-300 text-brand-700 focus:ring-brand-600"
            />
            {dict.common.verified}
          </label>
          <button
            type="submit"
            className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
          >
            {dict.common.search}
          </button>
        </form>

        {/* Results */}
        {items.length === 0 ? (
          <EmptyState className="mt-12">{dict.organizations.empty}</EmptyState>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const location = [nameFor(item.city, locale), nameFor(item.wilaya, locale)]
                .filter(
                  (value, index, all): value is string =>
                    Boolean(value) && all.indexOf(value) === index,
                )
                .join(' · ');
              const verified = item.verificationStatus === 'VERIFIED';
              return (
                <Card
                  as="li"
                  key={item.id}
                  className="flex h-full flex-col p-5 transition hover:border-brand-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700">
                      {dict.organizations.types[item.organizationType] ?? item.organizationType}
                    </span>
                    {verified ? (
                      <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
                        {dict.common.verified}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Avatar aria-hidden src={item.logo ?? undefined}>
                      {item.name.slice(0, 1)}
                    </Avatar>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold leading-snug text-sand-900">
                        <Link
                          href={`/${locale}/organizations/${item.slug}`}
                          className="hover:text-brand-800"
                        >
                          {item.name}
                        </Link>
                      </h2>
                      {location ? (
                        <p className="truncate text-sm text-sand-500">{location}</p>
                      ) : null}
                    </div>
                  </div>
                  {item.description ? (
                    <p className="mt-3 line-clamp-3 text-sm text-sand-600">{item.description}</p>
                  ) : null}
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-sand-100 pt-3 text-xs text-sand-500">
                    <span>
                      {dict.organizations.members}: {item._count.members}
                    </span>
                    <span>
                      {dict.organizations.opportunities}: {item._count.opportunities}
                    </span>
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
