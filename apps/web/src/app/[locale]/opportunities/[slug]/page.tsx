import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Avatar, Badge, Card, EmptyState, buttonClasses } from '@bladna/ui';
import { getDictionary, isLocale } from '@/ui/i18n';
import { formatDate, formatNumber } from '@/ui/format';
import {
  categoryNameFor,
  descriptionFor,
  locationLineFor,
  locationTypeLabelFor,
  nameFor,
  optionalNarrativeFor,
  requirementLabelFor,
  titleFor,
  typeLabelFor,
  type OpportunityDetail,
  type ReviewsPayload,
} from '@/ui/opportunity';
import { detail as detailOpportunity } from '@/server/modules/opportunities';
import { list as listReviews } from '@/server/modules/reviews';
import { me as meHandler } from '@/server/modules/auth';
import { invoke } from '@/server/ssr';
import { ApplyForm } from '@/ui/components/apply-form';
import { ApplyViewTracker } from '@/ui/components/apply-view-tracker';
import { InitiativeSupport } from '@/ui/components/initiative-support';
import { PageMasthead } from '@/ui/components/page-masthead';
import { ImpactMetricCard } from '@/ui/components/impact-metric-card';
import { ReviewsSection } from '@/ui/components/reviews-section';
import { SaveButton } from '@/ui/components/save-button';
import { SectionHeading } from '@/ui/components/section-heading';
import {
  CalendarIcon,
  ChevronLeftIcon,
  ClockIcon,
  EyeIcon,
  MapPinIcon,
  UsersIcon,
} from '@/ui/components/icons';

export const dynamic = 'force-dynamic';

interface MeResult {
  user: { emailVerified: boolean };
  mfaRequired: boolean;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const resolved = isLocale(locale) ? locale : undefined;
  try {
    const { opportunity } = await invoke<{ opportunity: OpportunityDetail }>(detailOpportunity, {
      path: `/opportunities/${slug}`,
      params: { slug },
      locale: locale,
      withCookies: false,
    });
    return { title: titleFor(opportunity, resolved ?? 'ar') };
  } catch {
    const { dict } = getDictionary(resolved);
    return { title: dict.nav.opportunities };
  }
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();

