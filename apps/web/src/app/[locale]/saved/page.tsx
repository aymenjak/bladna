import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { EmptyState } from '@bladna/ui';
import { getDictionary, isLocale, type LocaleCode } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { categoryNameFor, titleFor, type OpportunityListItem } from '@/ui/opportunity';
import { pageSession } from '@/server/page-session';
import { invoke } from '@/server/ssr';
import { savedRoutes } from '@/server/modules/saved';
import type { Handler } from '@/server/http';
import { SaveButton } from '@/ui/components/save-button';
import { PageMasthead } from '@/ui/components/page-masthead';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 12;

/** Saved rows keep initiatives that later left PUBLISHED (see saved.ts). */
type SavedItem = OpportunityListItem & { savedAt: string | Date };

interface SavedResult {
  items: SavedItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

function handlerOf(method: string, path: string): Handler | null {
  return savedRoutes.find((r) => r.method === method && r.path === path)?.handler ?? null;
}

function pageHref(locale: LocaleCode, page: number): string {
  return page > 1 ? `/${locale}/saved?page=${page}` : `/${locale}/saved`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.saved.title, robots: { index: false, follow: false } };
}

export default async function SavedPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const sessionPath = `/${locale}/saved`;
  await pageSession(locale, sessionPath);

  let result: SavedResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  const handler = handlerOf('GET', '/me/saved-opportunities');
  if (handler) {
    try {
      result = await invoke<SavedResult>(handler, {
        path: '/me/saved-opportunities',
        locale,
        query: { page, limit: PAGE_SIZE },
      });
    } catch (error) {
      // The session above guarantees auth; BUSINESS_RULE_ERROR means no
      // volunteer profile yet (org/admin session) → the empty state below.
      // Anything else is a bug and must fail the page.
      if (!isAppError(error) || error.code !== 'BUSINESS_RULE_ERROR') throw error;
    }
  }

  const { items, meta } = result;

  return (
    <>
      <PageMasthead
        title={dict.saved.title}
        subtitle={dict.saved.subtitle}
        inner="mx-auto max-w-4xl px-4 py-10"
      />
      <div className="mx-auto max-w-4xl space-y-6 px-4 pt-6 pb-10">
        {items.length === 0 ? (
          <EmptyState>
            {dict.saved.empty} {dict.saved.emptyBody}{' '}
            <Link
              href={`/${locale}/opportunities`}
              className="font-semibold text-brand-700 hover:text-brand-800"
            >
              {dict.nav.opportunities} →
            </Link>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white px-5">
            {items.map((item) => {
              const open = item.status === 'PUBLISHED';
              const category = categoryNameFor(item.category, locale);
              return (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                  <div className="min-w-0">
                    {open ? (
                      <Link
                        href={`/${locale}/opportunities/${item.slug}`}
                        className="block truncate font-medium text-sand-900 hover:text-brand-700"
                      >
                        {titleFor(item, locale)}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium text-sand-900">
                        {titleFor(item, locale)}
                      </span>
                    )}
                    <p className="text-sm text-sand-500">
                      {item.organization.name}
                      {category ? ` · ${category}` : ''}
                    </p>
                    {open && item.applicationDeadline ? (
                      <p className="mt-1 text-xs text-sand-500">
                        {dict.common.deadline}: {formatDate(item.applicationDeadline, locale)} ·{' '}
                        {dict.common.applicants}: {item.applicationCount}
                      </p>
                    ) : null}
                    {!open ? (
                      <p className="mt-1 text-xs text-sand-600">{dict.saved.unavailable}</p>
                    ) : null}
                  </div>
                  <SaveButton
                    opportunityId={item.id}
                    locale={locale}
                    initialSaved
                    className="shrink-0"
                  />
                </li>
              );
            })}
          </ul>
        )}

        {/* Pagination */}
        {meta.totalPages > 1 ? (
          <nav
            className="flex items-center justify-center gap-4 text-sm"
            aria-label={dict.common.page}
          >
            {meta.page > 1 ? (
              <Link
                href={pageHref(locale, meta.page - 1)}
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
                href={pageHref(locale, meta.page + 1)}
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
    </>
  );
}
