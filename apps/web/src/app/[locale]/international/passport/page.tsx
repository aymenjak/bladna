import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  isAppError,
  type InternationalPassportReadiness,
  type InternationalProjectType,
  type LocaleCode,
} from '@bladna/types';
import { Alert, Badge, Card, CardTitle, EmptyState } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { internationalRoutes } from '@/server/modules/international';
import { pageSession } from '@/server/page-session';
import type { Handler } from '@/server/http';
import type { AppRoute } from '@/server/router';
import { invoke } from '@/server/ssr';
import { PassportSettingsForm, type PassportCountryOption } from './passport-form';
import { DeclareExperienceForm } from './experience-form';

export const dynamic = 'force-dynamic';

const EXPERIENCE_PAGE_SIZE = 10;
const COUNTRY_PAGE_SIZE = 100;
/** Safety bound for the country-options paging loop (2 000 countries). */
const COUNTRY_MAX_PAGES = 20;

const ROUTE_TABLES: AppRoute[][] = [internationalRoutes];

/** Look up a handler from the module route tables so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

/** Optional variant: enrichment endpoints degrade to “control hidden”. */
function optionalHandler(method: string, path: string): Handler | null {
  return (
    ROUTE_TABLES.flatMap((table) => table).find(
      (route) => route.method === method && route.path === path,
    )?.handler ?? null
  );
}

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Shape returned by `GET /international/passport` and `GET /international/countries`. */
interface CountryRecord {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
}

/** Fields this page renders from `GET /international/passport`. */
interface PassportData {
  readiness: InternationalPassportReadiness;
  travelReady: boolean;
  emergencyContactReady: boolean;
  preferredCategories: InternationalProjectType[];
  preferredCountries: CountryRecord[];
  dateOfBirth: string | null;
  stats: {
    countries: number;
    programs: number;
    verifiedHours: string;
    certificates: number;
  };
}

interface ExperiencesResult {
  items: Array<{
    id: string;
    organizationName: string;
    program: string;
    activity: string | null;
    startDate: string | Date;
    endDate: string | Date | null;
    hours: number | null;
    verified: boolean;
  }>;
  meta: PageMeta;
}

function countryNameFor(
  country: { nameAr: string; nameFr: string; nameEn: string },
  locale: LocaleCode,
): string {
  if (locale === 'ar') return country.nameAr;
  if (locale === 'fr') return country.nameFr;
  return country.nameEn;
}

