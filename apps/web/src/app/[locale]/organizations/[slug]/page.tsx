import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError, type CampaignStatus, type OrganizationType } from '@bladna/types';
import { Avatar, Badge, Card, EmptyState, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { StatusBadge } from '@/ui/status';
import { nameFor, type OpportunityListItem, type PlaceRef } from '@/ui/opportunity';
import { InitiativeCard } from '@/ui/components/initiative-card';
import { PageMasthead } from '@/ui/components/page-masthead';
import { StatGrid } from '@/ui/components/stat-grid';
import {
  ChevronLeftIcon,
  HeartIcon,
  MapPinIcon,
  TargetIcon,
  UsersIcon,
} from '@/ui/components/icons';
import { directory } from '@/server/modules/organizations';
import { discover } from '@/server/modules/opportunities';
import { publicList as listCampaigns } from '@/server/modules/campaigns';
import { invoke } from '@/server/ssr';

export const dynamic = 'force-dynamic';

/** Mirrors the `slug` filter on orgDirectorySchema (trim, 1–120). */
const MAX_SLUG = 120;

interface OrgPublicRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo: string | null;
  coverImage: string | null;
  organizationType: OrganizationType;
  verificationStatus: string;
  trustLevel: string;
  verifiedAt: string | null;
  createdAt: string;
  wilaya: PlaceRef | null;
  city: PlaceRef | null;
  /** Opted-in members only (ORG_PUBLIC_SELECT guards `publicProfile`). */
  members: Array<{
    role: string;
    user: { firstName: string; lastName: string; profileImage: string | null };
  }>;
  _count: { members: number; opportunities: number };
}

