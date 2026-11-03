import type { LocaleCode, OpportunityType, OrganizationType } from '@bladna/types';
import type { Dictionary } from './i18n/types';

/**
 * UI-side projections of the shapes the opportunity endpoints actually return
 * (LIST_SELECT / DETAIL_SELECT in server/modules/opportunities.ts). The API
 * returns the three title/description columns; the localized `title` DTO is a
 * client-side projection — `titleFor`/`descriptionFor` below.
 */

export interface OrgRef {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  verificationStatus: string;
  trustLevel: string;
}

export interface CategoryRef {
  id: string;
  slug: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  icon: string | null;
}

export interface PlaceRef {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  code?: string;
}

export interface SkillLink {
  required: boolean;
  skill: { id: string; nameAr: string; nameFr: string; nameEn: string; category: string | null };
}

export interface OpportunityListItem {
  id: string;
  slug: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  type: OpportunityType;
  locationType: string;
  categoryId: string | null;
  countryId: string | null;
  wilayaId: string | null;
  cityId: string | null;
  latitude: number | null;
  longitude: number | null;
  startDate: string | null;
  endDate: string | null;
  applicationDeadline: string | null;
  capacity: number | null;
  estimatedHours: number | null;
  status: string;
  publishedAt: string | null;
  viewCount: number;
  applicationCount: number;
  acceptedCount: number;
  createdAt: string;
  /** Organizer-set cover (spec §4) — the card's first choice, before art. */
  coverImage: string | null;
  organization: OrgRef;
  category: CategoryRef | null;
  wilaya: PlaceRef | null;
  city: PlaceRef | null;
  skills: SkillLink[];
  benefits: { benefitType: string; value: string; note: string | null }[];
}

export interface OpportunityQuestion {
  id: string;
  promptAr: string;
  promptFr: string;
  promptEn: string;
  type: 'TEXT' | 'MULTILINE' | 'CHOICE' | 'BOOLEAN';
  required: boolean;
  options: { value: string; labelAr: string; labelFr: string; labelEn: string }[] | null;
  sortOrder: number;
}

export interface OpportunityRequirement {
  id: string;
  type: string;
  labelAr: string;
  labelFr: string;
  labelEn: string;
  description: string | null;
  required: boolean;
}

/** A declared support need as returned by GET /opportunities/:slug. */
export interface SupportNeedItem {
  id: string;
  kind: 'FINANCIAL' | 'EQUIPMENT' | 'MATERIAL' | 'SERVICE';
  labelAr: string;
  labelFr: string;
  labelEn: string;
  description: string | null;
  quantity: number | null;
  fulfilled: number;
  targetAmount: number | null;
  currency: string;
  sortOrder: number;
  /** Filled count when a target quantity exists, else null (no fake ratio). */
  progress: number | null;
  acceptedOffers: number;
  /** Sum of ACCEPTED offer amounts — honest financial progress. */
  acceptedAmount: number;
  /** Sum of ACCEPTED offer quantities — the pledged segment of the P18 bar. */
  acceptedQuantity: number;
}

/** An initiative-level impact metric (spec §14), self-reported until verified. */
export interface ImpactMetricItem {
  id: string;
  metricType: string;
  name: string;
  target: number | null;
  actual: number;
  unit: string;
  source: string;
  verified: boolean;
  createdAt: string;
}

/** Minimal shape returned by discover `mode=map` (spec §16). */
export interface MapItem {
  id: string;
  slug: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  latitude: number | null;
  longitude: number | null;
  type: string;
  locationType: string;
  /** P11: pin context for the visible alternative (side list) + page stats. */
  wilayaId: string | null;
  startDate: string | null;
  wilaya: PlaceRef | null;
  city: PlaceRef | null;
}

export interface OpportunityDetail extends OpportunityListItem {
  descriptionAr: string;
  descriptionFr: string;
  descriptionEn: string;
  // Initiative narrative (spec §4) — optional, all-or-nothing triplets.
  problemAr: string | null;
  problemFr: string | null;
  problemEn: string | null;
  objectiveAr: string | null;
  objectiveFr: string | null;
  objectiveEn: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
  sourceUrl: string | null;
  verificationStatus: string;
  updatedAt: string;
  organizationId: string;
  // Detail select also exposes the organizer's own contact channel (fallback)
  // and the actor type (association / company / public institution, …).
  organization: OrgRef & {
    website: string | null;
    officialEmail: string | null;
    phone: string | null;
    organizationType: OrganizationType;
  };
  country: PlaceRef | null;
  campaign: { id: string; slug: string; name: string; status: string } | null;
  source: {
    id: string;
    name: string;
    sourceType: string;
    url: string | null;
    domain: string | null;
    official: boolean;
    verified: boolean;
  } | null;
  languages: {
    required: boolean;
    language: { id: string; code: string; nameAr: string; nameFr: string; nameEn: string };
  }[];
  requirements: OpportunityRequirement[];
  questions: OpportunityQuestion[];
  supportNeeds: SupportNeedItem[];
  impactMetrics: ImpactMetricItem[];
}

