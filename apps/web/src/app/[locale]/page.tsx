import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@bladna/types';
import { Badge, Card, EmptyState, buttonClasses } from '@bladna/ui';
import {
  getDictionary,
  isLocale,
  type Dictionary,
  type LocaleCode,
  type PillarCopy,
} from '@/ui/i18n';
import { formatDate } from '@/ui/format';
import { categoryNameFor, type OpportunityListItem } from '@/ui/opportunity';
import { discover } from '@/server/modules/opportunities';
import { listCategories } from '@/server/modules/taxonomies';
import { totals as impactTotals } from '@/server/modules/impact';
import { cmsRoutes } from '@/server/modules/cms';
import { invoke } from '@/server/ssr';
import type { Handler } from '@/server/http';
import { QuickChips } from '@/ui/components/quick-chips';
import { SectionHeading } from '@/ui/components/section-heading';
import { InitiativeCard } from '@/ui/components/initiative-card';
import { HeroArt } from '@/ui/components/hero-art';
import { HeroSlider } from '@/ui/components/hero-slider';
import { StatCounter } from '@/ui/components/stat-counter';
import { StartHere } from '@/ui/components/start-here';
import {
  ArrowRightIcon,
  AwardIcon,
  BuildingIcon,
  CheckIcon,
  CompassIcon,
  GlobeIcon,
  HeartIcon,
  IdCardIcon,
  MapPinIcon,
  SearchIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@/ui/components/icons';

// Home sections render live initiatives/stats — never stale build-time data.
export const dynamic = 'force-dynamic';

/**
 * P11 step photos for "How it works" — CC0/PDM sources credited in
 * design-refs/PHOTO-CREDITS.md. Fixed order matching `dict.landing.how`;
 * decorative (rendered with alt=""), never documentary claims.
 */
const HOW_PHOTOS = ['how-profile', 'how-participate', 'how-certificate'] as const;

/** P26 hero slideshow — four CC0 volunteering photos (PHOTO-CREDITS.md). */
const HERO_SLIDES = ['community', 'environment-beach', 'humanitarian', 'youth'] as const;

/** One icon per pillar — keyed the same way as `dict.landing.pillars`.
 *  P22: `onDark` flips the featured cell's icon to the light jade tone. */
function iconFor(key: string, onDark = false): React.ReactElement {
  const className = onDark ? 'size-6 text-brand-200' : 'size-6 text-brand-700';
  switch (key) {
    case 'identity':
      return <IdCardIcon className={className} />;
    case 'experience':
      return <AwardIcon className={className} />;
    case 'opportunities':
      return <CompassIcon className={className} />;
    case 'organizations':
      return <BuildingIcon className={className} />;
    case 'csr':
      return <HeartIcon className={className} />;
    case 'international':
      return <GlobeIcon className={className} />;
    default:
      return <ShieldCheckIcon className={className} />;
  }
}

interface DiscoverResult {
  items: OpportunityListItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface CategoriesResult {
  items: NonNullable<OpportunityListItem['category']>[];
}

interface ImpactTotalsResult {
  totals: {
    publishedOpportunities: number;
    activeOrganizations: number;
    registeredVolunteers: number;
    verifiedHours: number;
    validCertificates: number;
  };
}

// ── CMS surfaces (P12): home singleton (hero copy), featured placements ───

interface HomeRow {
  heroTitleAr: string;
  heroTitleFr: string;
  heroTitleEn: string;
  heroSubtitleAr: string | null;
  heroSubtitleFr: string | null;
  heroSubtitleEn: string | null;
  primaryCtaAr: string;
  primaryCtaFr: string;
  primaryCtaEn: string;
  secondaryCtaAr: string;
  secondaryCtaFr: string;
  secondaryCtaEn: string;
}

interface HomeResult {
  home: HomeRow | null;
}

interface FeaturedTarget {
  slug: string;
  titleAr?: string | null;
  titleFr?: string | null;
  titleEn?: string | null;
  name?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

interface FeaturedItem {
  id: string;
  section: string;
  targetType: 'OPPORTUNITY' | 'ORGANIZATION' | 'CAMPAIGN';
  position: number;
  sponsored: boolean;
  label: string | null;
  target: FeaturedTarget | null;
}

interface FeaturedResult {
  items: FeaturedItem[];
}

/** Look up a CMS handler from the module route table for in-process SSR. */
function cmsHandlerOf(method: string, path: string): Handler | null {
  return cmsRoutes.find((route) => route.method === method && route.path === path)?.handler ?? null;
}

/** The three seeded CMS fields are picked by locale (with no fallback). */
function pick(locale: LocaleCode, ar: string, fr: string, en: string): string {
  return locale === 'ar' ? ar : locale === 'fr' ? fr : en;
}

/**
 * CMS reads are optional on the landing page: any failure degrades to the
 * dictionary defaults / empty rails instead of taking the home page down.
 */
async function fetchHome(locale: string): Promise<HomeResult> {
  const handler = cmsHandlerOf('GET', '/home');
  if (!handler) return { home: null };
  try {
    return await invoke<HomeResult>(handler, { path: '/home', locale });
  } catch {
    return { home: null };
  }
}

async function fetchFeatured(locale: string): Promise<FeaturedItem[]> {
  const handler = cmsHandlerOf('GET', '/featured');
  if (!handler) return [];
  try {
    const result = await invoke<FeaturedResult>(handler, {
      path: '/featured',
      locale,
      query: { page: 1, limit: 24 },
    });
    // Home rails show the HOME_* sections only; the console also offers a
    // DISCOVER_FEATURED section, consumed by the discover page.
    return result.items.filter((item) => item.section.startsWith('HOME_') && item.target);
  } catch {
    return [];
  }
}

function featuredHref(locale: LocaleCode, item: FeaturedItem): string {
  const slug = item.target?.slug ?? '';
  if (item.targetType === 'ORGANIZATION') return `/${locale}/organizations/${slug}`;
  if (item.targetType === 'CAMPAIGN') return `/${locale}/campaigns/${slug}`;
  return `/${locale}/opportunities/${slug}`;
}

function featuredTitle(locale: LocaleCode, item: FeaturedItem): string {
  const target = item.target;
  if (!target) return '';
  if (item.targetType === 'OPPORTUNITY') {
    return pick(locale, target.titleAr ?? '', target.titleFr ?? '', target.titleEn ?? '');
  }
  return target.name ?? '';
}

function featuredMeta(locale: LocaleCode, item: FeaturedItem): string {
  const target = item.target;
  if (!target) return '';
  if (item.targetType === 'OPPORTUNITY' && target.startDate) {
    return formatDate(target.startDate, locale);
  }
  if (item.targetType === 'CAMPAIGN' && target.endDate) {
    return formatDate(target.endDate, locale);
  }
  return '';
}

/** Same degradation rule as the discover page: bad params → empty, else throw. */
async function fetchDiscover(
  locale: string,
  query: Record<string, string | number | boolean | null | undefined>,
): Promise<OpportunityListItem[]> {
  try {
    const result = await invoke<DiscoverResult>(discover, {
      path: '/opportunities',
      locale,
      query,
    });
    return result.items;
  } catch (error) {
    if (!isAppError(error) || error.code !== 'VALIDATION_ERROR') throw error;
    return [];
  }
}

/** The single discovery rail (spec §9 + P3/M2): heading, cards, "view all". */
function InitiativeSection({
  locale,
  dict,
  title,
  items,
  moreHref,
}: {
  locale: LocaleCode;
  dict: Dictionary;
  title: string;
  items: OpportunityListItem[];
  moreHref: string;
}) {
  return (
    <section data-reveal className="mx-auto max-w-6xl px-4 py-14">
      <SectionHeading
        title={title}
        action={
          <Link
            href={moreHref}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
          >
            {dict.landing.viewAll}
            <ArrowRightIcon className="size-4 rtl:rotate-180" />
          </Link>
        }
      />
      {items.length === 0 ? (
        // Honest empty state instead of a hole (DESIGN.md §5): why it is
        // empty + what fills it + the canonical next action.
        <EmptyState className="mt-6">
          <p>{dict.landing.emptyRail}</p>
          <Link
            href={moreHref}
            className={buttonClasses({ variant: 'outline', className: 'mt-4' })}
          >
            {dict.landing.viewAll}
          </Link>
        </EmptyState>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <InitiativeCard key={item.id} locale={locale} dict={dict} item={item} titleAs="h3" />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { dict } = getDictionary(locale);

  // Spec §9: hero + categories + latest initiatives + real impact totals.
  // Every figure below comes from persisted rows — there are no invented
  // numbers on this page. P3 / M2: the landing keeps ONE discovery rail
  // ("latest") — filtered views live behind the quick chips and the
  // canonical /opportunities links.
  const [recentItems, categories, impact, homeResult, featuredItems] = await Promise.all([
    fetchDiscover(locale, { sort: 'recent', limit: 6, page: 1 }),
    invoke<CategoriesResult>(listCategories, {
      path: '/taxonomies/categories',
      locale,
      query: { page: 1, limit: 12 },
    }),
    invoke<ImpactTotalsResult>(impactTotals, { path: '/impact', locale }),
    fetchHome(locale),
    fetchFeatured(locale),
  ]);

  // Admin-edited home singleton overrides the dictionary hero when present;
  // with no row seeded (or a failed read) the dictionary copy renders as-is.
  const home = homeResult.home;
  const heroTitle = home
    ? pick(locale, home.heroTitleAr, home.heroTitleFr, home.heroTitleEn) || dict.landing.heroTitle
    : dict.landing.heroTitle;
  const heroSubtitle = home
    ? pick(
        locale,
        home.heroSubtitleAr ?? '',
        home.heroSubtitleFr ?? '',
        home.heroSubtitleEn ?? '',
      ) || dict.landing.heroSubtitle
    : dict.landing.heroSubtitle;
  const heroCtaSupport = home
    ? pick(locale, home.primaryCtaAr, home.primaryCtaFr, home.primaryCtaEn) ||
      dict.landing.heroCtaSupport
    : dict.landing.heroCtaSupport;
  const heroCtaCreate = home
    ? pick(locale, home.secondaryCtaAr, home.secondaryCtaFr, home.secondaryCtaEn) ||
      dict.landing.heroCtaCreate
    : dict.landing.heroCtaCreate;

  const pillarEntries: Array<[string, PillarCopy]> = [
    ['identity', dict.landing.pillars.identity],
    ['experience', dict.landing.pillars.experience],
    ['opportunities', dict.landing.pillars.opportunities],
    ['organizations', dict.landing.pillars.organizations],
    ['csr', dict.landing.pillars.csr],
    // The international pillar is intentionally demoted (spec §9): it lives on
    // as a small section near the bottom instead of a top-level pillar card.
  ];

  const statRows: Array<[string, number]> = [
    [dict.landing.statsInitiatives, impact.totals.publishedOpportunities],
    [dict.landing.statsOrganizations, impact.totals.activeOrganizations],
    [dict.landing.statsVolunteers, impact.totals.registeredVolunteers],
    [dict.landing.statsHours, impact.totals.verifiedHours],
  ];

  // P26 — the reference's "digital platforms" grid: four real destinations,
  // each keeping its own section copy (verify / map / directory / intl).
  const serviceCards: Array<{
    key: string;
    icon: React.ReactElement;
    title: string;
    body: string;
    cta: string;
    href: string;
  }> = [
    {
      key: 'verify',
      icon: <ShieldCheckIcon className="size-6" />,
      title: dict.landing.verifyTitle,
      body: dict.landing.verifyBody,
      cta: dict.landing.verifyCta,
      href: `/${locale}/verify`,
    },
    {
      key: 'map',
      icon: <MapPinIcon className="size-6" />,
      title: dict.landing.discoverMap,
      body: dict.landing.servicesMapBody,
      cta: dict.landing.viewAll,
      href: `/${locale}/map`,
    },
    {
      key: 'directory',
      icon: <UsersIcon className="size-6" />,
      title: dict.directory.title,
      body: dict.directory.subtitle,
      cta: dict.landing.viewAll,
      href: `/${locale}/volunteers`,
    },
    {
      key: 'international',
      icon: <GlobeIcon className="size-6" />,
      title: dict.landing.intlTitle,
      body: dict.landing.intlBody,
      cta: dict.landing.intlCta,
      href: `/${locale}/international`,
    },
  ];

  return (
    <>
      {/* Hero — copy left, reference-style photo slider right, trust strip
          closing the band (spec §8–§9). Motion: staged rise + slideshow,
          both opt-in via prefers-reduced-motion (globals). */}
      <section className="relative overflow-hidden bg-gradient-to-b from-brand-900 via-brand-800 to-brand-700 text-white">
        {/* Decorative glow — pure CSS, aria-hidden, RTL-safe (centred radial).
            Jade wash + terracotta warmth: the P9 palette in one gradient.
            P22: the wash breathes (16s, transform only, reduced-motion opt-out). */}
        <div
          aria-hidden
          className="hero-breathe pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              'radial-gradient(60rem 30rem at 85% -10%, #b5e6d0 0%, transparent 60%), radial-gradient(50rem 25rem at -10% 110%, #edb187 0%, transparent 55%)',
          }}
        />
        {/* Fading dot grid — depth without noise, masked out before the fold ends. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.35) 1px, transparent 1px)',
            backgroundSize: '26px 26px',
            maskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.9), transparent 70%)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0, 0, 0, 0.9), transparent 70%)',
          }}
        />
        {/* P26: the P11 dunes retire from the hero — the photo slider carries
            the landscape now — and keep the final CTA as the bookend. */}
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <h1
                className="hero-rise max-w-2xl bg-gradient-to-b from-white to-brand-200 bg-clip-text text-4xl font-bold leading-[1.14] text-balance text-transparent md:text-6xl"
                style={{ animationDelay: '60ms' }}
              >
                {heroTitle}
              </h1>
              {/* Clay editorial rule — decorative warmth under the headline
              (DESIGN §11: clay never carries meaning, so it stays aria-hidden). */}
              <span
                aria-hidden
                className="hero-rise mt-5 block h-1.5 w-16 rounded-full bg-clay-500"
                style={{ animationDelay: '90ms' }}
              />
              <p
                className="hero-rise mt-5 max-w-2xl text-lg text-brand-100 md:text-xl"
                style={{ animationDelay: '120ms' }}
              >
                {heroSubtitle}
              </p>

              {/* Search straight into discover — plain GET form, works without JS.
              One visual object: icon + field + dark submit inside one surface. */}
              <form
                method="get"
                action={`/${locale}/opportunities`}
                role="search"
                aria-label={dict.landing.heroSearch}
                className="hero-rise mt-8 flex max-w-xl items-center gap-2 rounded-full bg-white p-1.5 ps-4 shadow-xl ring-1 ring-white/30"
                style={{ animationDelay: '180ms' }}
              >
                <SearchIcon className="size-4 shrink-0 text-sand-400" />
                <label htmlFor="hero-q" className="sr-only">
                  {dict.landing.heroSearch}
                </label>
                <input
                  id="hero-q"
                  name="q"
                  maxLength={120}
                  placeholder={dict.landing.heroSearchPlaceholder}
                  className="h-11 w-full min-w-0 border-0 bg-transparent text-sm text-sand-900 placeholder:text-sand-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className={buttonClasses({ variant: 'secondary', className: 'shrink-0' })}
                >
                  {dict.common.search}
                </button>
              </form>

              {/* Two paths, ranked: the primary action is the solid one.
              P10/D3: marketing surfaces speak pill; the kit keeps 8px. */}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/opportunities`}
                  className="pulsering inline-flex min-h-12 items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-800 shadow-lg transition motion-safe:hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-xl"
                >
                  {heroCtaSupport}
                </Link>
                <Link
                  href={`/${locale}/register?accountType=ORGANIZATION`}
                  className="inline-flex min-h-12 items-center rounded-full border border-brand-300 px-6 py-3 text-sm font-semibold text-white transition motion-safe:hover:-translate-y-0.5 hover:bg-brand-600"
                >
                  {heroCtaCreate}
                </Link>
              </div>
              <p className="mt-4 text-sm">
                <Link
                  href={`/${locale}/map`}
                  className="inline-flex items-center gap-1.5 font-semibold text-brand-100 underline underline-offset-4 transition hover:text-white"
                >
                  {dict.landing.discoverMap}
                  <ArrowRightIcon className="size-4 rtl:rotate-180" />
                </Link>
              </p>
            </div>

            {/* P26 slideshow — framed photos + counter/controls row (the
                reference's slider), decorative frames only (alt=""). */}
            <div
              className="hero-rise mx-auto w-full max-w-xl lg:max-w-none"
              style={{ animationDelay: '220ms' }}
            >
              <HeroSlider
                slides={HERO_SLIDES}
                label={dict.landing.sliderLabel}
                showLabel={dict.landing.slideShow}
                playLabel={dict.landing.playShow}
                pauseLabel={dict.landing.pauseShow}
              />
            </div>
          </div>

          {/* Trust strip — honest product facts, no invented metrics.
              P10/D4: a hairline rule closes the hero the way the reference
              trust bars do, with a decorative scroll cue at the fold. */}
          <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/15 pt-6">
            {dict.landing.features.map((feature) => (
              <li
                key={feature}
                className="inline-flex items-center gap-2 text-sm font-medium text-brand-100"
              >
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-800">
                  <CheckIcon className="size-3" />
                </span>
                {feature}
              </li>
            ))}
          </ul>
          <div aria-hidden className="mt-5 flex justify-end">
            <ArrowRightIcon className="size-4 rotate-90 text-brand-300" />
          </div>
        </div>
      </section>

      {/* "Start here" infographic — the first thing under the hero: pick a
          role, see the path as four illustrated steps, one live figure from
          persisted rows (same /impact totals as the band below), one action. */}
      <section aria-labelledby="start-here-title" className="bg-sand-50">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <p className="text-sm font-semibold text-clay-600">{dict.landing.startHere.eyebrow}</p>
          <h2 id="start-here-title" className="mt-1 text-3xl font-bold text-sand-900 md:text-4xl">
            {dict.landing.startHere.title}
          </h2>
          <p className="mt-2 text-sand-600">{dict.landing.startHere.body}</p>
          <div className="mt-8">
            <StartHere
              copy={dict.landing.startHere}
              locale={locale}
              liveCounts={{
                volunteer: impact.totals.publishedOpportunities,
                organization: impact.totals.activeOrganizations,
                verifier: impact.totals.validCertificates,
              }}
            />
          </div>
        </div>
      </section>

      {/* Discovery launcher — quick chips + browse-by-cause in one block.
          P22: pb added here — the journey band below turned white and owns
          its own padding, so this card needs the breathing room itself. */}
      <section data-reveal className="mx-auto max-w-6xl px-4 pt-12 pb-10">
        <SectionHeading
          eyebrow={dict.landing.eyebrows.discover}
          title={dict.landing.discoverTitle}
        />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sand-600 sm:text-base">
          {dict.landing.discoverBody}
        </p>
        <div className="mt-6 rounded-2xl border border-sand-200 bg-white p-5 shadow-card sm:p-6">
          <QuickChips locale={locale} active={null} />
          {categories.items.length > 0 ? (
            <>
              <h3 className="mt-6 border-t border-sand-100 pt-5 text-base font-semibold text-sand-900">
                {dict.landing.categoriesTitle}
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {categories.items.map((category) => (
                  <Link
                    key={category.id}
                    href={`/${locale}/opportunities?categoryId=${category.id}`}
                    className="inline-flex min-h-11 items-center rounded-full border border-sand-200 bg-white px-4 text-sm font-medium text-sand-700 transition hover:border-brand-300 hover:text-brand-800"
                  >
                    {categoryNameFor(category, locale)}
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </section>

      {/* Initiative lifecycle (P21) — the platform's core idea rendered as a
          path: register → describe → review → run → document, closing on the
          shared record that all six actors work from. Typographic only (the
          three CC0 photos belong to "How it works" below).
          P22: the band turns white to break the sand run, and the step marks
          gain a clay gradient + halo — depth, still clay-is-decorative. */}
      <section data-reveal className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow={dict.landing.journey.eyebrow}
            title={dict.landing.journey.title}
          />
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-sand-600 sm:text-base">
            {dict.landing.journey.body}
          </p>
          <ol className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dict.landing.journey.steps.map((step, index) => (
              <li
                key={step.title}
                className="rounded-xl border border-sand-200 bg-sand-50 p-6 shadow-card"
              >
                <span
                  aria-hidden
                  className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-clay-500 to-clay-700 text-sm font-bold text-white tabular-nums ring-4 ring-clay-100"
                >
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold text-sand-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sand-600">{step.body}</p>
              </li>
            ))}
            {/* The sixth cell is the outcome, not a step: one verified record. */}
            <li className="rounded-xl border border-brand-100 bg-brand-50 p-6 shadow-card">
              <span className="grid size-10 place-items-center rounded-full bg-brand-100 ring-4 ring-brand-50">
                <ShieldCheckIcon className="size-5 text-brand-800" />
              </span>
              <h3 className="mt-4 font-semibold text-brand-900">
                {dict.landing.journey.trust.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-800">
                {dict.landing.journey.trust.body}
              </p>
            </li>
          </ol>
        </div>
      </section>

      {/* The single discovery rail: latest initiatives. */}
      <InitiativeSection
        locale={locale}
        dict={dict}
        title={dict.landing.recentTitle}
        items={recentItems}
        moreHref={`/${locale}/opportunities`}
      />

      {/* Featured placements (P12) — the console's HOME_* sections rendered
          as an editorial band: type badge, live target, honest date only. */}
      {featuredItems.length > 0 ? (
        <section data-reveal className="bg-white">
          <div className="mx-auto max-w-6xl px-4 py-14">
            <SectionHeading eyebrow={dict.featured.eyebrow} title={dict.featured.title} />
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sand-600">
              {dict.featured.body}
            </p>
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featuredItems.map((item) => {
                const meta = featuredMeta(locale, item);
                return (
                  <li key={item.id}>
                    <Card
                      as="article"
                      className="flex h-full flex-col p-5 transition motion-safe:hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="success">{dict.featured.kinds[item.targetType]}</Badge>
                        {item.sponsored ? (
                          <Badge tone="warning">{item.label ?? dict.featured.sponsored}</Badge>
                        ) : item.label ? (
                          <Badge>{item.label}</Badge>
                        ) : null}
                      </div>
                      <h3 className="mt-3 text-base font-semibold text-sand-900">
                        <Link href={featuredHref(locale, item)} className="hover:text-brand-800">
                          {featuredTitle(locale, item)}
                        </Link>
                      </h3>
                      {meta ? <p className="mt-2 text-sm text-sand-600">{meta}</p> : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Pillars — bento composition: the identity cell spans two columns AND
          inverts to the deep brand gradient so the grid itself encodes
          priority (P22: one dominant dark cell, never two). */}
      <section data-reveal className="mx-auto max-w-6xl px-4 py-16">
        <SectionHeading eyebrow={dict.landing.eyebrows.pillars} title={dict.landing.pillarsTitle} />
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pillarEntries.map(([key, pillar], index) => {
            const featured = index === 0;
            return (
              <Card
                as="article"
                key={key}
                className={`group p-6 shadow-card transition motion-safe:hover:-translate-y-0.5 hover:shadow-md ${
                  featured
                    ? 'border-brand-800 bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 text-white sm:col-span-2 hover:border-brand-600'
                    : 'hover:border-brand-200'
                }`}
              >
                <span
                  className={`grid place-items-center rounded-xl transition ${
                    featured
                      ? 'size-14 bg-white/10 text-brand-200 group-hover:bg-white/15'
                      : 'size-11 bg-brand-50 group-hover:bg-brand-100'
                  }`}
                >
                  {iconFor(key, featured)}
                </span>
                <h3
                  className={`mt-4 font-semibold ${
                    featured ? 'text-xl text-white' : 'text-lg text-brand-800'
                  }`}
                >
                  {pillar.title}
                </h3>
                <p
                  className={`mt-2 text-sm leading-relaxed ${
                    featured ? 'text-brand-100' : 'text-sand-700'
                  }`}
                >
                  {pillar.body}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* How it works — each step gains one honest supporting line. */}
      <section data-reveal className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading eyebrow={dict.landing.eyebrows.how} title={dict.landing.howTitle} />
          <ol className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
            {dict.landing.how.map((step, index) => (
              <li
                key={step}
                className="overflow-hidden rounded-xl border border-sand-200 bg-sand-50"
              >
                {/* P11: one CC0/PDM photo per step (design-refs/PHOTO-CREDITS.md)
                    — decorative alt="", and the terracotta step mark rides the
                    photo corner instead of the text row (clay stays warmth,
                    never a status color — DESIGN §11). */}
                <div className="relative aspect-[16/9]">
                  <img
                    src={`/photos/${HOW_PHOTOS[index]}.jpg`}
                    alt=""
                    width={1280}
                    height={720}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover saturate-[0.9]"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-0 bg-gradient-to-t from-brand-900/30 via-transparent to-transparent"
                  />
                  <span className="absolute bottom-3 start-3 grid size-10 place-items-center rounded-full bg-clay-600 text-sm font-bold text-white tabular-nums">
                    {index + 1}
                  </span>
                </div>
                <div className="p-5">
                  <p className="font-semibold text-sand-900">{step}</p>
                  <p className="mt-1 text-sm leading-relaxed text-sand-600">
                    {dict.landing.howHints[index]}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Real impact totals (GET /impact — computed from persisted rows).
          Honesty rule: seeded demo data must always say so (docs/RESEARCH.md C1).
          P22: the instrument panel inverts onto the deep brand band — the
          page's mid-point anchor — keeping the gap-px hairlines, the clay
          figure rules and the statsNote provenance label untouched. */}
      <section data-reveal className="relative overflow-hidden bg-brand-900 text-white">
        <div
          aria-hidden
          className="hero-breathe pointer-events-none absolute inset-0 opacity-25"
          style={{
            background:
              'radial-gradient(50rem 25rem at 85% 0%, #86efac 0%, transparent 60%), radial-gradient(45rem 22rem at -5% 110%, #edb187 0%, transparent 55%)',
          }}
        />
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            tone="dark"
            eyebrow={dict.landing.eyebrows.impact}
            title={dict.landing.statsTitle}
          />
          <p className="mt-2 text-sm text-brand-200">{dict.landing.statsNote}</p>
          <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-card border border-white/15 bg-white/15 sm:grid-cols-2 lg:grid-cols-4">
            {statRows.map(([label, value]) => (
              <div key={label} className="bg-brand-900/80 px-5 py-7 backdrop-blur-sm">
                <dd className="text-5xl font-bold tabular-nums md:text-6xl">
                  <span className="bg-gradient-to-b from-white to-brand-200 bg-clip-text text-transparent">
                    <StatCounter value={value} locale={locale} />
                  </span>
                  <span aria-hidden className="mt-2 block h-1 w-8 rounded-full bg-clay-400" />
                </dd>
                <dt className="mt-2 text-sm text-brand-100">{label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* P26 digital services — the reference's "digital platforms" grid:
          four real destinations, each keeping its own section copy (verify,
          map, directory, international) and an honest next action. */}
      <section data-reveal className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow={dict.landing.eyebrows.services}
            title={dict.landing.servicesTitle}
          />
          <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {serviceCards.map((card) => (
              <li key={card.key}>
                <Card
                  as="article"
                  className="group flex h-full flex-col p-6 shadow-card transition motion-safe:hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-800 transition group-hover:bg-brand-100">
                    {card.icon}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-sand-900">{card.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-sand-600">{card.body}</p>
                  <p className="mt-auto pt-4">
                    <Link
                      href={card.href}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800"
                    >
                      {card.cta}
                      <ArrowRightIcon className="size-4 rtl:rotate-180" />
                    </Link>
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final call to action — bookend of the hero, on the deepest surface. */}
      <section className="relative overflow-hidden bg-brand-900 text-white">
        <div
          aria-hidden
          className="hero-breathe pointer-events-none absolute inset-0 opacity-25"
          style={{
            background:
              'radial-gradient(55rem 28rem at 15% -20%, #86efac 0%, transparent 60%), radial-gradient(45rem 22rem at 110% 120%, #fde68a 0%, transparent 55%)',
          }}
        />
        {/* P11 bookend — the dune motif again on the deep band (lighter
            tones than the brand-900 floor, no sun/palms: they would sink). */}
        <HeroArt deep className="pointer-events-none absolute inset-x-0 bottom-0" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">{dict.landing.finalCtaTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-brand-100">{dict.landing.finalCtaBody}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={`/${locale}/register`}
              className="pulsering inline-flex min-h-12 items-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
            >
              {dict.landing.ctaPrimary}
            </Link>
            <Link
              href={`/${locale}/register?accountType=ORGANIZATION`}
              className="inline-flex min-h-12 items-center rounded-full border border-brand-400 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              {dict.landing.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
