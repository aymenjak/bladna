import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Alert, Card, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { titleFor } from '@/ui/opportunity';
import { internationalRoutes } from '@/server/modules/international';
import type { Handler } from '@/server/http';
import { invoke } from '@/server/ssr';
import { ExperienceForm } from '@/ui/components/experience-form';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '@/server/cookies';
import { BenefitGrid } from '@/ui/international/benefit-grid';
import { EligibilityBox } from '@/ui/international/eligibility-box';
import { ShareButtons } from '@/ui/international/share-buttons';
import { SourceBadge } from '@/ui/international/source-badge';
import {
  ageRangeText,
  categoryLabelFor,
  isDeadlinePassed,
  isUuid,
  safeExternalUrl,
  textFor,
  type EligibilityCheck,
  type EligibilityResult,
  type InternationalOpportunityRow,
} from '@/ui/international/types';

export const dynamic = 'force-dynamic';

/** Look up the public detail handler from the international route table. */
const DETAIL_HANDLER: Handler = (() => {
  const handler = internationalRoutes.find(
    (route) => route.method === 'GET' && route.path === '/international/opportunities/:id',
  )?.handler;
  if (!handler) throw new Error('Missing route handler for GET /international/opportunities/:id');
  return handler;
})();

/** Ancillary handlers (§11 eligibility) are optional — absent → gracefully omitted. */
function handlerOf(method: string, path: string): Handler | null {
  const route = internationalRoutes.find((r) => r.method === method && r.path === path);
  return route?.handler ?? null;
}

/** Public international opportunity row (OPPORTUNITY_PUBLIC_SELECT + §5 fields). */
type InternationalDetail = InternationalOpportunityRow;

async function fetchOffer(id: string, locale: string): Promise<InternationalDetail> {
  const data = await invoke<{ opportunity: InternationalDetail }>(DETAIL_HANDLER, {
    path: `/international/opportunities/${id}`,
    params: { id },
    locale,
    withCookies: false,
  });
  return data.opportunity;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const resolved = isLocale(locale) ? locale : undefined;
  const { dict } = getDictionary(resolved);
  try {
    if (!isUuid(id)) throw new Error('invalid id');
    const offer = await fetchOffer(id, resolved ?? 'ar');
    const excerpt = textFor(
      resolved ?? 'ar',
      offer.descriptionAr,
      offer.descriptionFr,
      offer.descriptionEn,
    );
    return {
      title: titleFor(offer, resolved ?? 'ar') || offer.program,
      description: excerpt ?? dict.international.subtitle,
    };
  } catch {
    return { title: dict.international.title, description: dict.international.subtitle };
  }
}

