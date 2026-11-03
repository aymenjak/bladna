import { notFound } from 'next/navigation';
import { Badge, EmptyState } from '@bladna/ui';
import { isAppError } from '@bladna/types';
import { getDictionary, isLocale } from '@/ui/i18n';
import { internationalRoutes } from '@/server/modules/international';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import type { InternationalProviderResult } from '@/ui/international/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/** Look up a handler from the international route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  const route = internationalRoutes.find((r) => r.method === method && r.path === path);
  return route?.handler ?? null;
}

/** Preserve the active search when moving between pages. */
function pageHref(locale: string, page: number, q: string): string {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (page > 1) params.set('page', String(page));
  const qs = params.toString();
  return `/${locale}/international/providers${qs ? `?${qs}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.international.providersTitle, description: dict.international.subtitle };
}

export default async function InternationalProvidersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const q = (sp.q ?? '').slice(0, 120);
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  let result: InternationalProviderResult = {
    items: [],
    meta: { page, limit: PAGE_SIZE, total: 0, totalPages: 0 },
  };
  const handler = handlerOf('GET', '/international/providers');
  if (handler) {
    try {
      result = await invoke<InternationalProviderResult>(handler, {
        path: '/international/providers',
        locale,
        query: { q: q || undefined, page, limit: PAGE_SIZE },
      });
    } catch (error) {
      if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
    }
  }

  const { items, meta } = result;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-3xl font-bold text-sand-900">{dict.international.providersTitle}</h1>

      {/* Search — plain GET form, works without JS */}
      <form
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3"
        action={`/${locale}/international/providers`}
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
        <button
          type="submit"
          className="rounded-lg border border-sand-200 bg-white inline-flex min-h-11 items-center px-4 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900"
        >
          {dict.common.search}
        </button>
      </form>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState>{dict.international.providersEmpty}</EmptyState>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-sand-100 rounded-xl border border-sand-200 bg-white">
          {items.map((row) => (
            <li
              key={row.provider}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
            >
              <span className="font-medium text-sand-900">{row.provider}</span>
              <Badge tone="info">
                {row.opportunityCount} {dict.international.countryOpps}
              </Badge>
            </li>
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
              href={pageHref(locale, meta.page - 1, q)}
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
              href={pageHref(locale, meta.page + 1, q)}
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