/** Preserve the experiences list page between requests. */
function pageHref(locale: LocaleCode, page: number): string {
  return `/${locale}/international/passport${page > 1 ? `?page=${page}` : ''}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.international.passportTitle, robots: { index: false, follow: false } };
}

export default async function InternationalPassportPage({
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

  const sessionPath = `/${locale}/international/passport`;
  await pageSession(locale, sessionPath);
  const next = encodeURIComponent(sessionPath);

  // 1. Passport (core data) — auth failures bounce like every private page;
  //    any business rule (e.g. no volunteer profile) degrades to the server's
  //    honest message instead of fabricated record numbers.
  let passport: PassportData | null = null;
  let passportError: string | null = null;
  try {
    const data = await invoke<{ passport: PassportData }>(
      requireHandler('GET', '/international/passport'),
      { path: '/international/passport', locale },
    );
    passport = data.passport;
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    if (isAppError(error)) passportError = error.message;
    else throw error;
  }

  // 2. Own experiences (paginated) + country options for the pickers — both
  //    enrichment: missing handler or AppError hides the control, never fakes data.
  let experiences: ExperiencesResult['items'] = [];
  let experiencesMeta: PageMeta = {
    page,
    limit: EXPERIENCE_PAGE_SIZE,
    total: 0,
    totalPages: 0,
  };
  let experiencesLoaded = false;
  let countries: CountryRecord[] = [];

  if (passport) {
    try {
      const data = await invoke<ExperiencesResult>(
        requireHandler('GET', '/international/experiences'),
        {
          path: '/international/experiences',
          locale,
          query: { page, limit: EXPERIENCE_PAGE_SIZE },
        },
      );
      experiences = data.items;
      experiencesMeta = data.meta;
      experiencesLoaded = true;
    } catch (error) {
      if (isAppError(error) && error.code === 'UNAUTHORIZED') {
        redirect(`/${locale}/login?next=${next}`);
      }
      if (isAppError(error) && error.code === 'MFA_REQUIRED') {
        redirect(`/${locale}/mfa?next=${next}`);
      }
      if (!isAppError(error)) throw error;
    }

    const countriesHandler = optionalHandler('GET', '/international/countries');
    if (countriesHandler) {
      try {
        for (let pageNo = 1; pageNo <= COUNTRY_MAX_PAGES; pageNo += 1) {
          const data = await invoke<{ items: CountryRecord[]; meta: PageMeta }>(countriesHandler, {
            path: '/international/countries',
            locale,
            query: { page: pageNo, limit: COUNTRY_PAGE_SIZE },
          });
          countries = countries.concat(data.items);
          if (pageNo >= data.meta.totalPages) break;
        }
      } catch (error) {
        if (!isAppError(error)) throw error;
        countries = [];
      }
    }
  }

  // Merge the full option list with the volunteer's current picks so an
  // already-preferred country is always selectable even when the catalogue
  // fetch degraded.
  const optionsById = new Map<string, string>();
  for (const country of countries) optionsById.set(country.id, countryNameFor(country, locale));
  if (passport) {
    for (const country of passport.preferredCountries) {
      if (!optionsById.has(country.id)) {
        optionsById.set(country.id, countryNameFor(country, locale));
      }
    }
  }
  const countryOptions: PassportCountryOption[] = Array.from(optionsById, ([id, name]) => ({
    id,
    name,
  })).sort((a, b) => a.name.localeCompare(b.name, locale));

  const stats = passport?.stats;
  const statsEmpty = stats
    ? stats.countries === 0 &&
      stats.programs === 0 &&
      stats.certificates === 0 &&
      Number(stats.verifiedHours) === 0
    : false;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.international.passportTitle}</h1>
        <p className="text-sm text-sand-600">{dict.international.passportSubtitle}</p>
      </header>

      {/* Honest scope: a digital volunteering record — never a travel document. */}
      <Alert tone="warning" className="font-semibold">
        {dict.international.passportDisclaimer}
      </Alert>

      {passportError ? (
        <Alert tone="warning">
          <p>{passportError}</p>
          <Link
            href={`/${locale}/profile`}
            className="mt-1 inline-block font-semibold text-brand-700 hover:text-brand-800"
          >
            {dict.profile.title} →
          </Link>
        </Alert>
      ) : null}

      {/* Stats — numbers come only from the API; all-zero shows the honest empty state. */}
      {stats ? (
        statsEmpty ? (
          <EmptyState>{dict.international.passportEmpty}</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={dict.international.countriesVisited} value={String(stats.countries)} />
            <Stat label={dict.international.programsLabel} value={String(stats.programs)} />
            <Stat
              label={dict.international.verifiedHoursLabel}
              value={String(stats.verifiedHours)}
            />
            <Stat
              label={dict.international.passportCertificates}
              value={String(stats.certificates)}
            />
          </div>
        )
      ) : null}

      {/* Readiness / preferences → PATCH /international/passport */}
      {passport ? (
        <PassportSettingsForm
          locale={locale}
          initial={{
            readiness: passport.readiness,
            travelReady: passport.travelReady,
            emergencyContactReady: passport.emergencyContactReady,
            preferredCategories: passport.preferredCategories,
            preferredCountryIds: passport.preferredCountries.map((country) => country.id),
            dateOfBirth: passport.dateOfBirth ? passport.dateOfBirth.slice(0, 10) : '',
          }}
          countryOptions={countryOptions}
        />
      ) : null}

      {/* Own experiences + declare form */}
      {passport ? (
        <Card>
          <CardTitle>{dict.international.myExperiences}</CardTitle>
          {experiencesLoaded ? (
            experiences.length === 0 ? (
              <p className="mt-3 text-sm text-sand-500">{dict.international.experienceEmpty}</p>
            ) : (
              <ul className="mt-3 divide-y divide-sand-100">
                {experiences.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-start justify-between gap-2 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate font-medium text-sand-900">{item.program}</p>
                      <p className="text-sm text-sand-500">{item.organizationName}</p>
                      {item.activity ? (
                        <p className="text-sm text-sand-600">{item.activity}</p>
                      ) : null}
                      <p className="text-xs text-sand-500">
                        {formatDate(item.startDate, locale)}
                        {item.endDate ? ` · ${formatDate(item.endDate, locale)}` : ''} ·{' '}
                        {dict.international.hoursLabel}: {item.hours ?? '—'}
                      </p>
                    </div>
                    <Badge tone={item.verified ? 'success' : 'neutral'}>
                      {item.verified ? dict.common.verified : dict.international.selfDeclared}
                    </Badge>
                  </li>
                ))}
              </ul>
            )
          ) : null}

          {experiencesMeta.totalPages > 1 ? (
            <nav
              className="mt-4 flex items-center justify-center gap-4 text-sm"
              aria-label={dict.common.page}
            >
              {experiencesMeta.page > 1 ? (
                <Link
                  href={pageHref(locale, experiencesMeta.page - 1)}
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
                {dict.common.page} {experiencesMeta.page} {dict.common.of}{' '}
                {experiencesMeta.totalPages} · {experiencesMeta.total}
              </span>
              {experiencesMeta.page < experiencesMeta.totalPages ? (
                <Link
                  href={pageHref(locale, experiencesMeta.page + 1)}
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

          <div className="mt-5 border-t border-sand-100 pt-4">
            <h3 className="text-sm font-semibold text-sand-900">
              {dict.international.shareExperience}
            </h3>
            <DeclareExperienceForm locale={locale} countryOptions={countryOptions} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-sand-500">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold text-sand-900">{value}</p>
    </Card>
  );
}
