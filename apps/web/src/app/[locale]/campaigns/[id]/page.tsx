import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError, type CampaignStatus } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { type OpportunityListItem } from '@/ui/opportunity';
import { campaignRoutes } from '@/server/modules/campaigns';
import { discover } from '@/server/modules/opportunities';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { CampaignContribute } from '@/ui/components/campaign-contribute';
import { CampaignParticipant } from '@/ui/components/campaign-participant';
import { InitiativeCard } from '@/ui/components/initiative-card';
import { ProgressBar, campaignTiming } from '@/ui/components/campaign-meta';
import {
  CalendarIcon,
  CompassIcon,
  HeartIcon,
  SearchIcon,
  ShieldCheckIcon,
  TargetIcon,
  UsersIcon,
} from '@/ui/components/icons';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOW_ICONS = [UsersIcon, SearchIcon, HeartIcon] as const;

/** Look up the public detail handler from the campaigns route table. */
const DETAIL_HANDLER: Handler = (() => {
  const handler = campaignRoutes.find(
    (route) => route.method === 'GET' && route.path === '/campaigns/:id',
  )?.handler;
  if (!handler) throw new Error('Missing route handler for GET /campaigns/:id');
  return handler;
})();

/** Exactly the fields CAMPAIGN_DETAIL_SELECT returns (server/modules/campaigns.ts). */
interface CampaignDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  goal: string | null;
  startDate: string;
  endDate: string | null;
  status: CampaignStatus;
  volunteerTarget: number | null;
  hourTarget: number | null;
  beneficiaryTarget: number | null;
  budget: unknown;
  currency: string;
  coverImage: string | null;
  createdAt: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    verificationStatus: string;
    trustLevel: string;
  };
  _count: { participants: number; opportunities: number };
  organizationId: string;
  updatedAt: string;
}

/** `GET /campaigns/:id` funding block — aggregates only, never donor PII. */
interface CampaignFunding {
  confirmedAmount: number;
  confirmedCount: number;
  pendingAmount: number;
  pendingCount: number;
  budget: number | null;
  currency: string;
}

async function fetchCampaign(
  id: string,
  locale: string,
): Promise<{ campaign: CampaignDetail; funding: CampaignFunding }> {
  const data = await invoke<{ campaign: CampaignDetail; funding: CampaignFunding }>(
    DETAIL_HANDLER,
    {
      path: `/campaigns/${id}`,
      params: { id },
      locale,
      withCookies: false,
    },
  );
  return { campaign: data.campaign, funding: data.funding };
}

