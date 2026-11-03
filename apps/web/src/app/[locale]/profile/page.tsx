import { notFound, redirect } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Card, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale, type LocaleCode } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { pageSession } from '@/server/page-session';
import { invoke } from '@/server/ssr';
import { volunteerRoutes } from '@/server/modules/volunteers';
import { hourRoutes } from '@/server/modules/hours';
import { certificateRoutes } from '@/server/modules/certificates';
import { achievementRoutes } from '@/server/modules/achievements';
import { taxonomyRoutes } from '@/server/modules/taxonomies';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { CardIssueButton, DataRights } from '@/ui/components/profile-actions';
import { ProfileSkillset } from '@/ui/components/profile-skillset';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const ROUTE_TABLES: AppRoute[][] = [
  volunteerRoutes,
  hourRoutes,
  certificateRoutes,
  achievementRoutes,
  taxonomyRoutes,
];

/** Look up a handler from a module route table so SSR can call it in-process. */
function requireHandler(method: string, path: string): Handler {
  const handler = ROUTE_TABLES.flatMap((table) => table).find(
    (route) => route.method === method && route.path === path,
  )?.handler;
  if (!handler) throw new Error(`Missing route handler for ${method} ${path}`);
  return handler;
}

const PAGE_SIZE = 10;

interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface StatsResult {
  stats: {
    verifiedHours: number;
    certificates: number;
    applications: number;
    completedActivities: number;
    attendance: number;
    achievements: number;
  };
}

interface HourRow {
  id: string;
  /** UUID only — GET /me/hours joins no organization name. */
  organizationId: string;
  hours: number;
  date: string | Date;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REVOKED';
}

interface HoursResult {
  items: HourRow[];
  meta: PageMeta;
}

interface CertificateRow {
  id: string;
  certificateNumber: string;
  title: string;
  hours: number;
  issuedAt: string | Date;
  status: 'VALID' | 'REVOKED' | 'EXPIRED';
  organization: { name: string } | null;
}

interface CertificatesResult {
  items: CertificateRow[];
  meta: PageMeta;
}

interface AchievementRow {
  id: string;
  code: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionFr: string | null;
  descriptionEn: string | null;
  thresholdHours: number | null;
  unlocked: boolean;
  unlockedAt: string | Date | null;
}

interface AchievementsResult {
  items: AchievementRow[];
  meta: PageMeta;
}

/** Taxonomy catalog row (skills / languages / interests pick lists). */
interface CatalogRow {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
}

interface CatalogResult {
  items: CatalogRow[];
  meta: PageMeta;
}

/** GET /me/profile — skillset slice (PROFILE_SELECT). */
interface ProfileSkillsetResult {
  profile: {
    skills: Array<{ skillId: string; skill: CatalogRow }>;
    languages: Array<{
      languageId: string;
      level:
        'BEGINNER' | 'ELEMENTARY' | 'INTERMEDIATE' | 'UPPER_INTERMEDIATE' | 'ADVANCED' | 'NATIVE';
      language: CatalogRow;
    }>;
    interests: Array<{ interestId: string; interest: CatalogRow }>;
  };
}

type ActivityStatusValue = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface ActivityRow {
  id: string;
  title: string;
  description: string | null;
  startedAt: string | Date;
  endedAt: string | Date | null;
  status: ActivityStatusValue;
  organization: { id: string; name: string };
  opportunity: {
    id: string;
    slug: string;
    titleAr: string;
    titleFr: string;
    titleEn: string;
  } | null;
  hoursVerified: number;
  hoursPending: number;
  certificates: Array<{ id: string; certificateNumber: string; title: string; status: string }>;
}

interface ActivitiesResult {
  items: ActivityRow[];
  meta: PageMeta;
}

interface CardResult {
  card: {
    cardNumber: string;
    status: string;
    issuedAt: string | Date;
    expiresAt: string | Date | null;
    verifyUrl: string;
    qr: { token: string; verifyUrl: string; dataUrl: string };
  };
}

interface CvResult {
  cv: {
    profile: { volunteerId: string; name: string };
    stats: { verifiedHours: number; certificates: number; achievements: number };
  };
}

interface ProfileSearchParams {
  hourspage?: string;
  certpage?: string;
  achpage?: string;
  actpage?: string;
}

function parsePage(value: string | undefined): number {
  return Math.max(1, Number.parseInt(value ?? '1', 10) || 1);
}

