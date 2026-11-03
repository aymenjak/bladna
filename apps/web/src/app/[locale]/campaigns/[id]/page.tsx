import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError, type CampaignStatus } from '@bladna/types';
import { Card } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import { locationLineFor, titleFor, type OpportunityListItem } from '@/ui/opportunity';
import { campaignRoutes } from '@/server/modules/campaigns';
import { discover } from '@/server/modules/opportunities';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { CampaignContribute } from '@/ui/components/campaign-contribute';
import { CampaignParticipant } from '@/ui/components/campaign-participant';
import { StatusBadge } from '@/ui/status';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            status={campaign.status}
            label={dict.campaigns.statuses[campaign.status] ?? campaign.status}
          />
          {campaign.organization.verificationStatus === 'VERIFIED' ? (
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
              {dict.common.verified}
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 text-3xl font-bold text-sand-900">{campaign.name}</h1>
        <p className="mt-1 text-sm text-sand-600">
          {dict.common.organization}:{' '}
          {campaign.organization.slug ? (
            <Link
              href={`/${locale}/organizations/${campaign.organization.slug}`}
              className="font-semibold text-brand-700 hover:text-brand-800"
            >
              {campaign.organization.name}
            </Link>
          ) : (
            <span className="font-semibold text-sand-800">{campaign.organization.name}</span>
          )}
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-8 lg:col-span-2">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-sand-900">{dict.campaigns.aboutTitle}</h2>
            {campaign.description ? (
              <p className="mt-3 whitespace-pre-line leading-relaxed text-sand-700">
                {campaign.description}
              </p>
            ) : null}
            {campaign.goal ? (
              <div className="mt-4 border-t border-sand-100 pt-4">
                <h3 className="text-sm font-semibold text-sand-800">
                  {dict.workspace.campaigns.goalLabel}
                </h3>
                <p className="mt-1 whitespace-pre-line text-sand-700">{campaign.goal}</p>
              </div>
            ) : null}
          </Card>

          {/* Funding — honest bank-transfer totals; the platform records
              pledges, the organization confirms them (no gateway, no refunds). */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-sand-900">{dict.campaigns.fundingTitle}</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
              <div className="rounded-lg bg-sand-50 p-3">
                <dt className="text-sand-500">{dict.campaigns.raisedLabel}</dt>
                <dd className="mt-1 text-lg font-semibold text-sand-900">
                  {formatNumber(funding.confirmedAmount, locale)} {funding.currency}
                  <span className="ms-2 text-xs font-normal text-sand-500">
                    ({formatNumber(funding.confirmedCount, locale)})
                  </span>
                </dd>
              </div>
              <div className="rounded-lg bg-sand-50 p-3">
                <dt className="text-sand-500">{dict.campaigns.pendingLabel}</dt>
                <dd className="mt-1 text-lg font-semibold text-sand-900">
                  {formatNumber(funding.pendingAmount, locale)} {funding.currency}
                  <span className="ms-2 text-xs font-normal text-sand-500">
                    ({formatNumber(funding.pendingCount, locale)})
                  </span>
                </dd>
              </div>
              {funding.budget !== null ? (
                <div className="rounded-lg bg-sand-50 p-3">
                  <dt className="text-sand-500">{dict.workspace.campaigns.budgetLabel}</dt>
                  <dd className="mt-1 text-lg font-semibold text-sand-900">
                    {formatNumber(funding.budget, locale)} {funding.currency}
                  </dd>
                </div>
              ) : null}
            </dl>
            <p className="mt-3 text-xs text-sand-500">{dict.campaigns.bankTransferHint}</p>
            <CampaignContribute
              locale={locale}
              campaignId={campaign.id}
              campaignStatus={campaign.status}
              currency={funding.currency}
            />
          </Card>

          {/* Related opportunities — every published opportunity linked to
              this campaign, with a "view all" deep link into the filter. */}
          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-sand-900">
                {dict.campaigns.relatedOpportunities}
              </h2>
              <Link
                href={`/${locale}/opportunities?campaignId=${campaign.id}`}
                className="text-sm font-medium text-brand-700 hover:text-brand-800"
              >
                {dict.common.viewAll}
              </Link>
            </div>
            {related.length === 0 ? (
              <p className="mt-3 text-sm text-sand-500">{dict.campaigns.noRelatedOpportunities}</p>
            ) : (
              <ul className="mt-3 divide-y divide-sand-100">
                {related.map((item) => (
                  <li key={item.id} className="py-3">
                    <Link
                      href={`/${locale}/opportunities/${item.slug}`}
                      className="flex min-h-11 items-center rounded-lg px-2 hover:bg-sand-50"
                    >
                      <p className="font-medium text-sand-900">{titleFor(item, locale)}</p>
                      {locationLineFor(item, locale) ? (
                        <p className="mt-0.5 text-sm text-sand-600">
                          {locationLineFor(item, locale)}
                        </p>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Sidebar: dates, targets, participation */}
        <aside className="space-y-6">
          <Card className="p-6">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">{dict.common.startDate}</dt>
                <dd className="font-medium text-sand-800">
                  {formatDate(campaign.startDate, locale)}
                </dd>
              </div>
              {campaign.endDate ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.common.endDate}</dt>
                  <dd className="font-medium text-sand-800">
                    {formatDate(campaign.endDate, locale)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">{dict.campaigns.participants}</dt>
                <dd className="font-medium text-sand-800">{campaign._count.participants}</dd>
              </div>
              {campaign.volunteerTarget !== null ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.campaigns.volunteersTarget}</dt>
                  <dd className="font-medium text-sand-800">{campaign.volunteerTarget}</dd>
                </div>
              ) : null}
              {campaign.hourTarget !== null ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.campaigns.hoursTarget}</dt>
                  <dd className="font-medium text-sand-800">{campaign.hourTarget}</dd>
                </div>
              ) : null}
              {campaign.beneficiaryTarget !== null ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.campaigns.beneficiariesTarget}</dt>
                  <dd className="font-medium text-sand-800">{campaign.beneficiaryTarget}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          <CampaignParticipant
            locale={locale}
            campaignId={campaign.id}
            campaignStatus={campaign.status}
          />
        </aside>
      </div>
    </div>
  );
}
