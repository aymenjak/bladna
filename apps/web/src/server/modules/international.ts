// International module (spec §70–§71, §4–§11, §21).
//
// Public listings only expose offers whose verificationStatus is not
// REJECTED/SUSPENDED, every write goes through the platform content team
// (`content.manage`), and self-declared volunteer experiences are ALWAYS
// persisted with verified=false — no volunteer-facing endpoint can flip that
// flag; only POST /admin/international/experiences/:id/verify (platform
// verification officers) does, and every flip writes an audit row.
// The BLADNA International surface (countries/providers, deterministic
// eligibility, recommendations, applications, passport, moderation) lives in
// this same module so the route table stays the single source of truth; its
// decision logic is exported as pure functions below and unit-tested without a
// database (international.test.ts).

import { getPrisma, type Prisma } from '@bladna/database';
import {
  AppError,
  type InternationalApplicationStatus,
  type InternationalPassportReadiness,
  type InternationalProjectType,
  type VerificationStatus,
} from '@bladna/types';
import { buildPageMeta, maskEmail, normalizePageParams } from '@bladna/utils';
import {
  adminInternationalApplicationsQuerySchema,
  adminInternationalExperiencesQuerySchema,
  createInternationalApplicationSchema,
  createInternationalExperienceSchema,
  createInternationalOpportunitySchema,
  idParamsSchema,
  internationalApplicationsQuerySchema,
  internationalCountryParamsSchema,
  internationalFiltersSchema,
  internationalProvidersQuerySchema,
  internationalRecommendationsQuerySchema,
  internationalVerificationDecisionSchema,
  paginationQuerySchema,
  updateInternationalApplicationStatusSchema,
  updateInternationalOpportunitySchema,
  updateInternationalPassportSchema,
  verifyInternationalExperienceSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { requireAuth, requireSystemPermission } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

/** The public surface never shows rejected or suspended offers. */
const HIDDEN_FROM_PUBLIC: Array<'REJECTED' | 'SUSPENDED'> = ['REJECTED', 'SUSPENDED'];

const verificationStatusFilterSchema = z.enum([
  'PENDING',
  'UNDER_REVIEW',
  'VERIFIED',
  'REJECTED',
  'SUSPENDED',
  'EXPIRED',
]);

const adminListSchema = internationalFiltersSchema.extend({
  verificationStatus: verificationStatusFilterSchema.optional(),
});

const OPPORTUNITY_PUBLIC_SELECT = {
  id: true,
  titleAr: true,
  titleFr: true,
  titleEn: true,
  descriptionAr: true,
  descriptionFr: true,
  descriptionEn: true,
  countryId: true,
  city: true,
  program: true,
  provider: true,
  eligibility: true,
  ageRequirements: true,
  languageRequirements: true,
  duration: true,
  startDate: true,
  deadline: true,
  accommodation: true,
  food: true,
  transportation: true,
  insurance: true,
  visaInformation: true,
  applicationMethod: true,
  officialSource: true,
  sourceUrl: true,
  sourceType: true,
  verificationStatus: true,
  verifiedAt: true,
  // Structured §5 fields (region/category/skills/age bounds/end date and the
  // remaining benefit flags) — public rows carry them so list, detail, country
  // and recommendation views all render the same enriched shape.
  region: true,
  category: true,
  skills: true,
  minAge: true,
  maxAge: true,
  endDate: true,
  visaSupport: true,
  training: true,
  certificateProvided: true,
  fees: true,
  funding: true,
  allowance: true,
  travelSupport: true,
  createdAt: true,
} as const satisfies Prisma.InternationalOpportunitySelect;

const OPPORTUNITY_ADMIN_SELECT = {
  ...OPPORTUNITY_PUBLIC_SELECT,
  sourceId: true,
  opportunityId: true,
  updatedAt: true,
} as const satisfies Prisma.InternationalOpportunitySelect;

function buildOpportunityWhere(
  f: z.infer<typeof internationalFiltersSchema>,
  options: { excludeHidden: boolean },
): Prisma.InternationalOpportunityWhereInput {
  const where: Prisma.InternationalOpportunityWhereInput = {};
  if (options.excludeHidden) where.verificationStatus = { notIn: HIDDEN_FROM_PUBLIC };
  if (f.countryId) where.countryId = f.countryId;
  if (f.sourceType) where.sourceType = f.sourceType;
  if (f.category) where.category = f.category;
  if (f.verifiedOnly === 'true') where.verificationStatus = 'VERIFIED';
  if (f.deadlineFrom || f.deadlineTo) {
    where.deadline = {
      ...(f.deadlineFrom ? { gte: f.deadlineFrom } : {}),
      ...(f.deadlineTo ? { lte: f.deadlineTo } : {}),
    };
  }
  if (f.q) {
    where.OR = [
      { titleAr: { contains: f.q, mode: 'insensitive' } },
      { titleEn: { contains: f.q, mode: 'insensitive' } },
      { titleFr: { contains: f.q, mode: 'insensitive' } },
      { program: { contains: f.q, mode: 'insensitive' } },
      { provider: { contains: f.q, mode: 'insensitive' } },
    ];
  }
  return where;
}

// ── Shared projections ──────────────────────────────────────────

const COUNTRY_SELECT = {
  id: true,
  code: true,
  nameAr: true,
  nameFr: true,
  nameEn: true,
} as const satisfies Prisma.CountrySelect;

/**
 * Public row + the structured §5 fields the country/recommendation rows and
 * the eligibility engine read (region, skills, age bounds, end date and the
 * remaining benefit flags). The pre-existing list endpoint keeps
 * OPPORTUNITY_PUBLIC_SELECT untouched — this projection only feeds new routes.
 */
const OPPORTUNITY_ROW_SELECT = {
  ...OPPORTUNITY_PUBLIC_SELECT,
  region: true,
  category: true,
  skills: true,
  minAge: true,
  maxAge: true,
  endDate: true,
  visaSupport: true,
  training: true,
  certificateProvided: true,
  fees: true,
  funding: true,
  allowance: true,
  travelSupport: true,
} as const satisfies Prisma.InternationalOpportunitySelect;

/** Offer fields a volunteer's own application rows embed. */
const APPLICATION_OPPORTUNITY_SELECT = {
  id: true,
  titleAr: true,
  titleFr: true,
  titleEn: true,
  city: true,
  program: true,
  provider: true,
  category: true,
  duration: true,
  startDate: true,
  deadline: true,
  country: { select: COUNTRY_SELECT },
} as const satisfies Prisma.InternationalOpportunitySelect;

const MY_APPLICATION_SELECT = {
  id: true,
  status: true,
  motivationLetter: true,
  languages: true,
  availability: true,
  previousExperience: true,
  passportReadiness: true,
  submittedAt: true,
  reviewedAt: true,
  decisionNote: true,
  createdAt: true,
  updatedAt: true,
  opportunity: { select: APPLICATION_OPPORTUNITY_SELECT },
} as const satisfies Prisma.InternationalApplicationSelect;

/**
 * Platform queue row: the same volunteer identity the local (workspace)
 * application list exposes — profile + account basics only, never documents.
 */
const ADMIN_APPLICATION_SELECT = {
  id: true,
  status: true,
  motivationLetter: true,
  languages: true,
  availability: true,
  previousExperience: true,
  passportReadiness: true,
  submittedAt: true,
  reviewedAt: true,
  reviewedById: true,
  decisionNote: true,
  createdAt: true,
  updatedAt: true,
  volunteerProfile: {
    select: {
      id: true,
      volunteerId: true,
      verificationStatus: true,
      publicEmail: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, profileImage: true },
      },
    },
  },
  opportunity: {
    select: { id: true, titleAr: true, titleFr: true, titleEn: true, provider: true },
  },
} as const satisfies Prisma.InternationalApplicationSelect;

