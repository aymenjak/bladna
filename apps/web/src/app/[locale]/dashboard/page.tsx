import type { ReactNode } from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  isAppError,
  type ApplicationStatus,
  type SupportNeedKind,
  type SupportOfferStatus,
} from '@bladna/types';
import { Alert, Badge, Card, EmptyState, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { needLabelFor, titleFor } from '@/ui/opportunity';
import { StatusBadge } from '@/ui/status';
import { me } from '@/server/modules/auth';
import { myApplications } from '@/server/modules/applications';
import { volunteerRoutes } from '@/server/modules/volunteers';
import { organizationRoutes } from '@/server/modules/organizations';
import { internationalRoutes } from '@/server/modules/international';
import { supportRoutes } from '@/server/modules/support';
import { recommendationRoutes } from '@/server/modules/matching';
import { cmsRoutes } from '@/server/modules/cms';
import { adminSectionsFor } from '@/server/admin-access';
import { MatchingCard, type MatchingItem } from '@/ui/components/matching-list';
import { SectionHeading } from '@/ui/components/section-heading';
import { StatGrid } from '@/ui/components/stat-grid';
import {
  ArrowRightIcon,
  AwardIcon,
  BellIcon,
  BookmarkIcon,
  BuildingIcon,
  ClockIcon,
  CompassIcon,
  HandshakeIcon,
  HeartIcon,
  IdCardIcon,
  InboxIcon,
  MailIcon,
  QrCodeIcon,
  SendIcon,
  ShieldCheckIcon,
  UserRoundIcon,
} from '@/ui/components/icons';
import type { AppRoute } from '@/server/router';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';

export const dynamic = 'force-dynamic';

interface MeResult {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    emailVerified: boolean;
    roles: string[];
  };
  mfaRequired: boolean;
}

interface ApplicationItem {
  id: string;
  status: ApplicationStatus;
  submittedAt: string | Date | null;
  opportunity: {
    id: string;
    slug: string;
    titleAr: string;
    titleFr: string;
    titleEn: string;
    organization: { id: string; name: string; verificationStatus: string };
  };
}