export default async function InternationalDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!isLocale(locale)) notFound();
  if (!isUuid(id)) notFound();
  const { dict } = getDictionary(locale);
  const jar = await cookies();
  const signedIn = jar.has(ACCESS_COOKIE) || jar.has(REFRESH_COOKIE);

  let offer: InternationalDetail;
  try {
    offer = await fetchOffer(id, locale);
  } catch (error) {
    if (isAppError(error) && (error.code === 'NOT_FOUND' || error.code === 'VALIDATION_ERROR')) {
      notFound();
    }
    throw error;
  }

  // Personalized eligibility (§11): only answered for signed-in visitors;
  // anonymous (UNAUTHORIZED/MFA) shows the sign-in hint, other failures and a
  // missing route simply omit the box — the offer page still renders.
  let eligibilityChecks: EligibilityCheck[] | null = null;
  let anonymous = false;
  const eligibilityHandler = handlerOf('GET', '/international/opportunities/:id/eligibility');
  if (eligibilityHandler) {
    try {
      const data = await invoke<{ eligibility: EligibilityResult }>(eligibilityHandler, {
        path: `/international/opportunities/${id}/eligibility`,
        params: { id },
        locale,
      });
      eligibilityChecks = data.eligibility.checks;
    } catch (error) {
      if (isAppError(error) && (error.code === 'UNAUTHORIZED' || error.code === 'MFA_REQUIRED')) {
        anonymous = true;
      }
    }
  }

  const excerpt = textFor(locale, offer.descriptionAr, offer.descriptionFr, offer.descriptionEn);
  const applyUrl = safeExternalUrl(offer.sourceUrl);
  const closed = isDeadlinePassed(offer.deadline);
  const categoryLabel = categoryLabelFor(dict, offer.category);
  const ageRange = ageRangeText(offer);
  const nextParam = encodeURIComponent(`/${locale}/international/${id}`);
  const signInHref = `/${locale}/login?next=${nextParam}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-xs font-medium text-sand-700">
            {offer.program}
          </span>
          {categoryLabel ? (
            <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-800">
              {categoryLabel}
            </span>
          ) : null}
          <SourceBadge
            locale={locale}
            sourceType={offer.sourceType}
            verificationStatus={offer.verificationStatus}
          />
        </div>
        <h1 className="mt-3 text-3xl font-bold text-sand-900">
          {titleFor(offer, locale) || offer.program}
        </h1>
        <p className="mt-1 text-sm text-sand-600">
          {dict.international.provider}: {offer.provider}
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-8 lg:col-span-2">
          {excerpt ? (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-sand-900">
                {dict.international.aboutTitle}
              </h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-sand-700">{excerpt}</p>
            </Card>
          ) : null}

          {offer.eligibility ? (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-sand-900">
                {dict.international.eligibility}
              </h2>
              <p
                dir="auto"
                className="mt-3 whitespace-pre-line text-start leading-relaxed text-sand-700"
              >
                {offer.eligibility}
              </p>
            </Card>
          ) : null}

          <BenefitGrid locale={locale} offer={offer} />
        </div>

        {/* Sidebar: facts + eligibility + apply */}
        <aside className="space-y-6">
          <Card className="p-6">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">{dict.international.program}</dt>
                <dd dir="auto" className="font-medium text-sand-800">
                  {offer.program}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-sand-500">{dict.international.provider}</dt>
                <dd dir="auto" className="font-medium text-sand-800">
                  {offer.provider}
                </dd>
              </div>
              {categoryLabel ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.filtersCategory}</dt>
                  <dd dir="auto" className="font-medium text-sand-800">
                    {categoryLabel}
                  </dd>
                </div>
              ) : null}
              {offer.city ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.cityLabel}</dt>
                  <dd dir="auto" className="font-medium text-sand-800">
                    {offer.city}
                  </dd>
                </div>
              ) : null}
              {offer.region ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.regionLabel}</dt>
                  <dd dir="auto" className="font-medium text-sand-800">
                    {offer.region}
                  </dd>
                </div>
              ) : null}
              {offer.duration ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.duration}</dt>
                  <dd dir="auto" className="font-medium text-sand-800">
                    {offer.duration}
                  </dd>
                </div>
              ) : null}
              {offer.startDate ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.startDateLabel}</dt>
                  <dd dir="auto" className="font-medium text-sand-800">
                    {formatDate(offer.startDate, locale)}
                  </dd>
                </div>
              ) : null}
              {offer.endDate ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.endDateLabel}</dt>
                  <dd dir="auto" className="font-medium text-sand-800">
                    {formatDate(offer.endDate, locale)}
                  </dd>
                </div>
              ) : null}
              {offer.deadline ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.deadlineLabel}</dt>
                  <dd dir="auto" className="font-medium text-sand-800">
                    {formatDate(offer.deadline, locale)}
                  </dd>
                </div>
              ) : null}
              {ageRange ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.ageRangeLabel}</dt>
                  <dd dir="auto" className="font-medium text-sand-800">
                    {ageRange}
                  </dd>
                </div>
              ) : null}
              {offer.skills ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.skillsLabel}</dt>
                  <dd dir="auto" className="ltr:text-right rtl:text-left font-medium text-sand-800">
                    {offer.skills}
                  </dd>
                </div>
              ) : null}
              {offer.languageRequirements ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.languagesLabel}</dt>
                  <dd dir="auto" className="ltr:text-right rtl:text-left font-medium text-sand-800">
                    {offer.languageRequirements}
                  </dd>
                </div>
              ) : null}
              {offer.ageRequirements ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-sand-500">{dict.international.requirementsLabel}</dt>
                  <dd dir="auto" className="ltr:text-right rtl:text-left font-medium text-sand-800">
                    {offer.ageRequirements}
                  </dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {/* Personalized eligibility for signed-in visitors. */}
          {eligibilityChecks ? (
            <EligibilityBox locale={locale} checks={eligibilityChecks} />
          ) : anonymous ? (
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-6">
              <p className="text-sm text-sand-700">{dict.international.applyNeedProfile}</p>
              <Link href={signInHref} className={buttonClasses({ className: 'mt-3' })}>
                {dict.common.signIn}
              </Link>
            </div>
          ) : null}

          {closed ? (
            <Alert tone="warning">{dict.international.applyClosed}</Alert>
          ) : (
            <div className="space-y-3">
              <Link href={`/${locale}/international/apply/${offer.id}`} className={buttonClasses()}>
                {dict.common.applyNow}
              </Link>
              {applyUrl ? (
                <a
                  href={applyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-700 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                >
                  {dict.international.applyLink} ↗
                </a>
              ) : null}
            </div>
          )}

          {/* Share + report (report goes to the platform report form on /safety). */}
          <Card className="p-6">
            <ShareButtons locale={locale} />
            <p className="mt-3">
              <Link
                href={`/${locale}/safety`}
                className="text-sm font-medium text-brand-700 underline hover:text-brand-800"
              >
                {dict.international.reportLabel}
              </Link>
            </p>
          </Card>
        </aside>
      </div>

      {/* Self-declared experience sharing + the caller's own submissions —
          signed-in volunteers only (the form reads /international/experiences,
          which needs a session; visitors already get the sign-in card above). */}
      {signedIn ? (
        <div className="mt-10">
          <ExperienceForm locale={locale} />
        </div>
      ) : null}
    </div>
  );
}
