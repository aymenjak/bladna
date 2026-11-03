import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, EmptyState } from '@bladna/ui';
import { isAppError } from '@bladna/types';
import { getDictionary, isLocale } from '@/ui/i18n';
import { internationalRoutes } from '@/server/modules/international';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { textFor, type InternationalCountryOption } from '@/ui/international/types';

export const dynamic = 'force-dynamic';

/** Look up a handler from the international route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  const route = internationalRoutes.find((r) => r.method === method && r.path === path);
  return route?.handler ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return {
    title: dict.international.countriesTitle,
    description: dict.international.countriesSubtitle,
  };
}

export default async function InternationalCountriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  // Only countries with ≥1 open offer. Missing route → honest empty state.
  let items: InternationalCountryOption[] = [];
  const handler = handlerOf('GET', '/international/countries');
  if (handler) {
    try {
      const data = await invoke<{ items: InternationalCountryOption[] }>(handler, {
        path: '/international/countries',
        locale,
      });
      items = data.items;
    } catch (error) {
      if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-3xl font-bold text-sand-900">{dict.international.countriesTitle}</h1>
      <p className="mt-2 max-w-2xl text-sand-600">{dict.international.countriesSubtitle}</p>

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState>{dict.international.countriesEmpty}</EmptyState>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((country) => {
            const name =
              textFor(locale, country.nameAr, country.nameFr, country.nameEn) ?? country.code;
            return (
              <li key={country.id} className="flex">
                <Link
                  href={`/${locale}/international/countries/${country.code}`}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-sand-200 bg-white p-5 transition hover:border-brand-200 hover:bg-brand-50"
                >
                  <span className="font-semibold text-sand-900">{name}</span>
                  <Badge tone="info">
                    {country.opportunityCount} {dict.international.countryOpps}
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