type AdminApplicationRow = Prisma.InternationalApplicationGetPayload<{
  select: typeof ADMIN_APPLICATION_SELECT;
}>;

/** `volunteer` (masked like the org list) + `volunteerProfile` identity basics. */
function toAdminApplicationRow(row: AdminApplicationRow): Record<string, unknown> {
  const { volunteerProfile, ...rest } = row;
  return {
    ...rest,
    volunteerProfile: {
      id: volunteerProfile.id,
      volunteerId: volunteerProfile.volunteerId,
      userId: volunteerProfile.user.id,
    },
    volunteer: {
      id: volunteerProfile.id,
      volunteerId: volunteerProfile.volunteerId,
      verificationStatus: volunteerProfile.verificationStatus,
      publicEmail: volunteerProfile.publicEmail,
      user: {
        id: volunteerProfile.user.id,
        firstName: volunteerProfile.user.firstName,
        lastName: volunteerProfile.user.lastName,
        profileImage: volunteerProfile.user.profileImage,
        // Applicant privacy: emails stay masked unless the volunteer opted in.
        email: volunteerProfile.publicEmail
          ? volunteerProfile.user.email
          : maskEmail(volunteerProfile.user.email),
      },
    },
  };
}

const ADMIN_EXPERIENCE_SELECT = {
  id: true,
  volunteerProfileId: true,
  countryId: true,
  opportunityId: true,
  organizationName: true,
  program: true,
  role: true,
  activity: true,
  startDate: true,
  endDate: true,
  hours: true,
  certificateId: true,
  verified: true,
  verifiedBy: true,
  verifiedAt: true,
  sourceUrl: true,
  createdAt: true,
  updatedAt: true,
  volunteerProfile: {
    select: {
      id: true,
      volunteerId: true,
      userId: true,
      verificationStatus: true,
      publicEmail: true,
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, profileImage: true },
      },
    },
  },
} as const satisfies Prisma.InternationalExperienceSelect;

type AdminExperienceRow = Prisma.InternationalExperienceGetPayload<{
  select: typeof ADMIN_EXPERIENCE_SELECT;
}>;

function toAdminExperienceRow(row: AdminExperienceRow): Record<string, unknown> {
  const { volunteerProfile, ...rest } = row;
  return {
    ...rest,
    volunteerProfile: {
      id: volunteerProfile.id,
      volunteerId: volunteerProfile.volunteerId,
      userId: volunteerProfile.userId,
    },
    volunteer: {
      id: volunteerProfile.id,
      volunteerId: volunteerProfile.volunteerId,
      verificationStatus: volunteerProfile.verificationStatus,
      publicEmail: volunteerProfile.publicEmail,
      user: {
        id: volunteerProfile.user.id,
        firstName: volunteerProfile.user.firstName,
        lastName: volunteerProfile.user.lastName,
        profileImage: volunteerProfile.user.profileImage,
        email: volunteerProfile.publicEmail
          ? volunteerProfile.user.email
          : maskEmail(volunteerProfile.user.email),
      },
    },
  };
}

// ── Deterministic decision logic (pure, unit-tested) ────────────

/** Offer states the public surface (and therefore every volunteer route) hides. */
function isHiddenOffer(verificationStatus: VerificationStatus | string): boolean {
  return HIDDEN_FROM_PUBLIC.includes(verificationStatus as 'REJECTED' | 'SUSPENDED');
}

/** Whole years between `dateOfBirth` and `reference` (birthday not yet reached → one less). */
export function ageAt(dateOfBirth: Date, reference: Date): number {
  let age = reference.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = reference.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getDate() < dateOfBirth.getDate())) age -= 1;
  return age;
}

/**
 * Inclusive age bounds evaluated at `reference`; an offer that states no bounds
 * still gets the open [0, 99] window so the result stays deterministic.
 */
export function ageStatusAt(
  dateOfBirth: Date,
  reference: Date,
  minAge: number | null,
  maxAge: number | null,
): 'ELIGIBLE' | 'NOT_ELIGIBLE' {
  const age = ageAt(dateOfBirth, reference);
  return age >= (minAge ?? 0) && age <= (maxAge ?? 99) ? 'ELIGIBLE' : 'NOT_ELIGIBLE';
}

export type EligibilityCheckKey = 'age' | 'language' | 'experience' | 'availability' | 'documents';
export type EligibilityStatus = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN' | 'NOT_REQUIRED';
export type OverallEligibility = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN';
export type EligibilityBlocker =
  | 'deadline_passed'
  | 'already_started'
  | 'duplicate_application'
  | 'not_eligible'
  | 'opportunity_hidden';

export interface EligibilityOpportunityInput {
  verificationStatus: VerificationStatus | string;
  minAge: number | null;
  maxAge: number | null;
  deadline: Date | null;
  startDate: Date | null;
  languageRequirements: string | null;
  skills: string | null;
}

export interface EligibilityProfileInput {
  dateOfBirth: Date | null;
  availability: readonly string[];
  passportReadiness: InternationalPassportReadiness;
}

export interface EligibilityCheck {
  key: EligibilityCheckKey;
  status: EligibilityStatus;
}

export interface EligibilityResult {
  checks: EligibilityCheck[];
  overall: OverallEligibility;
  canApply: boolean;
  passportReadiness: InternationalPassportReadiness;
  blockers: EligibilityBlocker[];
}

/**
 * §11 deterministic eligibility engine (checks in fixed order:
 * age → language → experience → availability → documents):
 *
 *  - age: evaluated inclusively against `[minAge ?? 0, maxAge ?? 99]` at
 *    `startDate ?? now`; no birth date on file → UNKNOWN.
 *  - language: requirement text absent → NOT_REQUIRED, otherwise UNKNOWN
 *    (the platform never claims a level it has not assessed).
 *  - experience: same rule driven by the offer's `skills` text.
 *  - availability: at least one declared slot → ELIGIBLE, none → UNKNOWN.
 *  - documents: offers declare no document requirements → always NOT_REQUIRED.
 *
 * `overall` ranks NOT_ELIGIBLE > UNKNOWN > ELIGIBLE; `canApply` additionally
 * needs a profile and zero blockers. A null profile yields UNKNOWN checks, an
 * `NOT_AVAILABLE` readiness and `canApply: false` — the HTTP handler reports
 * that case as the "Complete your volunteer profile first." business rule
 * before ever calling the engine.
 */