/** Related published opportunities linked to this campaign (teaser, ≤6). */
async function fetchRelated(id: string, locale: string): Promise<OpportunityListItem[]> {
  try {
    const result = await invoke<{ items: OpportunityListItem[] }>(discover, {
      path: '/opportunities',
      locale,
      query: { campaignId: id, sort: 'recent', page: 1, limit: 6 },
      withCookies: false,
    });
    return result.items;
  } catch {
    // The teaser is optional — an empty list hides the section instead of
    // taking the whole campaign page down.
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const { dict } = getDictionary(isLocale(locale) ? locale : undefined);
  try {
    if (!UUID_RE.test(id)) throw new Error('invalid id');
    const { campaign } = await fetchCampaign(id, isLocale(locale) ? locale : 'ar');
    return { title: campaign.name, description: campaign.description ?? dict.campaigns.subtitle };
  } catch {
    return { title: dict.campaigns.title, description: dict.campaigns.subtitle };
  }
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  if (!UUID_RE.test(id)) notFound();
  const { dict } = getDictionary(locale);

  let campaign: CampaignDetail;
  let funding: CampaignFunding;
  let related: OpportunityListItem[] = [];
  try {
    ({ campaign, funding } = await fetchCampaign(id, locale));
  } catch (error) {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')) {
      notFound();
    }
    throw error;
  }
  related = await fetchRelated(id, locale);
  const timing = campaignTiming(campaign.startDate, campaign.endDate, dict.campaigns, locale);
  const verified = campaign.organization.verificationStatus === 'VERIFIED';

  return (
    <>
      {/* Hero — the campaign's own cover under a deep brand gradient, so the
          name, organizer and timing read before anything else. */}
      <section className="relative overflow-hidden bg-brand-900 text-white">
        {campaign.coverImage ? (
          <img
            src={campaign.coverImage}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-40"
          />
        ) : null}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-brand-900 via-brand-900/85 to-brand-900/40"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-10 pb-12 md:pt-16">
          <nav aria-label={dict.meta.siteName} className="text-sm text-brand-100">
            <Link href={`/${locale}/campaigns`} className="hover:text-white">
              {dict.campaigns.title}
            </Link>
            <span aria-hidden className="mx-2">
              /
            </span>
            <span className="text-white">{campaign.name}</span>
          </nav>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <StatusBadge
              status={campaign.status}
              label={dict.campaigns.statuses[campaign.status] ?? campaign.status}
            />
            {timing.label ? (
              <span className="rounded-full bg-white/15 px-3 py-0.5 text-xs font-semibold backdrop-blur">
                {timing.label}
              </span>
            ) : null}
          </div>
          <h1
            dir="auto"
            className="mt-3 max-w-3xl text-start text-3xl font-bold leading-tight md:text-5xl"
          >
            {campaign.name}
          </h1>
          {campaign.description ? (
            <p
              dir="auto"
              className="mt-4 max-w-2xl text-start text-base leading-relaxed text-brand-50 md:text-lg"
            >
              {campaign.description}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-brand-100">
            <span className="inline-flex items-center gap-1.5">
              {verified ? <ShieldCheckIcon className="size-4 text-brand-300" /> : null}
              {dict.campaigns.organizedBy}{' '}
              <Link
                href={`/${locale}/organizations/${campaign.organization.slug}`}
                className="font-semibold text-white underline-offset-4 hover:underline"
              >
                {campaign.organization.name}
              </Link>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="size-4" />
              {formatDate(campaign.startDate, locale)}
              {campaign.endDate ? ` – ${formatDate(campaign.endDate, locale)}` : ''}
            </span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10">
        {/* Key figures — progress against the organizer's own targets. */}
        <dl className="-mt-16 relative grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            {
              icon: UsersIcon,
              label: dict.campaigns.participants,
              value: campaign._count.participants,
            },
            {
              icon: CompassIcon,
              label: dict.campaigns.initiatives,
              value: campaign._count.opportunities,
            },
            {
              icon: TargetIcon,
              label: dict.campaigns.beneficiariesTarget,
              value: campaign.beneficiaryTarget,
            },
            {
              icon: HeartIcon,
              label: dict.campaigns.raisedLabel,
              value: funding.confirmedAmount,
              suffix: ` ${funding.currency}`,
            },
          ].map(({ icon: Icon, label, value, suffix }) => (
            <div key={label} className="rounded-card border border-sand-200 bg-white p-4 shadow-sm">
              <dt className="flex items-center gap-2 text-xs font-medium text-sand-500">
                <Icon className="size-4 text-brand-600" />
                {label}
              </dt>
              <dd className="mt-2 text-2xl font-bold tabular-nums text-sand-900">
                {value === null ? '—' : formatNumber(value, locale)}
                {value !== null && suffix ? (
                  <span className="text-sm font-semibold text-sand-500">{suffix}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-6 lg:col-span-2">
            {/* How to take part — three numbered steps. */}
            <Card className="p-6">
              <h2 className="text-lg font-bold text-sand-900">{dict.campaigns.howToJoinTitle}</h2>
              <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {dict.campaigns.howToJoinSteps.map((step, i) => {
                  const Icon = HOW_ICONS[i] ?? HeartIcon;
                  return (
                    <li key={step.title} className="rounded-lg bg-brand-50/70 p-4">
                      <span className="relative grid size-11 place-items-center rounded-full bg-brand-700 text-white">
                        <Icon className="size-5" />
                        <span className="absolute -top-1 -end-1 grid size-5 place-items-center rounded-full bg-clay-500 text-[11px] font-bold">
                          {formatNumber(i + 1, locale)}
                        </span>
                      </span>
                      <span className="mt-3 block font-semibold text-sand-900">{step.title}</span>
                      <span className="mt-1 block text-sm leading-relaxed text-sand-600">
                        {step.body}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </Card>

            {campaign.goal ? (
              <Card className="p-6">
                <h2 className="text-lg font-bold text-sand-900">{dict.campaigns.aboutTitle}</h2>
                <div className="mt-3 flex gap-3 rounded-lg border-s-4 border-clay-400 bg-clay-50 p-4">
                  <TargetIcon className="mt-0.5 size-5 shrink-0 text-clay-600" />
                  <div>
                    <h3 className="text-sm font-semibold text-sand-800">
                      {dict.workspace.campaigns.goalLabel}
                    </h3>
                    <p dir="auto" className="mt-1 whitespace-pre-line text-start text-sand-700">
                      {campaign.goal}
                    </p>
                  </div>
                </div>
              </Card>
            ) : null}

            {/* Related initiatives — the campaign's actual field actions. */}
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-sand-900">
                  {dict.campaigns.relatedOpportunities}
                </h2>
                {related.length > 0 ? (
                  <Link
                    href={`/${locale}/opportunities?campaignId=${campaign.id}`}
                    className="text-sm font-semibold text-brand-700 hover:text-brand-800"
                  >
                    {dict.common.viewAll}
                  </Link>
                ) : null}
              </div>
              {related.length === 0 ? (
                <Card className="mt-3 p-6 text-sm text-sand-500">
                  {dict.campaigns.noRelatedOpportunities}
                </Card>
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {related.map((item) => (
                    <InitiativeCard key={item.id} locale={locale} dict={dict} item={item} />
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Sidebar: progress, participation and funding actions. */}
          <aside className="space-y-6">
            <Card className="space-y-5 p-6">
              <ProgressBar
                label={dict.campaigns.volunteersProgress}
                value={campaign._count.participants}
                target={campaign.volunteerTarget}
                locale={locale}
                copy={dict.campaigns}
              />
              <ProgressBar
                label={dict.campaigns.fundingProgress}
                value={funding.confirmedAmount}
                target={funding.budget}
                locale={locale}
                copy={dict.campaigns}
                unit={funding.currency}
                tone="clay"
              />
              <dl className="space-y-2 border-t border-sand-100 pt-4 text-sm">
                {campaign.hourTarget !== null ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-sand-500">{dict.campaigns.hoursTarget}</dt>
                    <dd className="font-semibold tabular-nums text-sand-800">
                      {formatNumber(Number(campaign.hourTarget), locale)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.campaigns.pendingLabel}</dt>
                  <dd className="font-semibold tabular-nums text-sand-800">
                    {formatNumber(funding.pendingAmount, locale)} {funding.currency}
                  </dd>
                </div>
              </dl>
            </Card>

            <CampaignParticipant
              locale={locale}
              campaignId={campaign.id}
              campaignStatus={campaign.status}
            />

            <Card className="p-6">
              <h2 className="text-base font-bold text-sand-900">{dict.campaigns.fundingTitle}</h2>
              <p className="mt-2 text-xs leading-relaxed text-sand-500">
                {dict.campaigns.bankTransferHint}
              </p>
              <CampaignContribute
                locale={locale}
                campaignId={campaign.id}
                campaignStatus={campaign.status}
                currency={funding.currency}
              />
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