  let opportunity: OpportunityDetail;
  try {
    const data = await invoke<{ opportunity: OpportunityDetail }>(detailOpportunity, {
      path: `/opportunities/${slug}`,
      params: { slug },
      locale,
      withCookies: false,
    });
    opportunity = data.opportunity;
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const { dict } = getDictionary(locale);

  // Session state decides which variant of the apply panel to render.
  let auth: { kind: 'anonymous' } | { kind: 'needs-email' } | { kind: 'ready' } = {
    kind: 'anonymous',
  };
  try {
    const session = await invoke<MeResult>(meHandler, { path: '/auth/me', locale });
    auth = session.user.emailVerified ? { kind: 'ready' } : { kind: 'needs-email' };
  } catch {
    auth = { kind: 'anonymous' };
  }

  // Reviews & ratings (P24): one viewer-aware server round trip — the list and
  // rating stats for everyone, plus (through the forwarded cookies) the
  // caller's eligibility and their own review as edit/delete anchors.
  let reviews: ReviewsPayload = {
    items: [],
    meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    stats: { count: 0, average: 0, distribution: [0, 0, 0, 0, 0] },
    viewer: { authenticated: false, eligible: false, eligibility: null, review: null },
  };
  try {
    reviews = await invoke<ReviewsPayload>(listReviews, {
      path: `/opportunities/${slug}/reviews`,
      params: { slug },
      locale,
    });
  } catch {
    // Ratings must never take the detail page down — degrade to the empty state.
  }

  const location = locationLineFor(opportunity, locale);
  const category = categoryNameFor(opportunity.category, locale);
  const country = nameFor(opportunity.country, locale);
  const description = descriptionFor(opportunity, locale);
  const problem = optionalNarrativeFor(
    { ar: opportunity.problemAr, fr: opportunity.problemFr, en: opportunity.problemEn },
    locale,
  );
  const objective = optionalNarrativeFor(
    { ar: opportunity.objectiveAr, fr: opportunity.objectiveFr, en: opportunity.objectiveEn },
    locale,
  );
  const includedBenefits = opportunity.benefits.filter((benefit) => benefit.value === 'INCLUDED');
  const deadlinePassed =
    opportunity.applicationDeadline !== null &&
    new Date(opportunity.applicationDeadline).getTime() < Date.now();

  // Initiative-level contact, falling back to the organizer's own channel.
  const initiativeContact = Boolean(
    opportunity.contactName ?? opportunity.contactPhone ?? opportunity.contactEmail,
  );
  const organizerContact = Boolean(
    opportunity.organization.website ??
    opportunity.organization.officialEmail ??
    opportunity.organization.phone,
  );
  const hasCoords = opportunity.latitude !== null && opportunity.longitude !== null;
  const joined = opportunity.acceptedCount;
  const capacity = opportunity.capacity;

  // P23 — trust & contact before applying: the organizer's trust ladder in the
  // same public copy the organization profile renders, plus the in-platform
  // message entry (?org= — the sign-in bounce keeps the target).
  const trustLevels = dict.workspace.verification.levels as Record<string, string>;
  const trustLabel =
    trustLevels[opportunity.organization.trustLevel] ?? opportunity.organization.trustLevel;
  const trustTone =
    opportunity.organization.trustLevel === 'LEVEL_0_UNVERIFIED' ? 'neutral' : 'info';
  const messageHref = `/${locale}/messages?org=${opportunity.organization.id}&name=${encodeURIComponent(
    opportunity.organization.name,
  )}`;

  return (
    <>
      {/* P28 — the identity header (back link → badges → title → organizer →
          save/report) rides the same dark page-masthead band as the hubs. */}
      <PageMasthead inner="mx-auto max-w-6xl px-4 py-10">
        <ApplyViewTracker locale={locale} slug={slug} />

        <Link
          href={`/${locale}/opportunities`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-200 hover:text-white"
        >
          <ChevronLeftIcon className="size-4 rtl:rotate-180" />
          {dict.opportunity.backToList}
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="neutral">{typeLabelFor(opportunity.type, dict)}</Badge>
              {opportunity.organization.verificationStatus === 'VERIFIED' ? (
                <Badge tone="success">{dict.common.verified}</Badge>
              ) : null}
              {/* Trust ladder (P23) — always answers "how well do I know this
                organizer" before anyone starts an application. */}
              <Badge tone={trustTone}>{trustLabel}</Badge>
              {category ? <Badge tone="info">{category}</Badge> : null}
            </div>
            <h1 className="mt-3 text-3xl font-bold">{titleFor(opportunity, locale)}</h1>
            {/* Organizer identity (P23): logo tile + a link to the public
              profile, where the team, history and trust level live. */}
            <div className="mt-2 flex items-center gap-2 text-sm text-brand-100">
              <Avatar size="sm" aria-hidden src={opportunity.organization.logo ?? undefined}>
                {opportunity.organization.name.slice(0, 1)}
              </Avatar>
              <p>
                {dict.opportunity.organizedBy}{' '}
                <Link
                  href={`/${locale}/organizations/${opportunity.organization.slug}`}
                  className="font-semibold text-white underline-offset-4 hover:text-clay-300 hover:underline"
                >
                  {opportunity.organization.name}
                </Link>
                <span className="text-brand-200">
                  {' · '}
                  {dict.organizations.types[opportunity.organization.organizationType] ??
                    opportunity.organization.organizationType}
                </span>
                {location ? ` · ${location}` : ''}
                {country && !location ? ` · ${country}` : ''}
              </p>
            </div>
            <p className="mt-1 text-xs text-brand-200">
              {dict.opportunity.openedOn}{' '}
              {formatDate(opportunity.publishedAt ?? opportunity.createdAt, locale)}
            </p>
          </div>
          {/* Save/favorite (P5) — signed-in sessions only; anonymous visitors
            never see a control that would bounce them to login on click.
            Report (P20) prefills the safety form with this page's own link —
            no hunting for a target id; the sign-in bounce keeps the value. */}
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {auth.kind !== 'anonymous' ? (
              <SaveButton opportunityId={opportunity.id} locale={locale} />
            ) : null}
            <Link
              href={`/${locale}/safety?target=${encodeURIComponent(
                `/${locale}/opportunities/${slug}`,
              )}`}
              className="text-sm font-medium text-clay-300 underline hover:text-white"
            >
              {dict.common.report}
            </Link>
          </div>
        </div>
      </PageMasthead>

      <div className="mx-auto max-w-6xl px-4 pb-10">
        {opportunity.coverImage ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-sand-200">
            {/* Cover supplied by the organizer (optional; alt-less decorative). */}
            <img
              src={opportunity.coverImage}
              alt=""
              className="max-h-80 w-full object-cover"
              loading="lazy"
            />
          </div>
        ) : null}

        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main column */}
          <div className="space-y-8 lg:col-span-2">
            <section>
              <SectionHeading
                eyebrow={dict.opportunity.eyebrows.story}
                title={dict.opportunity.about}
              />
              <p className="mt-3 whitespace-pre-line leading-relaxed text-sand-700">
                {description}
              </p>
            </section>

            {problem ? (
              <section>
                <SectionHeading title={dict.opportunity.problemTitle} />
                <p className="mt-3 whitespace-pre-line leading-relaxed text-sand-700">{problem}</p>
              </section>
            ) : null}

            {objective ? (
              <section>
                <SectionHeading title={dict.opportunity.objectiveTitle} />
                <p className="mt-3 whitespace-pre-line leading-relaxed text-sand-700">
                  {objective}
                </p>
              </section>
            ) : null}

            {/* Needs cluster (spec §9/§12): volunteers first, then declared
              financial / equipment / material / service needs with their
              honest progress and support-offer actions. */}
            <section>
              <SectionHeading
                eyebrow={dict.opportunity.eyebrows.needs}
                title={dict.opportunity.needsTitle}
              />

              {capacity !== null ? (
                <Card className="mt-3 p-5">
                  <h3 className="text-base font-semibold text-sand-900">
                    {dict.opportunity.volunteersNeeded}
                  </h3>
                  <div
                    className="mt-3 h-2 w-full overflow-hidden rounded-full bg-sand-100"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={capacity}
                    aria-valuenow={Math.min(joined, capacity)}
                    aria-label={dict.opportunity.progressLabel}
                  >
                    <div
                      className="h-2 rounded-full bg-brand-600"
                      style={{
                        width: `${
                          capacity > 0
                            ? Math.round((Math.min(joined, capacity) / capacity) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-sand-500">
                    {dict.opportunity.joined}:{' '}
                    <span className="font-semibold tabular-nums text-sand-900">
                      {formatNumber(joined, locale)} / {formatNumber(capacity, locale)}
                    </span>
                  </p>
                </Card>
              ) : null}

              {opportunity.supportNeeds.length > 0 ? (
                <div className="mt-3">
                  <InitiativeSupport
                    locale={locale}
                    slug={slug}
                    needs={opportunity.supportNeeds}
                    initialAuth={{ kind: auth.kind }}
                  />
                </div>
              ) : capacity === null ? (
                <EmptyState className="mt-3">{dict.opportunity.needsEmpty}</EmptyState>
              ) : null}
            </section>

            {opportunity.requirements.length > 0 ? (
              <section>
                <SectionHeading
                  eyebrow={dict.opportunity.eyebrows.requirements}
                  title={dict.opportunity.requirements}
                />
                <ul className="mt-3 space-y-2">
                  {opportunity.requirements.map((requirement) => (
                    <li key={requirement.id} className="flex gap-2 text-sm text-sand-700">
                      <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-600"
                      />
                      <span>
                        {requirementLabelFor(requirement, locale)}
                        {requirement.required ? <span className="text-red-700"> *</span> : null}
                        {requirement.description ? (
                          <span className="block text-sand-500">{requirement.description}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {opportunity.skills.length > 0 ? (
              <section>
                <SectionHeading title={dict.common.skills} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {opportunity.skills.map((link) => (
                    <span
                      key={link.skill.id}
                      className={
                        link.required
                          ? 'rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-800 ring-1 ring-brand-200'
                          : 'rounded-full bg-sand-100 px-3 py-1 text-xs font-medium text-sand-700'
                      }
                    >
                      {nameFor(
                        {
                          ...link.skill,
                          code: undefined,
                          nameAr: link.skill.nameAr,
                          nameFr: link.skill.nameFr,
                          nameEn: link.skill.nameEn,
                        },
                        locale,
                      )}
                      {link.required ? <span className="text-red-700"> *</span> : null}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Initiative impact (spec §14): self-reported figures, marked as such. */}
            {opportunity.impactMetrics.length > 0 ? (
              <section>
                <SectionHeading
                  eyebrow={dict.opportunity.eyebrows.impact}
                  title={dict.opportunity.impactTitle}
                />
                <ul className="mt-3 space-y-3">
                  {opportunity.impactMetrics.map((metric) => (
                    <Card as="li" key={metric.id} className="px-5 py-4">
                      <ImpactMetricCard
                        locale={locale}
                        name={metric.name}
                        actual={metric.actual}
                        target={metric.target}
                        unit={metric.unit}
                        source={metric.source}
                        verified={metric.verified}
                        labels={{
                          actual: dict.initiativeConsole.metricActual,
                          target: dict.initiativeConsole.metricTarget,
                          source: dict.initiativeConsole.metricSource,
                          verified: dict.common.verified,
                        }}
                      />
                    </Card>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-sand-500">{dict.opportunity.impactSelfReported}</p>
              </section>
            ) : null}

            {opportunity.sourceUrl || opportunity.source ? (
              <section className="text-sm text-sand-600">
                {opportunity.source ? (
                  <p>
                    {dict.common.verified}: {opportunity.source.name}
                    {opportunity.source.url ? (
                      <>
                        {' — '}
                        <a
                          href={opportunity.source.url}
                          rel="noopener noreferrer nofollow"
                          target="_blank"
                          className="text-brand-700 underline hover:text-brand-800"
                        >
                          {opportunity.source.domain ?? opportunity.source.url}
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </section>
            ) : null}

            {/* Participant reviews & ratings (P24): social proof right before the
              decision. The list, stats and viewer state arrive with the page —
              only the write interactions are client-side. */}
            <ReviewsSection locale={locale} slug={slug} initial={reviews} />
          </div>

          {/* Sidebar: facts + location + contact + apply */}
          <aside className="rise space-y-6 [animation-delay:120ms]">
            <Card className="p-5">
              <dl className="divide-y divide-sand-100 text-sm">
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="flex items-center gap-2 text-sand-500">
                    <CalendarIcon className="size-4 text-sand-400" />
                    {dict.common.startDate}
                  </dt>
                  <dd className="font-medium tabular-nums text-sand-800">
                    {formatDate(opportunity.startDate, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="flex items-center gap-2 text-sand-500">
                    <CalendarIcon className="size-4 text-sand-400" />
                    {dict.common.endDate}
                  </dt>
                  <dd className="font-medium tabular-nums text-sand-800">
                    {formatDate(opportunity.endDate, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="flex items-center gap-2 text-sand-500">
                    <ClockIcon className="size-4 text-sand-400" />
                    {dict.common.deadline}
                  </dt>
                  <dd className="font-medium tabular-nums text-sand-800">
                    {formatDate(opportunity.applicationDeadline, locale)}
                  </dd>
                </div>
                {opportunity.capacity !== null ? (
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="flex items-center gap-2 text-sand-500">
                      <UsersIcon className="size-4 text-sand-400" />
                      {dict.common.capacity}
                    </dt>
                    <dd className="font-medium tabular-nums text-sand-800">
                      {formatNumber(opportunity.capacity, locale)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="flex items-center gap-2 text-sand-500">
                    <UsersIcon className="size-4 text-sand-400" />
                    {dict.opportunity.joined}
                  </dt>
                  <dd className="font-medium tabular-nums text-sand-800">
                    {formatNumber(joined, locale)}
                  </dd>
                </div>
                {opportunity.estimatedHours !== null ? (
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <dt className="flex items-center gap-2 text-sand-500">
                      <ClockIcon className="size-4 text-sand-400" />
                      {dict.common.hours}
                    </dt>
                    <dd className="font-medium tabular-nums text-sand-800">
                      {formatNumber(opportunity.estimatedHours, locale)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="flex items-center gap-2 text-sand-500">
                    <UsersIcon className="size-4 text-sand-400" />
                    {dict.common.applicants}
                  </dt>
                  <dd className="font-medium tabular-nums text-sand-800">
                    {formatNumber(opportunity.applicationCount, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="flex items-center gap-2 text-sand-500">
                    <EyeIcon className="size-4 text-sand-400" />
                    {dict.common.views}
                  </dt>
                  <dd className="font-medium tabular-nums text-sand-800">
                    {formatNumber(opportunity.viewCount, locale)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="flex items-center gap-2 text-sand-500">
                    <MapPinIcon className="size-4 text-sand-400" />
                    {dict.common.type}
                  </dt>
                  <dd className="font-medium text-sand-800">
                    {locationTypeLabelFor(opportunity.locationType, dict)}
                  </dd>
                </div>
              </dl>

              {includedBenefits.length > 0 ? (
                <div className="mt-4 border-t border-sand-100 pt-4">
                  <h3 className="text-sm font-semibold text-sand-800">
                    {dict.opportunity.benefits}
                  </h3>
                  <ul className="mt-2 space-y-1 text-sm text-sand-600">
                    {includedBenefits.map((benefit) => (
                      <li key={benefit.benefitType}>
                        {dict.opportunity.benefitTypes[
                          benefit.benefitType as keyof typeof dict.opportunity.benefitTypes
                        ] ?? benefit.benefitType}
                        {benefit.note ? ` — ${benefit.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {hasCoords ? (
                <div className="mt-4 border-t border-sand-100 pt-4">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${opportunity.latitude}&mlon=${opportunity.longitude}#map=15/${opportunity.latitude}/${opportunity.longitude}`}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="text-sm font-semibold text-brand-700 hover:text-brand-800"
                  >
                    {dict.opportunity.openMap} ↗
                  </a>
                </div>
              ) : null}
            </Card>

            {/* Contact (P23): the card always renders — an initiative with no
              published phone/email still has a channel: the in-platform message
              to the organizer (?org= keeps the sign-in bounce value). */}
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-sand-800">
                {dict.opportunity.contactTitle}
              </h2>
              {initiativeContact || organizerContact ? (
                <div className="mt-3 space-y-1.5 text-sm text-sand-700">
                  {opportunity.contactName ? (
                    <p className="font-medium text-sand-800">{opportunity.contactName}</p>
                  ) : null}
                  {opportunity.contactPhone ? (
                    <p>
                      <a
                        href={`tel:${opportunity.contactPhone}`}
                        className="text-brand-700 hover:underline"
                      >
                        {opportunity.contactPhone}
                      </a>
                    </p>
                  ) : null}
                  {opportunity.contactEmail ? (
                    <p>
                      <a
                        href={`mailto:${opportunity.contactEmail}`}
                        className="text-brand-700 hover:underline"
                      >
                        {opportunity.contactEmail}
                      </a>
                    </p>
                  ) : null}
                  {!initiativeContact ? (
                    <>
                      <p className="text-xs text-sand-500">
                        {dict.opportunity.contactFallbackNote}
                      </p>
                      {opportunity.organization.website ? (
                        <p>
                          <a
                            href={opportunity.organization.website}
                            rel="noopener noreferrer"
                            target="_blank"
                            className="text-brand-700 hover:underline"
                          >
                            {opportunity.organization.website}
                          </a>
                        </p>
                      ) : null}
                      {opportunity.organization.officialEmail ? (
                        <p>
                          <a
                            href={`mailto:${opportunity.organization.officialEmail}`}
                            className="text-brand-700 hover:underline"
                          >
                            {opportunity.organization.officialEmail}
                          </a>
                        </p>
                      ) : null}
                      {opportunity.organization.phone ? (
                        <p>
                          <a
                            href={`tel:${opportunity.organization.phone}`}
                            className="text-brand-700 hover:underline"
                          >
                            {opportunity.organization.phone}
                          </a>
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ) : null}
              <Link
                href={messageHref}
                className={buttonClasses({
                  variant: 'outline',
                  size: 'md',
                  className: 'mt-4 w-full justify-center',
                })}
              >
                {dict.opportunity.messageOrganization}
              </Link>
            </Card>

            <div className="rounded-xl border border-brand-100 bg-brand-50 p-5">
              <h2 className="text-lg font-semibold text-brand-900">{dict.common.applyNow}</h2>
              <div className="mt-3">
                <ApplyForm
                  locale={locale}
                  slug={slug}
                  questions={opportunity.questions}
                  deadlinePassed={deadlinePassed}
                  initialAuth={{ kind: auth.kind }}
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