interface DirectoryResult {
  items: OrgPublicRow[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface DiscoverResult {
  items: OpportunityListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Public campaign rows as returned by GET /campaigns (CAMPAIGN_LIST_SELECT). */
interface OrgCampaignItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  startDate: string;
  endDate: string | null;
  status: CampaignStatus;
  volunteerTarget: number | null;
  _count: { participants: number; opportunities: number };
}

interface CampaignsResult {
  items: OrgCampaignItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

async function fetchBySlug(
  slug: string,
  locale?: string,
  withCookies = true,
): Promise<OrgPublicRow | null> {
  const data = await invoke<DirectoryResult>(directory, {
    path: '/organizations',
    ...(locale ? { locale } : {}),
    query: { slug, limit: 1 },
    withCookies,
  });
  return data.items[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  try {
    if (!slug || slug.length > MAX_SLUG) throw new Error('invalid slug');
    const row = await fetchBySlug(slug, locale);
    if (!row) return { title: dict.organizations.title, description: dict.organizations.subtitle };
    return { title: row.name, description: row.description ?? dict.organizations.subtitle };
  } catch {
    return { title: dict.organizations.title, description: dict.organizations.subtitle };
  }
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  if (!slug || slug.length > MAX_SLUG) notFound();
  const { dict } = getDictionary(locale);

  let row: OrgPublicRow | null;
  try {
    row = await fetchBySlug(slug, locale, false);
  } catch (error) {
    if (isAppError(error) && error.code === 'VALIDATION_ERROR') notFound();
    throw error;
  }
  if (!row) notFound();

  // Optional enrichment: both queries support an `organizationId` filter —
  // degrade to no teaser rows (and no stat figure) if they ever fail.
  let opportunities: OpportunityListItem[] = [];
  try {
    const data = await invoke<DiscoverResult>(discover, {
      path: '/opportunities',
      locale,
      query: { organizationId: row.id, limit: 4, sort: 'recent' },
      withCookies: false,
    });
    opportunities = data.items;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  let campaigns: OrgCampaignItem[] = [];
  let campaignTotal = 0;
  try {
    const data = await invoke<CampaignsResult>(listCampaigns, {
      path: '/campaigns',
      locale,
      query: { organizationId: row.id, limit: 4 },
      withCookies: false,
    });
    campaigns = data.items;
    campaignTotal = data.meta.total;
  } catch (error) {
    if (!isAppError(error)) throw error;
  }

  const verified = row.verificationStatus === 'VERIFIED';
  const location = [nameFor(row.city, locale), nameFor(row.wilaya, locale)]
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index)
    .join(' · ');

  return (
    <>
      {/* P28 — the profile header (back link → badges → contact/report →
          avatar + name + location) opens on the dark page-masthead band; the
          cover photo and everything else follow on the white side. */}
      <PageMasthead inner="mx-auto max-w-6xl px-4 py-10">
        {/* Back to the directory — mirrored chevron (DESIGN.md §4). */}
        <Link
          href={`/${locale}/organizations`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-200 hover:text-white"
        >
          <ChevronLeftIcon className="size-4 rtl:rotate-180" />
          {dict.organizations.allOrganizations}
        </Link>

        <header className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{dict.organizations.types[row.organizationType] ?? row.organizationType}</Badge>
            {verified ? <Badge tone="success">{dict.common.verified}</Badge> : null}
            {/* Message (P23) — the profile's own contact entry: the link carries
              ?org= (+ the display name) and the sign-in bounce keeps it, so an
              anonymous visitor lands on an addressed compose form. */}
            <Link
              href={`/${locale}/messages?org=${row.id}&name=${encodeURIComponent(row.name)}`}
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
            >
              {dict.common.message}
            </Link>
            {/* Report (P20) — prefills the safety form with this profile's own
              link, so the reporter never looks for a target id. */}
            <Link
              href={`/${locale}/safety?target=${encodeURIComponent(
                `/${locale}/organizations/${slug}`,
              )}`}
              className="text-sm font-medium text-clay-300 underline hover:text-white"
            >
              {dict.common.report}
            </Link>
          </div>
          <div className="mt-3 flex items-center gap-4">
            <Avatar size="lg" aria-hidden src={row.logo ?? undefined}>
              {row.name.slice(0, 1)}
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold">{row.name}</h1>
              {location ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-200">
                  <MapPinIcon className="size-3.5 shrink-0 text-brand-200" />
                  {location}
                </p>
              ) : null}
            </div>
          </div>
        </header>
      </PageMasthead>

      <div className="mx-auto max-w-6xl px-4 pb-10">
        {/* Cover band — the tenant's published image (decorative; §7: photos
          never carry information the h1/location don't already state). */}
        {row.coverImage ? (
          <div
            data-testid="org-cover"
            className="mt-6 h-44 overflow-hidden rounded-xl border border-sand-200 bg-sand-100 sm:h-56"
          >
            <img src={row.coverImage} alt="" className="size-full object-cover" loading="lazy" />
          </div>
        ) : null}

        {/* At-a-glance panel — one hairline shell (DESIGN §5), honest figures
          straight from the directory counts + the public campaign total. */}
        <StatGrid
          className="mt-6"
          columns={3}
          items={[
            {
              key: 'members',
              label: dict.organizations.members,
              value: formatNumber(row._count.members, locale),
              icon: <UsersIcon className="size-4" />,
            },
            {
              key: 'opportunities',
              label: dict.organizations.opportunities,
              value: formatNumber(row._count.opportunities, locale),
              icon: <TargetIcon className="size-4" />,
            },
            {
              key: 'campaigns',
              label: dict.organizations.campaigns,
              value: formatNumber(campaignTotal, locale),
              icon: <HeartIcon className="size-4" />,
            },
          ]}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-8 lg:col-span-2">
            {row.description ? (
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-sand-900">
                  {dict.organizations.aboutTitle}
                </h2>
                <p className="mt-3 whitespace-pre-line leading-relaxed text-sand-700">
                  {row.description}
                </p>
              </Card>
            ) : null}

            {/* Opportunities — the shared result card, minus the redundant
              byline (this IS the organization's own page). */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-sand-900">
                  {dict.organizations.opportunities}
                </h2>
                <Link
                  href={`/${locale}/opportunities?organizationId=${encodeURIComponent(row.id)}`}
                  className="text-sm font-medium text-brand-700 hover:text-brand-800"
                >
                  {dict.organizations.viewOpportunities} →
                </Link>
              </div>
              {opportunities.length === 0 ? (
                <EmptyState className="mt-3">{dict.organizations.noOpportunities}</EmptyState>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {opportunities.map((item) => (
                    <InitiativeCard
                      key={item.id}
                      locale={locale}
                      dict={dict}
                      item={item}
                      showOrganization={false}
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* Campaigns — public rows only (DRAFT never leaves the API). */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-sand-900">
                  {dict.organizations.campaigns}
                </h2>
                <Link
                  href={`/${locale}/campaigns`}
                  className="text-sm font-medium text-brand-700 hover:text-brand-800"
                >
                  {dict.organizations.viewCampaigns} →
                </Link>
              </div>
              {campaigns.length === 0 ? (
                <EmptyState className="mt-3">{dict.organizations.noCampaigns}</EmptyState>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {campaigns.map((campaign) => (
                    <Card as="li" key={campaign.id} className="flex h-full flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <StatusBadge
                          status={campaign.status}
                          label={dict.campaigns.statuses[campaign.status] ?? campaign.status}
                        />
                        <span className="text-xs text-sand-500">
                          {formatDate(campaign.startDate, locale)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold leading-snug text-sand-900">
                        <Link
                          href={`/${locale}/campaigns/${campaign.slug}`}
                          className="hover:text-brand-800"
                        >
                          {campaign.name}
                        </Link>
                      </h3>
                      {campaign.description ? (
                        <p className="mt-2 line-clamp-2 text-sm text-sand-600">
                          {campaign.description}
                        </p>
                      ) : null}
                      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 border-t border-sand-100 pt-3 text-xs text-sand-500">
                        <span>
                          {dict.common.startDate}: {formatDate(campaign.startDate, locale)}
                        </span>
                        <span className="tabular-nums">
                          {dict.campaigns.participants}:{' '}
                          {formatNumber(campaign._count.participants, locale)}
                        </span>
                        {campaign.volunteerTarget !== null ? (
                          <span className="tabular-nums">
                            {dict.campaigns.volunteersTarget}:{' '}
                            {formatNumber(campaign.volunteerTarget, locale)}
                          </span>
                        ) : null}
                      </div>
                    </Card>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Sidebar: facts */}
          <aside>
            <Card className="p-6">
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.common.type}</dt>
                  <dd className="text-end font-medium text-sand-800">
                    {dict.organizations.types[row.organizationType] ?? row.organizationType}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.organizations.trustLevel}</dt>
                  <dd className="text-end font-medium text-sand-800">
                    {(dict.workspace.verification.levels as Record<string, string>)[
                      row.trustLevel
                    ] ?? row.trustLevel}
                  </dd>
                </div>
                {verified ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-sand-500">{dict.organizations.verifiedSince}</dt>
                    <dd className="text-end font-medium text-sand-800">
                      {formatDate(row.verifiedAt ?? row.createdAt, locale)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.organizations.profileSince}</dt>
                  <dd className="text-end font-medium text-sand-800">
                    {formatDate(row.createdAt, locale)}
                  </dd>
                </div>
              </dl>
              {!verified ? (
                <p className="mt-4 text-sm text-sand-500">{dict.organizations.unverifiedNote}</p>
              ) : null}
            </Card>

            {/* Team — who stands behind the org: opted-in members with their
              role (ORG_PUBLIC_SELECT never exposes unconsented members); the
              honest total lives in the StatGrid above. */}
            {row.members.length > 0 ? (
              <Card className="mt-6 p-6">
                <h2 className="text-base font-semibold text-sand-900">
                  {dict.organizations.teamTitle}
                </h2>
                <ul className="mt-4 space-y-3">
                  {row.members.map((member, index) => {
                    const fullName = [member.user.firstName, member.user.lastName]
                      .filter(Boolean)
                      .join(' ');
                    const initials =
                      `${member.user.firstName?.[0] ?? ''}${member.user.lastName?.[0] ?? ''}`.toUpperCase();
                    return (
                      <li key={`${fullName}:${index}`} className="flex items-center gap-3">
                        <Avatar size="sm" aria-hidden src={member.user.profileImage ?? undefined}>
                          {initials || '?'}
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-sand-900">{fullName}</p>
                          <p className="truncate text-xs text-sand-500">
                            {(dict.organizations.memberRoles as Record<string, string>)[
                              member.role
                            ] ?? member.role}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {row._count.members > row.members.length ? (
                  <span className="mt-4 inline-flex min-h-8 items-center rounded-full bg-sand-100 px-3 text-xs font-semibold text-sand-600">
                    +{formatNumber(row._count.members - row.members.length, locale)}
                    <span className="sr-only"> {dict.organizations.members}</span>
                  </span>
                ) : null}
              </Card>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  );
}
