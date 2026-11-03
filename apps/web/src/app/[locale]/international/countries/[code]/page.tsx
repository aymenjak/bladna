import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState } from '@bladna/ui';
import { isAppError } from '@bladna/types';
import { getDictionary, isLocale } from '@/ui/i18n';
import { internationalRoutes } from '@/server/modules/international';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { OpportunityCardIntl } from '@/ui/international/opportunity-card-intl';
import { textFor, type InternationalCountryResult } from '@/ui/international/types';

export const dynamic = 'force-dynamic';

/** Look up a handler from the international route table so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  const route = internationalRoutes.find((r) => r.method === method && r.path === path);
  return route?.handler ?? null;
}

async function fetchCountry(code: string, locale: string): Promise<InternationalCountryResult> {
  const handler = handlerOf('GET', '/international/countries/:code');
  // Route not registered (contract drift) → the locale 404 boundary, not a 500.
  if (!handler) notFound();
  try {
    return await invoke<InternationalCountryResult>(handler, {
      path: `/international/countries/${code}`,
      params: { code },
      locale,
      withCookies: false,
    });
  } catch (error) {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')) {
      notFound();
    }
    throw error;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  const resolved = isLocale(locale) ? locale : undefined;
  const { dict } = getDictionary(resolved);
  try {
    const data = await fetchCountry(code, resolved ?? 'ar');
    const name = textFor(
      resolved ?? 'ar',
      data.country.nameAr,
      data.country.nameFr,
      data.country.nameEn,
    );
    return {
      title: name ?? dict.international.countriesTitle,
      description: dict.international.countriesSubtitle,
    };
  } catch {
    return {
      title: dict.international.countriesTitle,
      description: dict.international.countriesSubtitle,
    };
  }
}

export default async function InternationalCountryPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  const data = await fetchCountry(code, locale);
  const name =
    textFor(locale, data.country.nameAr, data.country.nameFr, data.country.nameEn) ??
    data.country.code;
  const items = data.items;
  const hasVisaInformation = items.some((item) => item.visaInformation);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Link
        href={`/${locale}/international/countries`}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        {dict.international.backToCountries}
      </Link>

      <h1 className="mt-3 text-3xl font-bold text-sand-900">{name}</h1>

      {/* Visa callout — the disclaimer renders verbatim, no guarantees. */}
      {hasVisaInformation ? (
        <section className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-base font-semibold text-amber-900">{dict.international.visaTitle}</h2>
          <p className="mt-2 text-sm text-amber-800">{dict.international.visaDisclaimer}</p>
        </section>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState>{dict.international.empty}</EmptyState>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <OpportunityCardIntl key={item.id} locale={locale} item={item} context="country" />
          ))}
        </ul>
      )}
    </div>
  );
}
