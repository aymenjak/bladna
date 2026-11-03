import {
  INTERNATIONAL_PROJECT_TYPES,
  VERIFICATION_STATUSES,
  type InternationalProjectType,
  type LocaleCode,
  type VerificationStatus,
} from '@bladna/types';
import type { Dictionary } from '@/ui/i18n';

/**
 * Shared projections of the shapes the BLADNA International public endpoints
 * return (spec §4–§58). The row mirrors OPPORTUNITY_PUBLIC_SELECT plus the §5
 * structured fields (region/category/skills/age bounds/end date/benefit flags).
 *
 * Everything here is pure and isomorphic — server pages and the client islands
 * both import this module, so it must never pull in server-only code.
 */

/** Page envelope shared by every paginated list endpoint. */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Exactly what `GET /international/opportunities` rows expose (list, detail and country pages). */
export interface InternationalOpportunityRow {
  id: string;
  titleAr: string;
  titleFr: string;
  titleEn: string;
  descriptionAr: string | null;
  descriptionFr: string | null;
  descriptionEn: string | null;
  countryId: string | null;
  city: string | null;
  region: string | null;
  program: string;
  provider: string;
  category: InternationalProjectType;
  skills: string | null;
  eligibility: string | null;
  ageRequirements: string | null;
  minAge: number | null;
  maxAge: number | null;
  languageRequirements: string | null;
  duration: string | null;
  startDate: string | null;
  endDate: string | null;
  deadline: string | null;
  accommodation: string;
  food: string;
  transportation: string;
  insurance: string;
  visaSupport: string;
  training: string;
  certificateProvided: string;
  fees: string;
  funding: string;
  allowance: string;
  travelSupport: string;
  visaInformation: string | null;
  applicationMethod: string | null;
  officialSource: string | null;
  sourceUrl: string | null;
  sourceType: string;
  verificationStatus: string;
  verifiedAt: string | null;
  createdAt: string;
}

/** `GET /international/opportunities` result. */
export interface InternationalListResult {
  items: InternationalOpportunityRow[];
  meta: PageMeta;
}

/** `GET /international/countries` row — only countries with ≥1 open offer. */
export interface InternationalCountryOption {
  id: string;
  code: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  opportunityCount: number;
}

/** `GET /international/countries/:code` result. */
export interface InternationalCountryResult {
  country: {
    id: string;
    code: string;
    nameAr: string;
    nameFr: string;
    nameEn: string;
  };
  items: InternationalOpportunityRow[];
  meta: PageMeta;
}

/** `GET /international/providers` row. */
export interface InternationalProviderItem {
  provider: string;
  opportunityCount: number;
}

export interface InternationalProviderResult {
  items: InternationalProviderItem[];
  meta: PageMeta;
}

/** `GET /international/recommendations` row. */
export interface InternationalRecommendationItem {
  opportunity: InternationalOpportunityRow;
  reasons: string[];
}

// ── Eligibility (GET /international/opportunities/:id/eligibility) ──

export type EligibilityCheckKey = 'age' | 'language' | 'experience' | 'availability' | 'documents';

export type EligibilityStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN' | 'NOT_REQUIRED';

export interface EligibilityCheck {
  key: EligibilityCheckKey;
  status: EligibilityStatus;
}

export type OverallEligibility = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN';

export type PassportReadiness = 'READY' | 'IN_PROGRESS' | 'NOT_AVAILABLE';

export interface EligibilityResult {
  checks: EligibilityCheck[];
  overall: OverallEligibility;
  canApply: boolean;
  passportReadiness: PassportReadiness;
  blockers: string[];
}

// ── Pure helpers ────────────────────────────────────────────────

/** Localized text with graceful nulls (descriptions are optional columns). */
export function textFor(
  locale: LocaleCode,
  ar: string | null,
  fr: string | null,
  en: string | null,
): string | null {
  if (locale === 'ar') return ar ?? fr ?? en;
  if (locale === 'fr') return fr ?? en ?? ar;
  return en ?? fr ?? ar;
}

/** Only absolute http(s) URLs may leave the platform as outbound links. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

export function isUuid(value: string | null | undefined): boolean {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Runtime guard so unexpected API strings never reach the localized records. */
export function isProjectType(value: string | null | undefined): value is InternationalProjectType {
  return !!value && (INTERNATIONAL_PROJECT_TYPES as readonly string[]).includes(value);
}

export function isVerificationStatus(
  value: string | null | undefined,
): value is VerificationStatus {
  return !!value && (VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export function categoryLabelFor(
  dict: Dictionary,
  category: string | null | undefined,
): string | null {
  return isProjectType(category) ? dict.international.categories[category] : null;
}

/** OFFICIAL / VERIFIED_PARTNER / EXTERNAL → the dedicated badge copy. */
export function sourceTypeLabelFor(
  dict: Dictionary,
  sourceType: string | null | undefined,
): string | null {
  switch (sourceType) {
    case 'OFFICIAL':
      return dict.international.sourceOfficial;
    case 'VERIFIED_PARTNER':
      return dict.international.sourceVerified;
    case 'EXTERNAL':
      return dict.international.sourceExternal;
    default:
      return null;
  }
}

/** BenefitValue → `benefitValues.*` key; anything unexpected reads as unknown. */
export function benefitValueKey(
  value: string | null | undefined,
): 'included' | 'notIncluded' | 'unknown' {
  if (value === 'INCLUDED') return 'included';
  if (value === 'NOT_INCLUDED') return 'notIncluded';
  return 'unknown';
}

/** `minAge`–`maxAge` bounds, or null when the offer sets neither. */
export function ageRangeText(
  item: Pick<InternationalOpportunityRow, 'minAge' | 'maxAge'>,
): string | null {
  const hasMin = typeof item.minAge === 'number';
  const hasMax = typeof item.maxAge === 'number';
  if (hasMin && hasMax) return `${item.minAge}–${item.maxAge}`;
  if (hasMin) return `${item.minAge}+`;
  if (hasMax) return `≤ ${item.maxAge}`;
  return null;
}

/** Deadline passed → the apply affordances are hidden/disabled (`applyClosed`). */
export function isDeadlinePassed(deadline: string | null | undefined): boolean {
  if (!deadline) return false;
  const time = new Date(deadline).getTime();
  return Number.isFinite(time) && time <= Date.now();
}

/** Recommendation reason → its filter/title label; unknown reasons are dropped. */
export function recommendationReasonLabel(dict: Dictionary, reason: string): string | null {
  switch (reason) {
    case 'category':
      return dict.international.filtersCategory;
    case 'country':
      return dict.international.filtersCountry;
    case 'international_interest':
      return dict.international.title;
    default:
      return null;
  }
}