export function evaluateEligibility(input: {
  opportunity: EligibilityOpportunityInput;
  profile: EligibilityProfileInput | null;
  hasActiveApplication: boolean;
  now: Date;
}): EligibilityResult {
  const { opportunity, profile, hasActiveApplication, now } = input;

  const blockers: EligibilityBlocker[] = [];
  if (opportunity.deadline && opportunity.deadline.getTime() <= now.getTime()) {
    blockers.push('deadline_passed');
  }
  if (opportunity.startDate && opportunity.startDate.getTime() <= now.getTime()) {
    blockers.push('already_started');
  }
  if (hasActiveApplication) blockers.push('duplicate_application');

  const reference = opportunity.startDate ?? now;
  const languageRequired = Boolean(opportunity.languageRequirements?.trim());
  const skillsRequired = Boolean(opportunity.skills?.trim());

  const checks: EligibilityCheck[] = [
    {
      key: 'age',
      status:
        profile && profile.dateOfBirth
          ? ageStatusAt(profile.dateOfBirth, reference, opportunity.minAge, opportunity.maxAge)
          : 'UNKNOWN',
    },
    { key: 'language', status: languageRequired ? 'UNKNOWN' : 'NOT_REQUIRED' },
    { key: 'experience', status: skillsRequired ? 'UNKNOWN' : 'NOT_REQUIRED' },
    {
      key: 'availability',
      status: profile && profile.availability.length > 0 ? 'ELIGIBLE' : 'UNKNOWN',
    },
    { key: 'documents', status: 'NOT_REQUIRED' },
  ];

  if (checks.some((check) => check.status === 'NOT_ELIGIBLE')) blockers.push('not_eligible');
  if (isHiddenOffer(opportunity.verificationStatus)) blockers.push('opportunity_hidden');

  const overall: OverallEligibility = checks.some((check) => check.status === 'NOT_ELIGIBLE')
    ? 'NOT_ELIGIBLE'
    : checks.some((check) => check.status === 'UNKNOWN')
      ? 'UNKNOWN'
      : 'ELIGIBLE';

  return {
    checks,
    overall,
    canApply: profile !== null && blockers.length === 0 && overall !== 'NOT_ELIGIBLE',
    passportReadiness: profile?.passportReadiness ?? 'NOT_AVAILABLE',
    blockers,
  };
}

/**
 * Server-side re-check performed by POST /international/applications, in order:
 * an active duplicate is 409 CONFLICT, then deadline/start date/age failures
 * are 422 business rules (mirroring the local apply endpoint's wording).
 * A missing birth date cannot fail the age rule — it simply cannot be checked.
 */
export function assertInternationalApplicationAllowed(input: {
  opportunity: EligibilityOpportunityInput;
  dateOfBirth: Date | null;
  hasActiveApplication: boolean;
  now: Date;
}): void {
  const { opportunity, dateOfBirth, now } = input;
  if (input.hasActiveApplication) {
    throw AppError.conflict('You have already applied to this opportunity.');
  }
  if (opportunity.deadline && opportunity.deadline.getTime() <= now.getTime()) {
    throw AppError.businessRule('The application deadline for this opportunity has passed.');
  }
  if (opportunity.startDate && opportunity.startDate.getTime() <= now.getTime()) {
    throw AppError.businessRule('This opportunity has already started.');
  }
  if (!dateOfBirth) return;

  const reference = opportunity.startDate ?? now;
  if (
    ageStatusAt(dateOfBirth, reference, opportunity.minAge, opportunity.maxAge) !== 'NOT_ELIGIBLE'
  ) {
    return;
  }
  const age = ageAt(dateOfBirth, reference);
  if (opportunity.minAge !== null && age < opportunity.minAge) {
    throw AppError.businessRule(
      `You must be at least ${opportunity.minAge} years old for this opportunity.`,
    );
  }
  if (opportunity.maxAge !== null && age > opportunity.maxAge) {
    throw AppError.businessRule(
      `This opportunity accepts participants up to ${opportunity.maxAge} years old.`,
    );
  }
  throw AppError.businessRule('You do not meet the age requirements for this opportunity.');
}

/** Volunteer-side withdraw window (§9) — terminal decisions never reopen. */
export const INTERNATIONAL_WITHDRAWABLE_STATUSES: readonly InternationalApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'WAITLISTED',
];

export function isWithdrawableInternationalStatus(status: string): boolean {
  return INTERNATIONAL_WITHDRAWABLE_STATUSES.includes(status as InternationalApplicationStatus);
}

/**
 * Platform transition machine for international applications (§9) — defined
 * locally, exactly like ORGANIZATION_STATUS_TRANSITIONS in admin.ts, because
 * the local application machine deliberately differs (SHORTLISTED/INTERVIEW/
 * WAITLISTED have no WITHDRAWN edge: the volunteer's own withdraw endpoint
 * covers those, the platform queue does not).
 */
export const INTERNATIONAL_APPLICATION_TRANSITIONS: Record<
  InternationalApplicationStatus,
  readonly InternationalApplicationStatus[]
> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
  UNDER_REVIEW: ['SHORTLISTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  SHORTLISTED: ['INTERVIEW', 'WAITLISTED', 'REJECTED'],
  INTERVIEW: ['ACCEPTED', 'WAITLISTED', 'REJECTED'],
  WAITLISTED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['COMPLETED'],
  REJECTED: [],
  WITHDRAWN: [],
  COMPLETED: [],
};