interface ApplicationsResult {
  items: ApplicationItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
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

interface ProfileResult {
  profile: { volunteerId: string; verificationStatus: string };
}

interface OrgsResult {
  items: Array<{
    role: string;
    joinedAt: string | Date;
    organization: { id: string; name: string };
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface InternationalPassportResult {
  passport: {
    stats: { countries: number; programs: number; verifiedHours: string };
  };
}

const ROUTE_TABLES: AppRoute[][] = [
  volunteerRoutes,
  organizationRoutes,
  internationalRoutes,
  supportRoutes,
  recommendationRoutes,
  cmsRoutes,
];

/** Look up a handler from the module route tables so SSR can call it in-process. */
function handlerOf(method: string, path: string): Handler | null {
  return (
    ROUTE_TABLES.flatMap((table) => table).find((r) => r.method === method && r.path === path)
      ?.handler ?? null
  );
}

/** Offer items as returned by `GET /me/support-offers` (flattened need + initiative). */
interface MyOffersResult {
  items: Array<{
    id: string;
    status: SupportOfferStatus;
    quantity: number | null;
    amount: number | null;
    currency: string;
    createdAt: string | Date;
    need: {
      kind: SupportNeedKind;
      labelAr: string;
      labelFr: string;
      labelEn: string;
    };
    initiative: {
      id: string;
      slug: string;
      titleAr: string;
      titleFr: string;
      titleEn: string;
    };
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** P5 matching envelope as returned by GET /me/recommendations. */
interface RecommendationsResult {
  items: MatchingItem[];
  meta: { limit: number; minScore: number; candidates: number };
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  return { title: dict.dashboard.title, robots: { index: false, follow: false } };
}

export default async function DashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  // 1. Session — /auth/me is MFA-exempt, so it returns the flag instead of throwing.
  let session: MeResult;
  try {
    session = await invoke<MeResult>(me, { path: '/auth/me', locale });
  } catch (error) {
    if (isAppError(error) && (error.code === 'UNAUTHORIZED' || error.code === 'MFA_REQUIRED')) {
      redirect(`/${locale}/login?next=${encodeURIComponent(`/${locale}/dashboard`)}`);
    }
    throw error;
  }
  const next = encodeURIComponent(`/${locale}/dashboard`);
  if (session.mfaRequired) redirect(`/${locale}/mfa?next=${next}`);

  // 2. Recent applications (latest 5).
  let apps: ApplicationsResult = {
    items: [],
    meta: { page: 1, limit: 5, total: 0, totalPages: 0 },
  };
  try {
    apps = await invoke<ApplicationsResult>(myApplications, {
      path: '/me/applications',
      locale,
      query: { page: 1, limit: 5 },
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'UNAUTHORIZED') {
      redirect(`/${locale}/login?next=${next}`);
    }
    if (isAppError(error) && error.code === 'MFA_REQUIRED') redirect(`/${locale}/mfa?next=${next}`);
    throw error;
  }

  // 3. Supplementary stats/profile — optional enrichment (org accounts may lack
  //    a volunteer profile); permission failures degrade to “—”, real bugs throw.
  let stats: StatsResult['stats'] | null = null;
  let volunteerId: string | null = null;

  const statsHandler = handlerOf('GET', '/me/stats');
  if (statsHandler) {
    try {
      stats = (await invoke<StatsResult>(statsHandler, { path: '/me/stats', locale })).stats;
    } catch (error) {
      if (!isAppError(error)) throw error;
    }
  }

  const profileHandler = handlerOf('GET', '/me/profile');
  if (profileHandler) {
    try {
      const data = await invoke<ProfileResult>(profileHandler, {
        path: '/me/profile',
        locale,
      });
      volunteerId = data.profile.volunteerId;
    } catch (error) {
      if (!isAppError(error)) throw error;
    }
  }

  const pending = apps.items.filter(
    (a) => a.status !== 'REJECTED' && a.status !== 'WITHDRAWN' && a.status !== 'NO_SHOW',
  ).length;

  // 4. My organizations (page 1, latest 5) + admin sections from the roles —
  //    both degrade to empty rather than failing the page.
  let orgs: OrgsResult = { items: [], meta: { page: 1, limit: 5, total: 0, totalPages: 0 } };
  const orgsHandler = handlerOf('GET', '/me/organizations');
  if (orgsHandler) {
    try {
      orgs = await invoke<OrgsResult>(orgsHandler, {
        path: '/me/organizations',
        locale,
        query: { page: 1, limit: 5 },
      });
    } catch (error) {
      if (!isAppError(error)) throw error;
    }
  }
  // 5. BLADNA International passport stats — enrichment like the sections
  //    above: a missing handler or any AppError (no volunteer profile, org-only
  //    account) degrades to links only, never fabricated numbers.
  let internationalStats: InternationalPassportResult['passport']['stats'] | null = null;
  const intlPassportHandler = handlerOf('GET', '/international/passport');
  if (intlPassportHandler) {
    try {
      const data = await invoke<InternationalPassportResult>(intlPassportHandler, {
        path: '/international/passport',
        locale,
      });
      internationalStats = data.passport.stats;
    } catch (error) {
      if (!isAppError(error)) throw error;
    }
  }
  // 6. My support offers (spec §13 traceability) — enriches like the sections
  //    above: a missing handler or any AppError degrades to the empty state.
  let myOffers: MyOffersResult = {
    items: [],
    meta: { page: 1, limit: 5, total: 0, totalPages: 0 },
  };
  const offersHandler = handlerOf('GET', '/me/support-offers');
  if (offersHandler) {
    try {
      myOffers = await invoke<MyOffersResult>(offersHandler, {
        path: '/me/support-offers',
        locale,
        query: { page: 1, limit: 5 },
      });
    } catch (error) {
      if (!isAppError(error)) throw error;
    }
  }
  // 7. Personalized matching strip (P5) — same enrichment contract as the
  //    sections above: a missing handler or any AppError (no volunteer
  //    profile, org-only account) hides the strip entirely rather than
  //    degrading to fabricated matches. Top 3 only — the page holds the rest.
  let matching: MatchingItem[] | null = null;
  const matchingHandler = handlerOf('GET', '/me/recommendations');
  if (matchingHandler) {
    try {
      const data = await invoke<RecommendationsResult>(matchingHandler, {
        path: '/me/recommendations',
        locale,
        query: { limit: 3 },
      });
      matching = data.items;
    } catch (error) {
      if (!isAppError(error)) throw error;
    }
  }

  const adminSections = adminSectionsFor(session.user.roles);

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="rise space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 rtl:tracking-normal">
          {dict.dashboard.eyebrow}
        </p>
        <h1 className="text-3xl font-bold text-sand-900">
          {dict.dashboard.welcome}
          {locale === 'ar' ? '،' : ','} <bdi>{session.user.firstName}</bdi>
        </h1>
        <p className="text-sand-600">{dict.dashboard.title}</p>
        {/* P10/D6: honest live date under the greeting — the reference
            "Good Morning, … (date)" line; rendered from the request clock. */}
        <p className="text-sm text-sand-500">{formatDate(new Date(), locale)}</p>
        {!session.user.emailVerified ? (
          <Alert tone="warning" className="flex flex-wrap items-center gap-3">
            <span>{dict.dashboard.accountNotVerified}</span>
            <Link
              href={`/${locale}/verify-email`}
              className="font-semibold text-brand-700 hover:text-brand-800"
            >
              {dict.dashboard.verifyEmailCta}
            </Link>
          </Alert>
        ) : null}
      </header>

      <StatGrid
        className="rise [animation-delay:60ms]"
        items={[
          {
            key: 'id',
            label: dict.dashboard.statVolunteerId,
            value: volunteerId ?? '—',
            icon: <IdCardIcon className="size-4" />,
          },
          {
            key: 'hours',
            label: dict.dashboard.hours,
            value: String(stats?.verifiedHours ?? '—'),
            icon: <ClockIcon className="size-4" />,
          },
          {
            key: 'certificates',
            label: dict.dashboard.certificates,
            value: String(stats?.certificates ?? '—'),
            icon: <AwardIcon className="size-4" />,
          },
          {
            key: 'applications',
            label: dict.dashboard.applications,
            value: String(apps.meta.total),
            icon: <SendIcon className="size-4" />,
            // P10/D7: honest context — the same non-terminal count the
            // applications card badges; never a fabricated delta.
            hint: pending > 0 ? `${pending} ${dict.dashboard.statOpenHint}` : undefined,
          },
        ]}
      />

      {/* P10/D8 — two-zone dashboard: work surfaces on the left, a compact
          rail (links, orgs, administration) beside them at lg and stacked
          below it on narrow screens. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          {/* Personalized matching strip (P5) — top matches with their reasons
              visible; hidden only when the account has no volunteer profile. */}
          {matching ? <MatchingCard locale={locale} items={matching} /> : null}

          <Card className="rise p-6 [animation-delay:120ms]">
            <SectionHeading
              title={dict.dashboard.applications}
              action={
                <span className="flex items-center gap-3">
                  <Link
                    href={`/${locale}/applications`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
                  >
                    {dict.applications.title}
                    <ArrowRightIcon className="size-4 rtl:rotate-180" />
                  </Link>
                  {pending > 0 ? (
                    <Badge tone="warning" className="tabular-nums">
                      {pending}
                    </Badge>
                  ) : null}
                </span>
              }
            />
            {apps.items.length === 0 ? (
              <EmptyState className="mt-4">
                <InboxIcon className="mx-auto size-8 text-sand-400" />
                <p className="mt-2 font-medium text-sand-600">{dict.dashboard.noApplications}</p>
                <Link
                  href={`/${locale}/opportunities`}
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800"
                >
                  {dict.nav.opportunities}
                  <ArrowRightIcon className="size-4 rtl:rotate-180" />
                </Link>
              </EmptyState>
            ) : (
              <ul className="mt-4 divide-y divide-sand-100">
                {apps.items.map((application) => (
                  <li
                    key={application.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/${locale}/opportunities/${application.opportunity.slug}`}
                        className="block truncate font-medium text-sand-900 hover:text-brand-700"
                      >
                        {titleFor(application.opportunity, locale)}
                      </Link>
                      <p className="text-sm text-sand-500">
                        <bdi>{application.opportunity.organization.name}</bdi> ·{' '}
                        <bdi>{formatDate(application.submittedAt, locale)}</bdi>
                      </p>
                    </div>
                    <StatusBadge
                      data-testid="application-status"
                      className="shrink-0"
                      status={application.status}
                      label={dict.statuses[application.status] ?? application.status}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* My support offers — initiative-level support I already offered (§13). */}
          <Card className="rise p-6 [animation-delay:180ms]">
            <SectionHeading title={dict.dashboard.supportOffersTitle} />
            {myOffers.items.length === 0 ? (
              <EmptyState className="mt-4">
                <HandshakeIcon className="mx-auto size-8 text-sand-400" />
                <p className="mt-2 font-medium text-sand-600">{dict.dashboard.noSupportOffers}</p>
                <Link
                  href={`/${locale}/opportunities?needs=ANY`}
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800"
                >
                  {dict.nav.opportunities}
                  <ArrowRightIcon className="size-4 rtl:rotate-180" />
                </Link>
              </EmptyState>
            ) : (
              <ul className="mt-4 divide-y divide-sand-100">
                {myOffers.items.map((offer) => (
                  <li
                    key={offer.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/${locale}/opportunities/${offer.initiative.slug}`}
                        className="block truncate font-medium text-sand-900 hover:text-brand-700"
                      >
                        {titleFor(offer.initiative, locale)}
                      </Link>
                      <p className="text-sm text-sand-500">
                        {needLabelFor(offer.need, locale)} ·{' '}
                        {dict.opportunity.needKinds[offer.need.kind]}
                        {offer.amount != null
                          ? ` · ${Number(offer.amount).toLocaleString(locale)} ${offer.currency ?? 'DZD'}`
                          : ''}
                        {offer.quantity != null ? ` · ×${offer.quantity}` : ''} ·{' '}
                        <bdi>{formatDate(offer.createdAt, locale)}</bdi>
                      </p>
                    </div>
                    <StatusBadge
                      className="shrink-0"
                      status={offer.status}
                      label={dict.initiativeConsole.offerStatuses[offer.status]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-8">
          {/* My organizations — billing is one click away per membership. */}
          <Card className="rise space-y-1 p-6 [animation-delay:240ms]">
            <SectionHeading
              title={dict.dashboard.organizationsTitle}
              action={
                orgs.items.length > 0 ? (
                  <Link
                    href={`/${locale}/billing`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:text-brand-800"
                  >
                    {dict.nav.billing}
                    <ArrowRightIcon className="size-4 rtl:rotate-180" />
                  </Link>
                ) : null
              }
            />
            <p className="text-sm text-sand-500">{dict.dashboard.myOrganizations}</p>
            {orgs.items.length === 0 ? (
              <EmptyState className="mt-3">
                <BuildingIcon className="mx-auto size-8 text-sand-400" />
                <p className="mt-2 font-medium text-sand-600">{dict.dashboard.noOrganizations}</p>
                <Link
                  href={`/${locale}/workspace`}
                  className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800"
                >
                  {dict.dashboard.createOrganization}
                  <ArrowRightIcon className="size-4 rtl:rotate-180" />
                </Link>
              </EmptyState>
            ) : (
              <ul className="mt-3 divide-y divide-sand-100">
                {orgs.items.map((row) => (
                  <li
                    key={row.organization.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <Link
                      href={`/${locale}/billing?org=${encodeURIComponent(row.organization.id)}`}
                      className="min-w-0 truncate font-medium text-sand-900 hover:text-brand-700"
                    >
                      {row.organization.name}
                    </Link>
                    <Badge tone="neutral" className="shrink-0">
                      {(dict.billing.memberRoles as Record<string, string>)[row.role] ?? row.role}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Administration — only when a granted section actually exists. */}
          {adminSections.length > 0 ? (
            <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <h2 className="text-lg font-semibold text-sand-900">{dict.dashboard.adminTitle}</h2>
                <p className="text-sm text-sand-600">{dict.dashboard.adminSubtitle}</p>
              </div>
              <Link
                href={`/${locale}/admin`}
                className={`${buttonClasses()} inline-flex items-center gap-2`}
              >
                {dict.admin.title}
                <ArrowRightIcon className="size-4 rtl:rotate-180" />
              </Link>
            </Card>
          ) : null}

          <section className="space-y-4">
            <SectionHeading title={dict.dashboard.quickLinksTitle} />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
              <QuickLink
                href={`/${locale}/opportunities`}
                label={dict.nav.opportunities}
                icon={<CompassIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/applications`}
                label={dict.applications.title}
                icon={<SendIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/saved`}
                label={dict.saved.title}
                icon={<BookmarkIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/notifications`}
                label={dict.inbox.title}
                icon={<BellIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/profile`}
                label={dict.profile.title}
                icon={<UserRoundIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/workspace`}
                label={dict.workspace.title}
                icon={<BuildingIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/sponsor`}
                label={dict.sponsorConsole.title}
                icon={<HeartIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/check-in`}
                label={dict.checkin.title}
                icon={<QrCodeIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/verify`}
                label={dict.landing.verifyTitle}
                icon={<ShieldCheckIcon className="size-4" />}
              />
              <QuickLink
                href={`/${locale}/verify-email`}
                label={dict.dashboard.verifyEmailCta}
                icon={<MailIcon className="size-4" />}
              />
            </div>
          </section>

          {/* BLADNA International — demoted to a compact secondary section (spec §58):
          honest passport stats; degrades to links only. */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sand-100 bg-sand-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-sand-600">
              <span className="font-semibold text-sand-800">
                {dict.international.dashboardTitle}
              </span>
              {internationalStats ? (
                <>
                  <span>
                    {dict.international.countriesVisited}: {internationalStats.countries}
                  </span>
                  <span>
                    {dict.international.programsLabel}: {internationalStats.programs}
                  </span>
                  <span>
                    {dict.international.verifiedHoursLabel}: {internationalStats.verifiedHours}
                  </span>
                </>
              ) : null}
            </div>
            <span className="flex flex-wrap items-center gap-3 text-sm font-semibold">
              <Link
                href={`/${locale}/international/passport`}
                className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
              >
                {dict.international.viewPassport}
                <ArrowRightIcon className="size-4 rtl:rotate-180" />
              </Link>
              <Link
                href={`/${locale}/international/applications`}
                className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
              >
                {dict.international.applicationsTitle}
                <ArrowRightIcon className="size-4 rtl:rotate-180" />
              </Link>
              <Link
                href={`/${locale}/international`}
                className="inline-flex items-center gap-1 text-brand-700 hover:text-brand-800"
              >
                {dict.international.title}
                <ArrowRightIcon className="size-4 rtl:rotate-180" />
              </Link>
            </span>
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * Bento quick-link tile: icon chip + label, the whole tile is one target.
 * The icon is decorative — the label is both the visible copy and the
 * accessible name — and the glyphs are direction-neutral, so RTL flows with
 * no mirroring (label follows the chip in reading order either way).
 */
function QuickLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-sand-200 bg-white px-4 py-3 text-sm font-semibold text-sand-700 shadow-sm transition-[border-color,color,box-shadow,transform] motion-safe:hover:-translate-y-px hover:border-brand-300 hover:text-brand-700 hover:shadow-md"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
      >
        {icon}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </Link>
  );
}