/** Preserve the other lists' page cursors when paging one section. */
function pageHref(
  locale: LocaleCode,
  sp: ProfileSearchParams,
  key: 'hourspage' | 'certpage' | 'achpage' | 'actpage',
  page: number,
): string {
  const params = new URLSearchParams();
  const merged: ProfileSearchParams = { ...sp, [key]: String(page) };
  if (merged.hourspage && merged.hourspage !== '1') params.set('hourspage', merged.hourspage);
  if (merged.certpage && merged.certpage !== '1') params.set('certpage', merged.certpage);
  if (merged.achpage && merged.achpage !== '1') params.set('achpage', merged.achpage);
  if (merged.actpage && merged.actpage !== '1') params.set('actpage', merged.actpage);
  const qs = params.toString();
  return `/${locale}/profile${qs ? `?${qs}` : ''}`;
}

function achievementName(row: AchievementRow, locale: LocaleCode): string {
  return locale === 'ar' ? row.nameAr : locale === 'fr' ? row.nameFr : row.nameEn;
}

function achievementDescription(row: AchievementRow, locale: LocaleCode): string | null {
  return locale === 'ar'
    ? row.descriptionAr
    : locale === 'fr'
      ? row.descriptionFr
      : row.descriptionEn;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.profile.title, robots: { index: false, follow: false } };
}

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<ProfileSearchParams>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const sp = await searchParams;
  const { dict } = getDictionary(locale);

  const path = `/${locale}/profile`;
  const next = encodeURIComponent(path);

  // Session gate before any data fetch — auth failures bounce to login.
  await pageSession(locale, path);

  const hoursPage = parsePage(sp.hourspage);
  const certPage = parsePage(sp.certpage);
  const achPage = parsePage(sp.achpage);
  const actPage = parsePage(sp.actpage);

  // Core stats: auth failures bounce (the session died mid-request), other
  // AppErrors (org account without a volunteer profile) degrade to hiding the
  // section, real bugs throw.
  let stats: StatsResult['stats'] | null = null;
  try {
    const data = await invoke<StatsResult>(requireHandler('GET', '/me/stats'), {
      path: '/me/stats',
      locale,
    });
    stats = data.stats;
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    if (!isAppError(error)) throw error;
  }

  // Optional enrichment: any AppError hides that section, nothing else throws.
  let hours: HoursResult | null = null;
  try {
    hours = await invoke<HoursResult>(requireHandler('GET', '/me/hours'), {
      path: '/me/hours',
      locale,
      query: { page: hoursPage, limit: PAGE_SIZE },
    });
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  let certificates: CertificatesResult | null = null;
  try {
    certificates = await invoke<CertificatesResult>(requireHandler('GET', '/me/certificates'), {
      path: '/me/certificates',
      locale,
      query: { page: certPage, limit: PAGE_SIZE },
    });
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  let achievements: AchievementsResult | null = null;
  try {
    achievements = await invoke<AchievementsResult>(requireHandler('GET', '/me/achievements'), {
      path: '/me/achievements',
      locale,
      query: { page: achPage, limit: PAGE_SIZE },
    });
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  // Skillset read (GET /me/profile now carries skills/languages/interests),
  // taxonomy catalogs for the manage island, and the participation timeline
  // (GET /me/activities) — RESEARCH H2. Any AppError hides that section.
  let skillset: ProfileSkillsetResult['profile'] | null = null;
  try {
    const data = await invoke<ProfileSkillsetResult>(requireHandler('GET', '/me/profile'), {
      path: '/me/profile',
      locale,
    });
    skillset = data.profile;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  let catalogs: { skills: CatalogRow[]; languages: CatalogRow[]; interests: CatalogRow[] } | null =
    null;
  try {
    const [skillsRes, languagesRes, interestsRes] = await Promise.all([
      invoke<CatalogResult>(requireHandler('GET', '/taxonomies/skills'), {
        path: '/taxonomies/skills',
        locale,
        query: { page: 1, limit: 200 },
      }),
      invoke<CatalogResult>(requireHandler('GET', '/taxonomies/languages'), {
        path: '/taxonomies/languages',
        locale,
        query: { page: 1, limit: 200 },
      }),
      invoke<CatalogResult>(requireHandler('GET', '/taxonomies/interests'), {
        path: '/taxonomies/interests',
        locale,
        query: { page: 1, limit: 200 },
      }),
    ]);
    catalogs = {
      skills: skillsRes.items,
      languages: languagesRes.items,
      interests: interestsRes.items,
    };
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  let activities: ActivitiesResult | null = null;
  try {
    activities = await invoke<ActivitiesResult>(requireHandler('GET', '/me/activities'), {
      path: '/me/activities',
      locale,
      query: { page: actPage, limit: PAGE_SIZE },
    });
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  // Card: NOT_FOUND (no card / no volunteer profile) → issue prompt instead.
  let card: CardResult['card'] | null = null;
  try {
    const data = await invoke<CardResult>(requireHandler('GET', '/me/card'), {
      path: '/me/card',
      locale,
    });
    card = data.card;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  // CV: missing → the whole section disappears (nothing to download yet).
  let cv: CvResult['cv'] | null = null;
  try {
    const data = await invoke<CvResult>(requireHandler('GET', '/me/cv'), {
      path: '/me/cv',
      locale,
    });
    cv = data.cv;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-sand-900">{dict.profile.title}</h1>
        <p className="text-sm text-sand-600">{dict.profile.subtitle}</p>
      </header>

      {/* Stats — the four counters the API actually reports for this account */}
      {stats ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.statsTitle}</h2>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-sand-50 px-3 py-3 text-center">
              <dt className="text-xs text-sand-600">{dict.profile.verifiedHours}</dt>
              <dd className="mt-1 text-xl font-bold text-sand-900">{stats.verifiedHours}</dd>
            </div>
            <div className="rounded-lg bg-sand-50 px-3 py-3 text-center">
              <dt className="text-xs text-sand-600">{dict.profile.completedActivities}</dt>
              <dd className="mt-1 text-xl font-bold text-sand-900">{stats.completedActivities}</dd>
            </div>
            <div className="rounded-lg bg-sand-50 px-3 py-3 text-center">
              <dt className="text-xs text-sand-600">{dict.profile.attendanceCount}</dt>
              <dd className="mt-1 text-xl font-bold text-sand-900">{stats.attendance}</dd>
            </div>
            <div className="rounded-lg bg-sand-50 px-3 py-3 text-center">
              <dt className="text-xs text-sand-600">{dict.profile.achievementsCount}</dt>
              <dd className="mt-1 text-xl font-bold text-sand-900">{stats.achievements}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      {/* Hours */}
      {hours ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.hoursTitle}</h2>
          {hours.items.length === 0 ? (
            <p className="mt-3 text-sm text-sand-500">{dict.profile.hoursEmpty}</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-sand-100 rounded-lg border border-sand-200">
                {hours.items.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-sand-800">
                      {formatDate(row.date, locale)}
                    </span>
                    <span className="text-sm text-sand-600">
                      {dict.common.hours}: {row.hours}
                    </span>
                    {/* GET /me/hours joins no org name — only the tenant UUID. */}
                    <span className="min-w-0 truncate font-mono text-xs text-sand-400">
                      {dict.common.organization}: {row.organizationId}
                    </span>
                    <StatusBadge
                      className="ml-auto"
                      status={row.status}
                      label={dict.profile.hourStatuses[row.status]}
                    />
                  </li>
                ))}
              </ul>
              {hours.meta.totalPages > 1 ? (
                <nav
                  className="mt-4 flex items-center justify-between gap-3 text-sm"
                  aria-label={dict.common.page}
                >
                  {hours.meta.page > 1 ? (
                    <a
                      href={pageHref(locale, sp, 'hourspage', hours.meta.page - 1)}
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
                    {dict.common.page} {hours.meta.page} {dict.common.of} {hours.meta.totalPages} ·{' '}
                    {hours.meta.total}
                  </span>
                  {hours.meta.page < hours.meta.totalPages ? (
                    <a
                      href={pageHref(locale, sp, 'hourspage', hours.meta.page + 1)}
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
            </>
          )}
        </Card>
      ) : null}

      {/* Certificates */}
      {certificates ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.certificatesTitle}</h2>
          {certificates.items.length === 0 ? (
            <p className="mt-3 text-sm text-sand-500">{dict.profile.certificatesEmpty}</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-sand-100 rounded-lg border border-sand-200">
                {certificates.items.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <a
                        href={`/${locale}/verify/certificate?code=${encodeURIComponent(row.certificateNumber)}`}
                        className="font-medium text-brand-700 hover:text-brand-800"
                      >
                        {row.title}
                      </a>
                      <p className="text-xs text-sand-500">
                        {row.certificateNumber}
                        {row.organization ? ` · ${row.organization.name}` : ''} ·{' '}
                        {dict.common.hours}: {row.hours} · {formatDate(row.issuedAt, locale)}
                      </p>
                    </div>
                    <StatusBadge
                      status={row.status}
                      label={dict.profile.certificateStatuses[row.status]}
                    />
                    {/* H1: the missing payoff — public PDF download (same
                        exposure as GET /certificates/:id metadata). */}
                    <a
                      href={`/api/v1/certificates/${row.id}/pdf?locale=${locale}`}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex min-h-11 items-center rounded-lg border border-sand-200 bg-white px-4 py-2 text-sm font-medium text-brand-700 hover:bg-sand-100"
                    >
                      {dict.profile.certificatePdf}
                    </a>
                  </li>
                ))}
              </ul>
              {certificates.meta.totalPages > 1 ? (
                <nav
                  className="mt-4 flex items-center justify-between gap-3 text-sm"
                  aria-label={dict.common.page}
                >
                  {certificates.meta.page > 1 ? (
                    <a
                      href={pageHref(locale, sp, 'certpage', certificates.meta.page - 1)}
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
                    {dict.common.page} {certificates.meta.page} {dict.common.of}{' '}
                    {certificates.meta.totalPages} · {certificates.meta.total}
                  </span>
                  {certificates.meta.page < certificates.meta.totalPages ? (
                    <a
                      href={pageHref(locale, sp, 'certpage', certificates.meta.page + 1)}
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
            </>
          )}
        </Card>
      ) : null}

      {/* Achievements */}
      {achievements ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.achievementsTitle}</h2>
          {achievements.items.length === 0 ? (
            <p className="mt-3 text-sm text-sand-500">{dict.profile.achievementsEmpty}</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-sand-100 rounded-lg border border-sand-200">
                {achievements.items.map((row) => {
                  const name = achievementName(row, locale);
                  const description = achievementDescription(row, locale);
                  return (
                    <li key={row.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span
                          className={`text-sm font-medium ${row.unlocked ? 'text-sand-900' : 'text-sand-400'}`}
                        >
                          {name}
                        </span>
                        {row.unlocked && row.unlockedAt ? (
                          <span className="text-xs text-sand-500">
                            {formatDate(row.unlockedAt, locale)}
                          </span>
                        ) : null}
                        {row.thresholdHours !== null ? (
                          <span className="ml-auto text-xs text-sand-500">
                            {dict.common.hours}: {row.thresholdHours}
                          </span>
                        ) : null}
                      </div>
                      {description ? (
                        <p className="mt-1 text-xs text-sand-500">{description}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {achievements.meta.totalPages > 1 ? (
                <nav
                  className="mt-4 flex items-center justify-between gap-3 text-sm"
                  aria-label={dict.common.page}
                >
                  {achievements.meta.page > 1 ? (
                    <a
                      href={pageHref(locale, sp, 'achpage', achievements.meta.page - 1)}
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
                    {dict.common.page} {achievements.meta.page} {dict.common.of}{' '}
                    {achievements.meta.totalPages} · {achievements.meta.total}
                  </span>
                  {achievements.meta.page < achievements.meta.totalPages ? (
                    <a
                      href={pageHref(locale, sp, 'achpage', achievements.meta.page + 1)}
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
            </>
          )}
        </Card>
      ) : null}

      {/* Skillset — skills / languages / interests (RESEARCH H2: endpoints
          existed with zero UI callers; this is the surface + manage island). */}
      {skillset && catalogs ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.skillsetTitle}</h2>
          <ProfileSkillset
            locale={locale}
            skills={skillset.skills}
            languages={skillset.languages}
            interests={skillset.interests}
            catalogs={catalogs}
          />
        </Card>
      ) : null}

      {/* Participation timeline — GET /me/activities (VolunteerActivity rows:
          opportunity/campaign participations an org attached to this profile). */}
      {activities ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.experienceTitle}</h2>
          {activities.items.length === 0 ? (
            <p className="mt-3 text-sm text-sand-500">{dict.profile.experienceEmpty}</p>
          ) : (
            <>
              <ul className="mt-4 divide-y divide-sand-100 rounded-lg border border-sand-200">
                {activities.items.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {row.opportunity ? (
                        <a
                          href={`/${locale}/opportunities/${row.opportunity.slug}`}
                          className="text-sm font-medium text-brand-700 hover:text-brand-800"
                        >
                          {row.title}
                        </a>
                      ) : (
                        <span className="text-sm font-medium text-sand-900">{row.title}</span>
                      )}
                      <span className="text-xs text-sand-500">{row.organization.name}</span>
                      <StatusBadge
                        className="ms-auto"
                        status={row.status}
                        label={dict.profile.activityStatuses[row.status]}
                      />
                    </div>
                    <p className="mt-1 text-xs text-sand-500">
                      {formatDate(row.startedAt, locale)}
                      {row.endedAt ? ` – ${formatDate(row.endedAt, locale)}` : ''}
                      {row.hoursVerified > 0
                        ? ` · ${dict.common.hours}: ${formatNumber(row.hoursVerified, locale)}`
                        : ''}
                      {row.hoursPending > 0
                        ? ` · ${dict.profile.hourStatuses.PENDING}: ${formatNumber(row.hoursPending, locale)}`
                        : ''}
                    </p>
                    {row.description ? (
                      <p className="mt-1 text-sm text-sand-600">{row.description}</p>
                    ) : null}
                    {row.certificates.length > 0 ? (
                      <p className="mt-1 text-xs">
                        {row.certificates.map((certificate, index) => (
                          <span key={certificate.id}>
                            {index > 0 ? ' · ' : ''}
                            <a
                              href={`/${locale}/verify/certificate?code=${encodeURIComponent(certificate.certificateNumber)}`}
                              className="font-medium text-brand-700 hover:text-brand-800"
                            >
                              {certificate.title}
                            </a>
                          </span>
                        ))}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              {activities.meta.totalPages > 1 ? (
                <nav
                  className="mt-4 flex items-center justify-between gap-3 text-sm"
                  aria-label={dict.common.page}
                >
                  {activities.meta.page > 1 ? (
                    <a
                      href={pageHref(locale, sp, 'actpage', activities.meta.page - 1)}
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
                    {dict.common.page} {activities.meta.page} {dict.common.of}{' '}
                    {activities.meta.totalPages} · {activities.meta.total}
                  </span>
                  {activities.meta.page < activities.meta.totalPages ? (
                    <a
                      href={pageHref(locale, sp, 'actpage', activities.meta.page + 1)}
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
            </>
          )}
        </Card>
      ) : null}

      {/* Volunteer card */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-sand-900">{dict.profile.cardTitle}</h2>
        {card ? (
          <div className="mt-4 space-y-3">
            <img
              src={card.qr.dataUrl}
              alt={dict.profile.cardTitle}
              className="size-32 rounded-lg border border-sand-200"
            />
            <dl className="space-y-1 text-sm text-sand-700">
              <div className="flex gap-2">
                <dt className="font-medium text-sand-600">{dict.common.status}:</dt>
                <dd>{card.status}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="font-medium text-sand-600">{dict.common.startDate}:</dt>
                <dd>{formatDate(card.issuedAt, locale)}</dd>
              </div>
              {card.expiresAt ? (
                <div className="flex gap-2">
                  <dt className="font-medium text-sand-600">{dict.common.endDate}:</dt>
                  <dd>{formatDate(card.expiresAt, locale)}</dd>
                </div>
              ) : null}
            </dl>
            <a href="/api/v1/me/card/pdf" className={buttonClasses()}>
              {dict.profile.cardDownload}
            </a>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-sand-500">{dict.profile.cardMissing}</p>
            <CardIssueButton locale={locale} />
          </div>
        )}
      </Card>

      {/* CV export — hidden entirely when the aggregate cannot be built */}
      {cv ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-sand-900">{dict.profile.cvTitle}</h2>
          <p className="mt-1 text-sm text-sand-500">{cv.profile.name}</p>
          <a href="/api/v1/me/cv/pdf" className={buttonClasses({ className: 'mt-3' })}>
            {dict.profile.cvDownload}
          </a>
        </Card>
      ) : null}

      {/* Data rights */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-sand-900">{dict.profile.dataTitle}</h2>
        <p className="mt-1 text-sm text-sand-500">{dict.profile.dataHint}</p>
        <div className="mt-4">
          <DataRights locale={locale} />
        </div>
      </Card>
    </div>
  );
}