export function canTransitionInternationalApplication(
  from: InternationalApplicationStatus,
  to: InternationalApplicationStatus,
): boolean {
  return (INTERNATIONAL_APPLICATION_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses that stamp `reviewedAt`/`reviewedById` when the queue decides them. */
const REVIEWED_ON: readonly InternationalApplicationStatus[] = [
  'ACCEPTED',
  'REJECTED',
  'COMPLETED',
];

export function recordsReviewOn(status: InternationalApplicationStatus): boolean {
  return REVIEWED_ON.includes(status);
}

/**
 * `verifiedAt` update for POST /admin/international/opportunities/:id/verification:
 * stamp on becoming VERIFIED, clear when leaving it, undefined when the flag
 * does not move (so an unchanged stamp is never overwritten with `now`).
 */
export function verifiedAtFor(
  current: VerificationStatus,
  next: VerificationStatus,
  now: Date,
): Date | null | undefined {
  if (next === 'VERIFIED' && current !== 'VERIFIED') return now;
  if (next !== 'VERIFIED' && current === 'VERIFIED') return null;
  return undefined;
}

// ── Recommendations (pure scoring) ──────────────────────────────

export type RecommendationReason = 'category' | 'country' | 'international_interest';

export interface RecommendationCandidate {
  id: string;
  category: InternationalProjectType;
  countryId: string | null;
  deadline: Date | null;
}

export interface RecommendationPreferences {
  preferredCategories: readonly InternationalProjectType[];
  preferredCountryIds: readonly string[];
  internationalPreference: boolean;
}

export interface RecommendationRank {
  id: string;
  score: number;
  reasons: RecommendationReason[];
  deadline: Date | null;
}

function byScoreThenDeadline(a: RecommendationRank, b: RecommendationRank): number {
  if (b.score !== a.score) return b.score - a.score;
  // Deadlines ascending, offers without a deadline last, id as the stable tie-break.
  if (a.deadline && b.deadline) {
    const delta = a.deadline.getTime() - b.deadline.getTime();
    if (delta !== 0) return delta;
  } else if (a.deadline) {
    return -1;
  } else if (b.deadline) {
    return 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * §58 scoring: +2 for a preferred category, +2 for a preferred country.
 * Offers that score 0 are dropped; when nothing scores and the volunteer set
 * `internationalPreference`, every still-open offer is offered with the single
 * `international_interest` reason (otherwise the strip stays empty).
 * `internationalInterest` is appended to ranked rows for the same volunteers.
 */
export function rankRecommendations(
  candidates: readonly RecommendationCandidate[],
  preferences: RecommendationPreferences,
  limit: number,
  now: Date,
): RecommendationRank[] {
  const scored: RecommendationRank[] = [];
  for (const candidate of candidates) {
    const reasons: RecommendationReason[] = [];
    let score = 0;
    if (preferences.preferredCategories.includes(candidate.category)) {
      score += 2;
      reasons.push('category');
    }
    if (candidate.countryId && preferences.preferredCountryIds.includes(candidate.countryId)) {
      score += 2;
      reasons.push('country');
    }
    if (score > 0) {
      if (preferences.internationalPreference) reasons.push('international_interest');
      scored.push({ id: candidate.id, score, reasons, deadline: candidate.deadline });
    }
  }

  if (scored.length === 0) {
    if (!preferences.internationalPreference) return [];
    const fallback: RecommendationRank[] = candidates
      .filter((candidate) => !candidate.deadline || candidate.deadline.getTime() > now.getTime())
      .map((candidate): RecommendationRank => ({
        id: candidate.id,
        score: 0,
        reasons: ['international_interest'],
        deadline: candidate.deadline,
      }))
      .sort(byScoreThenDeadline)
      .slice(0, limit);
    return fallback;
  }

  return scored.sort(byScoreThenDeadline).slice(0, limit);
}

// ── Aggregation shaping (pure) ──────────────────────────────────

export interface CountryAggregateRow {
  id: string;
  code: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  opportunityCount: number;
}

/** Join `groupBy(countryId)` counts onto their country rows, count desc then nameEn asc. */
export function buildCountryAggregates(
  countries: ReadonlyArray<Omit<CountryAggregateRow, 'opportunityCount'>>,
  counts: ReadonlyArray<{ countryId: string; count: number }>,
): CountryAggregateRow[] {
  const countByCountry = new Map(counts.map((row) => [row.countryId, row.count]));
  return countries
    .map((country) => ({
      ...country,
      opportunityCount: countByCountry.get(country.id) ?? 0,
    }))
    .filter((row) => row.opportunityCount > 0)
    .sort((a, b) => b.opportunityCount - a.opportunityCount || a.nameEn.localeCompare(b.nameEn));
}

export interface ProviderAggregateRow {
  provider: string;
  opportunityCount: number;
}

/** Provider rows ordered by count desc, then provider name asc. */
export function orderProviderAggregates(
  rows: readonly ProviderAggregateRow[],
): ProviderAggregateRow[] {
  return [...rows].sort(
    (a, b) => b.opportunityCount - a.opportunityCount || a.provider.localeCompare(b.provider),
  );
}

export async function publicList(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, internationalFiltersSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = buildOpportunityWhere(f, { excludeHidden: true });
  const [total, items] = await Promise.all([
    prisma.internationalOpportunity.count({ where }),
    prisma.internationalOpportunity.findMany({
      where,
      select: OPPORTUNITY_PUBLIC_SELECT,
      orderBy:
        f.sort === 'recent'
          ? { createdAt: 'desc' as const }
          : [
              { deadline: { sort: 'asc' as const, nulls: 'last' as const } },
              { createdAt: 'desc' as const },
            ],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function publicDetail(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const offer = await getPrisma().internationalOpportunity.findFirst({
    where: { id, verificationStatus: { notIn: HIDDEN_FROM_PUBLIC } },
    select: OPPORTUNITY_PUBLIC_SELECT,
  });
  if (!offer) throw AppError.notFound('Opportunity not found.');
  return { opportunity: offer };
}

// ── Aggregated public indexes ───────────────────────────────────

/** Countries that have at least one visible offer, most offers first. */
async function listCountries(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, paginationQuerySchema);
  const { page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const groups = await prisma.internationalOpportunity.groupBy({
    by: ['countryId'],
    where: { countryId: { not: null }, verificationStatus: { notIn: HIDDEN_FROM_PUBLIC } },
    _count: { _all: true },
  });
  const counts = groups
    .filter((group) => group.countryId !== null)
    .map((group) => ({ countryId: group.countryId as string, count: group._count._all }));

  const countries = counts.length
    ? await prisma.country.findMany({
        where: { id: { in: counts.map((row) => row.countryId) } },
        select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true },
      })
    : [];

  const rows = buildCountryAggregates(countries, counts);
  const total = rows.length;
  const items = rows.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** One country's profile plus its visible offers (deadline ascending). */
async function countryDetail(ctx: RequestContext): Promise<unknown> {
  const { code } = pathParams(ctx, internationalCountryParamsSchema);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const country = await prisma.country.findFirst({
    where: { code: { equals: code.toUpperCase(), mode: 'insensitive' } },
    select: COUNTRY_SELECT,
  });
  if (!country) throw AppError.notFound('Country not found.');

  const where: Prisma.InternationalOpportunityWhereInput = {
    countryId: country.id,
    verificationStatus: { notIn: HIDDEN_FROM_PUBLIC },
  };
  const [total, items] = await Promise.all([
    prisma.internationalOpportunity.count({ where }),
    prisma.internationalOpportunity.findMany({
      where,
      select: OPPORTUNITY_ROW_SELECT,
      orderBy: [{ deadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { country, items, meta: buildPageMeta(total, { page, limit }) };
}

/** Distinct providers of visible offers, with their offer counts. */
async function listProviders(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, internationalProvidersQuerySchema);
  const { page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const groups = await prisma.internationalOpportunity.groupBy({
    by: ['provider'],
    where: {
      verificationStatus: { notIn: HIDDEN_FROM_PUBLIC },
      ...(f.q ? { provider: { contains: f.q, mode: 'insensitive' } } : {}),
    },
    _count: { _all: true },
  });

  const rows = orderProviderAggregates(
    groups.map((group) => ({ provider: group.provider, opportunityCount: group._count._all })),
  );
  const total = rows.length;
  const items = rows.slice((page - 1) * limit, (page - 1) * limit + limit);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── BLADNA International: volunteer surface ─────────────────────

/** One *active* application per volunteer per offer (the partial unique index in 0007). */
const ACTIVE_APPLICATION_STATUSES: readonly InternationalApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'ACCEPTED',
  'WAITLISTED',
];

const PASSPORT_SELECT = {
  id: true,
  passportReadiness: true,
  travelReady: true,
  emergencyContactReady: true,
  preferredCategories: true,
  dateOfBirth: true,
  preferredCountries: { select: COUNTRY_SELECT, orderBy: { nameEn: 'asc' as const } },
} as const satisfies Prisma.VolunteerProfileSelect;

type PassportProfile = Prisma.VolunteerProfileGetPayload<{ select: typeof PASSPORT_SELECT }>;

const MY_EXPERIENCE_SELECT = {
  id: true,
  countryId: true,
  opportunityId: true,
  organizationName: true,
  program: true,
  role: true,
  activity: true,
  startDate: true,
  endDate: true,
  hours: true,
  certificateId: true,
  verified: true,
  sourceUrl: true,
  createdAt: true,
} as const satisfies Prisma.InternationalExperienceSelect;

/** Passport stats: distinct visited countries, declared programs, verified hours, certificates. */
async function passportStats(profileId: string): Promise<{
  countries: number;
  programs: number;
  verifiedHours: string;
  certificates: number;
}> {
  const prisma = getPrisma();
  const [countryRows, programs, hours, certificates] = await Promise.all([
    prisma.internationalExperience.findMany({
      where: { volunteerProfileId: profileId, countryId: { not: null } },
      distinct: ['countryId'],
      select: { countryId: true },
    }),
    prisma.internationalExperience.count({ where: { volunteerProfileId: profileId } }),
    prisma.internationalExperience.aggregate({
      where: { volunteerProfileId: profileId, verified: true },
      _sum: { hours: true },
    }),
    prisma.volunteerCertificate.count({ where: { volunteerProfileId: profileId } }),
  ]);
  return {
    countries: countryRows.filter((row) => row.countryId !== null).length,
    programs,
    // Decimal sums serialize as strings so the payload never loses precision.
    verifiedHours: hours._sum.hours?.toString() ?? '0',
    certificates,
  };
}

async function buildPassport(profile: PassportProfile): Promise<Record<string, unknown>> {
  const [stats, experiences] = await Promise.all([
    passportStats(profile.id),
    getPrisma().internationalExperience.findMany({
      where: { volunteerProfileId: profile.id },
      select: MY_EXPERIENCE_SELECT,
      orderBy: { startDate: 'desc' },
      take: 10,
    }),
  ]);
  return {
    readiness: profile.passportReadiness,
    travelReady: profile.travelReady,
    emergencyContactReady: profile.emergencyContactReady,
    preferredCategories: profile.preferredCategories,
    preferredCountries: profile.preferredCountries,
    // Serialized as an ISO string: SSR pages consume this in-process (no JSON
    // round-trip), where a raw Date would crash `.slice(0, 10)` consumers.
    dateOfBirth: profile.dateOfBirth ? profile.dateOfBirth.toISOString() : null,
    stats,
    experiences,
  };
}

/** §11 personalized eligibility (404 for hidden/missing offers, 422 without a profile). */
async function eligibility(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const offer = await prisma.internationalOpportunity.findUnique({
    where: { id },
    select: {
      verificationStatus: true,
      minAge: true,
      maxAge: true,
      deadline: true,
      startDate: true,
      languageRequirements: true,
      skills: true,
    },
  });
  if (!offer || isHiddenOffer(offer.verificationStatus)) {
    throw AppError.notFound('Opportunity not found.');
  }

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true, dateOfBirth: true, availability: true, passportReadiness: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const duplicate = await prisma.internationalApplication.findFirst({
    where: {
      opportunityId: id,
      volunteerProfileId: profile.id,
      status: { in: [...ACTIVE_APPLICATION_STATUSES] },
    },
    select: { id: true },
  });

  return evaluateEligibility({
    opportunity: offer,
    profile: {
      dateOfBirth: profile.dateOfBirth,
      availability: profile.availability,
      passportReadiness: profile.passportReadiness,
    },
    hasActiveApplication: duplicate !== null,
    now: new Date(),
  });
}

/** §58 personalized recommendation strip (limit default 6, maximum 12). */
async function recommendations(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, internationalRecommendationsQuerySchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: {
      preferredCategories: true,
      internationalPreference: true,
      preferredCountries: { select: { id: true } },
    },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const candidates = await prisma.internationalOpportunity.findMany({
    where: { verificationStatus: { notIn: HIDDEN_FROM_PUBLIC } },
    select: { id: true, category: true, countryId: true, deadline: true },
  });
  const ranked = rankRecommendations(
    candidates,
    {
      preferredCategories: profile.preferredCategories,
      preferredCountryIds: profile.preferredCountries.map((country) => country.id),
      internationalPreference: profile.internationalPreference,
    },
    f.limit,
    new Date(),
  );

  const rows = ranked.length
    ? await prisma.internationalOpportunity.findMany({
        where: {
          id: { in: ranked.map((row) => row.id) },
          verificationStatus: { notIn: HIDDEN_FROM_PUBLIC },
        },
        select: OPPORTUNITY_ROW_SELECT,
      })
    : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items = ranked.flatMap((row) => {
    const opportunity = byId.get(row.id);
    return opportunity ? [{ opportunity, reasons: [...row.reasons] }] : [];
  });
  return { items, meta: buildPageMeta(items.length, { page: 1, limit: f.limit }) };
}

async function myInternationalApplications(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, internationalApplicationsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const where: Prisma.InternationalApplicationWhereInput = {
    volunteerProfileId: profile.id,
    ...(f.status ? { status: f.status } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.internationalApplication.count({ where }),
    prisma.internationalApplication.findMany({
      where,
      select: MY_APPLICATION_SELECT,
      orderBy: { submittedAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function createInternationalApplication(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, createInternationalApplicationSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true, dateOfBirth: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const offer = await prisma.internationalOpportunity.findUnique({
    where: { id: input.opportunityId },
    select: {
      id: true,
      verificationStatus: true,
      minAge: true,
      maxAge: true,
      deadline: true,
      startDate: true,
      languageRequirements: true,
      skills: true,
    },
  });
  if (!offer || isHiddenOffer(offer.verificationStatus)) {
    throw AppError.notFound('Opportunity not found.');
  }

  const duplicate = await prisma.internationalApplication.findFirst({
    where: {
      opportunityId: offer.id,
      volunteerProfileId: profile.id,
      status: { in: [...ACTIVE_APPLICATION_STATUSES] },
    },
    select: { id: true },
  });

  // Server-side re-check: duplicate 409, deadline/start/age 422.
  assertInternationalApplicationAllowed({
    opportunity: offer,
    dateOfBirth: profile.dateOfBirth,
    hasActiveApplication: duplicate !== null,
    now: new Date(),
  });

  let applicationId: string;
  try {
    const created = await prisma.internationalApplication.create({
      data: {
        opportunityId: offer.id,
        volunteerProfileId: profile.id,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        motivationLetter: input.motivationLetter ?? null,
        languages: input.languages ?? null,
        availability: input.availability ?? null,
        previousExperience: input.previousExperience ?? null,
        passportReadiness: input.passportReadiness,
      },
      select: { id: true },
    });
    applicationId = created.id;
  } catch (error) {
    // Partial unique index: a concurrent duplicate loses here with P2002.
    if (isUniqueViolation(error)) {
      throw AppError.conflict('You have already applied to this opportunity.');
    }
    throw error;
  }

  await audit({
    actorUserId: user.userId,
    action: 'international.application_create',
    entityType: 'internationalApplication',
    entityId: applicationId,
    after: {
      opportunityId: offer.id,
      status: 'SUBMITTED',
      passportReadiness: input.passportReadiness,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const application = await prisma.internationalApplication.findUnique({
    where: { id: applicationId },
    select: MY_APPLICATION_SELECT,
  });
  return { application };
}

async function myInternationalApplicationDetail(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.notFound('Application not found.');

  const application = await prisma.internationalApplication.findFirst({
    where: { id, volunteerProfileId: profile.id },
    select: MY_APPLICATION_SELECT,
  });
  if (!application) throw AppError.notFound('Application not found.');
  return { application };
}

async function withdrawInternationalApplication(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.notFound('Application not found.');

  const application = await prisma.internationalApplication.findFirst({
    where: { id, volunteerProfileId: profile.id },
    select: { id: true, status: true },
  });
  if (!application) throw AppError.notFound('Application not found.');

  if (!isWithdrawableInternationalStatus(application.status)) {
    throw AppError.businessRule(
      `An international application with status ${application.status} can no longer be withdrawn.`,
    );
  }

  const updated = await prisma.internationalApplication.update({
    where: { id: application.id },
    data: { status: 'WITHDRAWN' },
    select: { id: true, status: true },
  });

  await audit({
    actorUserId: user.userId,
    action: 'international.application_withdraw',
    entityType: 'internationalApplication',
    entityId: application.id,
    before: { status: application.status },
    after: { status: 'WITHDRAWN' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { application: updated };
}

async function getPassport(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: PASSPORT_SELECT,
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');
  return { passport: await buildPassport(profile) };
}

async function updatePassport(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, updateInternationalPassportSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  let preferredCountryIds: string[] | undefined;
  if (input.preferredCountryIds !== undefined) {
    preferredCountryIds = [...new Set(input.preferredCountryIds)];
    const known = await prisma.country.findMany({
      where: { id: { in: preferredCountryIds } },
      select: { id: true },
    });
    const knownIds = new Set(known.map((row) => row.id));
    const missing = preferredCountryIds.filter((id) => !knownIds.has(id));
    if (missing.length > 0) {
      throw AppError.validation('One or more preferred countries do not exist.', [
        {
          path: 'preferredCountryIds',
          code: 'not_found',
          message: `Unknown country ids: ${missing.join(', ')}`,
        },
      ]);
    }
  }
  const preferredCategories =
    input.preferredCategories !== undefined ? [...new Set(input.preferredCategories)] : undefined;

  await prisma.volunteerProfile.update({
    where: { id: profile.id },
    data: {
      ...(input.passportReadiness !== undefined
        ? { passportReadiness: input.passportReadiness }
        : {}),
      ...(input.travelReady !== undefined ? { travelReady: input.travelReady } : {}),
      ...(input.emergencyContactReady !== undefined
        ? { emergencyContactReady: input.emergencyContactReady }
        : {}),
      ...(preferredCategories !== undefined ? { preferredCategories } : {}),
      ...(preferredCountryIds !== undefined
        ? { preferredCountries: { set: preferredCountryIds.map((id) => ({ id })) } }
        : {}),
      ...(input.dateOfBirth !== undefined ? { dateOfBirth: new Date(input.dateOfBirth) } : {}),
    },
  });

  await audit({
    actorUserId: user.userId,
    action: 'international.passport_update',
    entityType: 'volunteerProfile',
    entityId: profile.id,
    after: { fields: Object.keys(input) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const updated = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: PASSPORT_SELECT,
  });
  if (!updated) throw AppError.businessRule('Complete your volunteer profile first.');
  return { passport: await buildPassport(updated) };
}

// ── Platform content desk ──────────────────────────────────────

async function adminList(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'opportunity.read:platform');
  const f = query(ctx, adminListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = buildOpportunityWhere(f, { excludeHidden: false });
  if (f.verificationStatus) where.verificationStatus = f.verificationStatus;

  const [total, items] = await Promise.all([
    prisma.internationalOpportunity.count({ where }),
    prisma.internationalOpportunity.findMany({
      where,
      select: OPPORTUNITY_ADMIN_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function adminDetail(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'opportunity.read:platform');
  const { id } = pathParams(ctx, idParamsSchema);
  const offer = await getPrisma().internationalOpportunity.findUnique({
    where: { id },
    select: OPPORTUNITY_ADMIN_SELECT,
  });
  if (!offer) throw AppError.notFound('Opportunity not found.');
  return { opportunity: offer };
}

async function adminCreate(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const input = await body(ctx, createInternationalOpportunitySchema);
  const prisma = getPrisma();

  if (input.sourceId) {
    const source = await prisma.opportunitySource.findUnique({
      where: { id: input.sourceId },
      select: { id: true },
    });
    if (!source) {
      throw AppError.validation('sourceId does not exist.', [
        { path: 'sourceId', code: 'not_found', message: 'Referenced source does not exist.' },
      ]);
    }
  }

  const offer = await prisma.internationalOpportunity.create({
    data: {
      titleAr: input.titleAr,
      titleFr: input.titleFr,
      titleEn: input.titleEn,
      descriptionAr: input.descriptionAr ?? null,
      descriptionFr: input.descriptionFr ?? null,
      descriptionEn: input.descriptionEn ?? null,
      countryId: input.countryId ?? null,
      city: input.city ?? null,
      program: input.program,
      provider: input.provider,
      eligibility: input.eligibility ?? null,
      ageRequirements: input.ageRequirements ?? null,
      languageRequirements: input.languageRequirements ?? null,
      duration: input.duration ?? null,
      startDate: input.startDate ?? null,
      deadline: input.deadline ?? null,
      accommodation: input.accommodation,
      food: input.food,
      transportation: input.transportation,
      insurance: input.insurance,
      visaInformation: input.visaInformation ?? null,
      applicationMethod: input.applicationMethod ?? null,
      officialSource: input.officialSource ?? null,
      sourceUrl: input.sourceUrl ?? null,
      sourceId: input.sourceId ?? null,
      sourceType: input.sourceType,
      verificationStatus: 'PENDING' as const,
    },
    select: OPPORTUNITY_ADMIN_SELECT,
  });
  await audit({
    actorUserId: user.userId,
    action: 'international.opportunity_create',
    entityType: 'internationalOpportunity',
    entityId: offer.id,
    after: { program: input.program, provider: input.provider },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { opportunity: offer };
}

async function adminUpdate(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, updateInternationalOpportunitySchema);

  const existing = await getPrisma().internationalOpportunity.findUnique({
    where: { id },
    select: { id: true, verificationStatus: true },
  });
  if (!existing) throw AppError.notFound('Opportunity not found.');

  // Unchecked input: the checked UpdateInput only accepts relation objects,
  // while this handler patches scalar FKs (countryId/sourceId) directly.
  const data: Prisma.InternationalOpportunityUncheckedUpdateInput = {};
  const scalarKeys = [
    'titleAr',
    'titleFr',
    'titleEn',
    'descriptionAr',
    'descriptionFr',
    'descriptionEn',
    'city',
    'program',
    'provider',
    'eligibility',
    'ageRequirements',
    'languageRequirements',
    'duration',
    'startDate',
    'deadline',
    'accommodation',
    'food',
    'transportation',
    'insurance',
    'visaInformation',
    'applicationMethod',
    'officialSource',
    'sourceUrl',
    'sourceType',
  ] as const;
  for (const key of scalarKeys) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) (data as Record<string, unknown>)[key] = value;
  }
  if (input.countryId !== undefined) data.countryId = input.countryId;
  if (input.sourceId !== undefined) data.sourceId = input.sourceId;

  const opportunity = await getPrisma().internationalOpportunity.update({ where: { id }, data });
  await audit({
    actorUserId: user.userId,
    action: 'international.opportunity_update',
    entityType: 'internationalOpportunity',
    entityId: id,
    before: { verificationStatus: existing.verificationStatus },
    after: { fields: Object.keys(data) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { opportunity };
}

// ── Volunteer self-declared experiences ────────────────────────

async function myList(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const where: Prisma.InternationalExperienceWhereInput = { volunteerProfileId: profile.id };
  const [total, items] = await Promise.all([
    prisma.internationalExperience.count({ where }),
    prisma.internationalExperience.findMany({
      where,
      select: {
        id: true,
        countryId: true,
        organizationName: true,
        program: true,
        activity: true,
        startDate: true,
        endDate: true,
        hours: true,
        certificateId: true,
        verified: true,
        sourceUrl: true,
        createdAt: true,
      },
      orderBy: { startDate: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function createExperience(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, createInternationalExperienceSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  if (input.certificateId) {
    const certificate = await prisma.volunteerCertificate.findFirst({
      where: { id: input.certificateId, volunteerProfileId: profile.id },
      select: { id: true },
    });
    if (!certificate) {
      throw AppError.validation('certificateId must reference one of your own certificates.', [
        {
          path: 'certificateId',
          code: 'not_owned',
          message: 'Certificate not found on your profile.',
        },
      ]);
    }
  }

  if (input.opportunityId) {
    const offer = await prisma.internationalOpportunity.findUnique({
      where: { id: input.opportunityId },
      select: { id: true },
    });
    if (!offer) {
      throw AppError.validation('opportunityId must reference an existing international offer.', [
        {
          path: 'opportunityId',
          code: 'not_found',
          message: 'Referenced international offer does not exist.',
        },
      ]);
    }
  }

  // Self-declared experiences are never verified through this endpoint.
  const experience = await prisma.internationalExperience.create({
    data: {
      volunteerProfileId: profile.id,
      countryId: input.countryId ?? null,
      opportunityId: input.opportunityId ?? null,
      organizationName: input.organizationName,
      program: input.program,
      role: input.role ?? null,
      activity: input.activity ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      hours: input.hours ?? null,
      certificateId: input.certificateId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      verified: false,
    },
  });
  await audit({
    actorUserId: user.userId,
    action: 'international.experience_create',
    entityType: 'internationalExperience',
    entityId: experience.id,
    after: { organizationName: input.organizationName, verified: false },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { experience };
}

// ── BLADNA International: platform moderation ───────────────────

/** POST /admin/international/opportunities/:id/verification — `content.manage`, append-only events. */
async function adminSetVerification(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, internationalVerificationDecisionSchema);
  const prisma = getPrisma();

  const offer = await prisma.internationalOpportunity.findUnique({
    where: { id },
    select: { id: true, verificationStatus: true },
  });
  if (!offer) throw AppError.notFound('Opportunity not found.');

  const now = new Date();
  const verifiedAt = verifiedAtFor(offer.verificationStatus, input.status, now);

  const { opportunity, event } = await prisma.$transaction(async (tx) => {
    const updated = await tx.internationalOpportunity.update({
      where: { id: offer.id },
      data: {
        verificationStatus: input.status,
        ...(verifiedAt !== undefined ? { verifiedAt } : {}),
      },
      select: OPPORTUNITY_ADMIN_SELECT,
    });
    // Append-only history: every step adds a row, existing rows are never rewritten.
    const appended = await tx.internationalVerificationEvent.create({
      data: {
        opportunityId: offer.id,
        status: input.status,
        notes: input.notes ?? null,
        checkedById: user.userId,
      },
    });
    return { opportunity: updated, event: appended };
  });

  await audit({
    actorUserId: user.userId,
    action: 'international.opportunity_verification',
    entityType: 'internationalOpportunity',
    entityId: offer.id,
    before: { verificationStatus: offer.verificationStatus },
    after: { verificationStatus: input.status, notes: input.notes ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { opportunity, event };
}

/** GET /admin/international/opportunities/:id/events — `opportunity.read:platform`, newest first. */
async function adminVerificationEvents(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'opportunity.read:platform');
  const { id } = pathParams(ctx, idParamsSchema);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const offer = await prisma.internationalOpportunity.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!offer) throw AppError.notFound('Opportunity not found.');

  const where = { opportunityId: id };
  const [total, items] = await Promise.all([
    prisma.internationalVerificationEvent.count({ where }),
    prisma.internationalVerificationEvent.findMany({
      where,
      orderBy: { checkedAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** GET /admin/international/applications — same `application.read` the local application list uses. */
async function adminApplicationList(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'application.read');
  const f = query(ctx, adminInternationalApplicationsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.InternationalApplicationWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.opportunityId ? { opportunityId: f.opportunityId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.internationalApplication.count({ where }),
    prisma.internationalApplication.findMany({
      where,
      select: ADMIN_APPLICATION_SELECT,
      orderBy: { submittedAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items: rows.map(toAdminApplicationRow), meta: buildPageMeta(total, { page, limit }) };
}

/** PATCH /admin/international/applications/:id — strict transition machine + audited decision. */
async function adminApplicationStatus(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'application.read');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, updateInternationalApplicationStatusSchema);
  const prisma = getPrisma();

  const application = await prisma.internationalApplication.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!application) throw AppError.notFound('Application not found.');

  if (!canTransitionInternationalApplication(application.status, input.status)) {
    throw AppError.businessRule(
      `An international application cannot move from ${application.status} to ${input.status}.`,
    );
  }

  const updated = await prisma.internationalApplication.update({
    where: { id: application.id },
    data: {
      status: input.status,
      ...(input.decisionNote !== undefined ? { decisionNote: input.decisionNote } : {}),
      ...(recordsReviewOn(input.status)
        ? { reviewedAt: new Date(), reviewedById: user.userId }
        : {}),
    },
    select: ADMIN_APPLICATION_SELECT,
  });

  await audit({
    actorUserId: user.userId,
    action: 'international.application_status',
    entityType: 'internationalApplication',
    entityId: application.id,
    before: { status: application.status },
    after: { status: input.status, decisionNote: input.decisionNote ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { application: toAdminApplicationRow(updated) };
}

/** GET /admin/international/experiences — self-declared rows awaiting verification. */
async function adminExperienceList(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'organization.verify');
  const f = query(ctx, adminInternationalExperiencesQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.InternationalExperienceWhereInput = {
    ...(f.verified !== undefined ? { verified: f.verified === 'true' } : {}),
    ...(f.volunteerProfileId ? { volunteerProfileId: f.volunteerProfileId } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.internationalExperience.count({ where }),
    prisma.internationalExperience.findMany({
      where,
      select: ADMIN_EXPERIENCE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items: rows.map(toAdminExperienceRow), meta: buildPageMeta(total, { page, limit }) };
}

/** POST /admin/international/experiences/:id/verify — stamps or clears the reviewer. */
async function adminExperienceVerify(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'organization.verify');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, verifyInternationalExperienceSchema);
  const prisma = getPrisma();

  const existing = await prisma.internationalExperience.findUnique({
    where: { id },
    select: { id: true, verified: true },
  });
  if (!existing) throw AppError.notFound('Experience not found.');

  const now = new Date();
  const experience = await prisma.internationalExperience.update({
    where: { id: existing.id },
    data: input.verified
      ? { verified: true, verifiedBy: user.userId, verifiedAt: now }
      : { verified: false, verifiedBy: null, verifiedAt: null },
  });

  await audit({
    actorUserId: user.userId,
    action: 'international.experience_verify',
    entityType: 'internationalExperience',
    entityId: existing.id,
    before: { verified: existing.verified },
    // `notes` has no column on the row — the reviewer's note lives in the audit trail.
    after: { verified: input.verified, notes: input.notes ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { experience };
}

// ── Route table ─────────────────────────────────────────────────

export const internationalRoutes: AppRoute[] = [
  // public (REJECTED/SUSPENDED never shown)
  {
    method: 'GET',
    path: '/international/opportunities',
    handler: publicList,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Discover international opportunities (paginated)',
  },
  {
    method: 'GET',
    path: '/international/opportunities/:id',
    handler: publicDetail,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'International opportunity detail',
  },
  // self-scoped experiences
  {
    method: 'GET',
    path: '/international/experiences',
    handler: myList,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own international experiences (paginated)',
  },
  {
    method: 'POST',
    path: '/international/experiences',
    handler: createExperience,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Declare an international experience (always unverified)',
  },
  // platform content desk
  {
    method: 'GET',
    path: '/admin/international/opportunities',
    handler: adminList,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'All international offers incl. hidden ones (paginated)',
  },
  {
    method: 'POST',
    path: '/admin/international/opportunities',
    handler: adminCreate,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Create an international offer (PENDING)',
  },
  {
    method: 'GET',
    path: '/admin/international/opportunities/:id',
    handler: adminDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'International offer detail (platform)',
  },
  {
    method: 'PATCH',
    path: '/admin/international/opportunities/:id',
    handler: adminUpdate,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Update an international offer',
  },
  // ── BLADNA International: public aggregations ──
  {
    method: 'GET',
    path: '/international/countries',
    handler: listCountries,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Countries with visible international offers (aggregated, paginated)',
  },
  {
    method: 'GET',
    path: '/international/countries/:code',
    handler: countryDetail,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Country profile and its visible offers (paginated)',
  },
  {
    method: 'GET',
    path: '/international/providers',
    handler: listProviders,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Distinct providers of visible offers with counts (paginated)',
  },
  // ── BLADNA International: volunteer surface ──
  {
    method: 'GET',
    path: '/international/opportunities/:id/eligibility',
    handler: eligibility,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Deterministic eligibility result for the signed-in volunteer',
  },
  {
    method: 'GET',
    path: '/international/recommendations',
    handler: recommendations,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Personalized international recommendations (limit ≤ 12)',
  },
  {
    method: 'GET',
    path: '/international/applications',
    handler: myInternationalApplications,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own international applications (paginated, status filter)',
  },
  {
    method: 'POST',
    path: '/international/applications',
    handler: createInternationalApplication,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Apply to an international offer (re-checks duplicate/deadline/age)',
  },
  {
    method: 'GET',
    path: '/international/applications/:id',
    handler: myInternationalApplicationDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own international application detail',
  },
  {
    method: 'POST',
    path: '/international/applications/:id/withdraw',
    handler: withdrawInternationalApplication,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Withdraw own international application (open statuses only)',
  },
  {
    method: 'GET',
    path: '/international/passport',
    handler: getPassport,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Volunteer international passport: readiness, preferences, stats',
  },
  {
    method: 'PATCH',
    path: '/international/passport',
    handler: updatePassport,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Update passport readiness, preferences and date of birth',
  },
  // ── BLADNA International: platform moderation ──
  {
    method: 'POST',
    path: '/admin/international/opportunities/:id/verification',
    handler: adminSetVerification,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Set an offer verification status (append-only event history)',
  },
  {
    method: 'GET',
    path: '/admin/international/opportunities/:id/events',
    handler: adminVerificationEvents,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Verification history of an offer (paginated, newest first)',
  },
  {
    method: 'GET',
    path: '/admin/international/applications',
    handler: adminApplicationList,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'All international applications (paginated, status/opportunity filters)',
  },
  {
    method: 'PATCH',
    path: '/admin/international/applications/:id',
    handler: adminApplicationStatus,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'International application status transition (strict machine)',
  },
  {
    method: 'GET',
    path: '/admin/international/experiences',
    handler: adminExperienceList,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Self-declared international experiences (paginated, verified filter)',
  },
  {
    method: 'POST',
    path: '/admin/international/experiences/:id/verify',
    handler: adminExperienceVerify,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Verify or un-verify one international experience (audited)',
  },
];