function pick(locale: LocaleCode, ar: string, fr: string, en: string): string {
  if (locale === 'ar') return ar;
  if (locale === 'fr') return fr;
  return en;
}

export function titleFor(
  item: { titleAr: string; titleFr: string; titleEn: string },
  locale: LocaleCode,
): string {
  return pick(locale, item.titleAr, item.titleFr, item.titleEn);
}

export function descriptionFor(
  item: { descriptionAr: string; descriptionFr: string; descriptionEn: string },
  locale: LocaleCode,
): string {
  return pick(locale, item.descriptionAr, item.descriptionFr, item.descriptionEn);
}

export function nameFor(place: PlaceRef | null, locale: LocaleCode): string | null {
  if (!place) return null;
  return pick(locale, place.nameAr, place.nameFr, place.nameEn);
}

export function categoryNameFor(category: CategoryRef | null, locale: LocaleCode): string | null {
  if (!category) return null;
  return pick(locale, category.nameAr, category.nameFr, category.nameEn);
}

export function questionPromptFor(question: OpportunityQuestion, locale: LocaleCode): string {
  return pick(locale, question.promptAr, question.promptFr, question.promptEn);
}

export function questionLabelFor(
  option: { value: string; labelAr: string; labelFr: string; labelEn: string },
  locale: LocaleCode,
): string {
  return pick(locale, option.labelAr, option.labelFr, option.labelEn);
}

export function requirementLabelFor(
  requirement: OpportunityRequirement,
  locale: LocaleCode,
): string {
  return pick(locale, requirement.labelAr, requirement.labelFr, requirement.labelEn);
}

/** Human location line: city, wilaya — or country for international items.
 *  Structurally typed (list rows and map pins both carry the two places). */
export function locationLineFor(
  item: { city: PlaceRef | null; wilaya: PlaceRef | null },
  locale: LocaleCode,
): string | null {
  const city = nameFor(item.city, locale);
  const wilaya = nameFor(item.wilaya, locale);
  if (city && wilaya && city !== wilaya) return `${city}, ${wilaya}`;
  if (city) return city;
  if (wilaya) return wilaya;
  return null;
}

/**
 * Localized optional narrative (problem/objective): prefer the requested
 * language, fall back to any that exists — never invent content.
 */
export function optionalNarrativeFor(
  item: { ar: string | null; fr: string | null; en: string | null },
  locale: LocaleCode,
): string | null {
  const primary = locale === 'ar' ? item.ar : locale === 'fr' ? item.fr : item.en;
  if (primary && primary.trim()) return primary;
  for (const value of [item.ar, item.fr, item.en]) {
    if (value && value.trim()) return value;
  }
  return null;
}

export function needLabelFor(
  need: { labelAr: string; labelFr: string; labelEn: string },
  locale: LocaleCode,
): string {
  return pick(locale, need.labelAr, need.labelFr, need.labelEn);
}

/** Localized opportunity-type badge (same labels the discover filter uses). */
export function typeLabelFor(type: string, dict: Dictionary): string {
  switch (type) {
    case 'LOCAL':
      return dict.common.local;
    case 'NATIONAL':
      return dict.common.national;
    case 'ONLINE':
      return dict.common.online;
    case 'INTERNATIONAL':
      return dict.common.international;
    case 'EVENT':
      return dict.common.event;
    case 'CAMPAIGN':
      return dict.common.campaign;
    default:
      return type;
  }
}

export function locationTypeLabelFor(locationType: string, dict: Dictionary): string {
  const labels = dict.opportunity.locationTypes as Record<string, string>;
  return labels[locationType] ?? locationType;
}

// -- Participant reviews & ratings (P24) -------------------------
// Server projection of `GET /opportunities/:slug/reviews`: the list the
// detail page renders plus the viewer's eligibility/own-review anchors.
// Dates are ISO strings so the shape matches what the HTTP API returns
// (JSON) exactly � no Date/string ambiguity across the SSR boundary.

export interface ReviewItem {
  id: string;
  rating: number;
  body: string | null;
  source: 'PARTICIPANT' | 'HOURS';
  createdAt: string;
  updatedAt: string;
  /** The review belongs to the current session (edit/delete anchors). */
  isMine: boolean;
  /** Public display name � `null` when the author has no opt-in profile. */
  author: { name: string | null };
}

export interface ReviewsPayload {
  items: ReviewItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  /** `distribution` is a 5-slot histogram (rating 1..5). */
  stats: { count: number; average: number; distribution: number[] };
  viewer: {
    /** A session exists (drives the "sign in to review" CTA). */
    authenticated: boolean;
    /** Accepted application or verified hours on THIS initiative. */
    eligible: boolean;
    eligibility: 'PARTICIPANT' | 'HOURS' | null;
    /** The caller's own review (edit/delete anchor) when one exists. */
    review: { id: string; rating: number; body: string | null } | null;
  };
}
