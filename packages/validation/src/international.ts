import {
  INTERNATIONAL_APPLICATION_STATUSES,
  INTERNATIONAL_PASSPORT_READINESS,
  INTERNATIONAL_PROJECT_TYPES,
  VERIFICATION_STATUSES,
} from '@bladna/types';
import { z } from 'zod';
import {
  localizedDescriptions,
  localizedTitles,
  paginationQuerySchema,
  sourceTypeSchema,
  uuidSchema,
  benefitValueSchema,
} from './common';

export const createInternationalOpportunitySchema = localizedTitles
  .merge(localizedDescriptions.partial())
  .extend({
    countryId: uuidSchema.nullable().optional(),
    city: z.string().trim().max(160).optional(),
    program: z.string().trim().min(2).max(200),
    provider: z.string().trim().min(2).max(200),
    eligibility: z.string().trim().max(3000).optional(),
    ageRequirements: z.string().trim().max(500).optional(),
    languageRequirements: z.string().trim().max(500).optional(),
    duration: z.string().trim().max(200).optional(),
    startDate: z.coerce.date().nullable().optional(),
    deadline: z.coerce.date().nullable().optional(),
    accommodation: benefitValueSchema.default('UNKNOWN'),
    food: benefitValueSchema.default('UNKNOWN'),
    transportation: benefitValueSchema.default('UNKNOWN'),
    insurance: benefitValueSchema.default('UNKNOWN'),
    visaInformation: z.string().trim().max(3000).optional(),
    applicationMethod: z.string().trim().max(1000).optional(),
    officialSource: z.string().trim().max(300).optional(),
    sourceUrl: z.string().trim().url().max(600).optional(),
    sourceId: uuidSchema.nullable().optional(),
    sourceType: sourceTypeSchema.default('EXTERNAL'),
  });

export const updateInternationalOpportunitySchema = createInternationalOpportunitySchema.partial();

export const internationalFiltersSchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  countryId: uuidSchema.optional(),
  sourceType: sourceTypeSchema.optional(),
  category: z.enum(INTERNATIONAL_PROJECT_TYPES).optional(),
  verifiedOnly: z.enum(['true', 'false']).optional(),
  deadlineFrom: z.coerce.date().optional(),
  deadlineTo: z.coerce.date().optional(),
  sort: z.enum(['recent', 'deadline']).default('deadline'),
});

export const createInternationalExperienceSchema = z.object({
  countryId: uuidSchema.nullable().optional(),
  opportunityId: uuidSchema.optional(),
  organizationName: z.string().trim().min(2).max(200),
  program: z.string().trim().min(2).max(200),
  role: z.string().trim().max(120).optional(),
  activity: z.string().trim().max(500).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  hours: z.number().min(0).max(1000).nullable().optional(),
  certificateId: uuidSchema.nullable().optional(),
  sourceUrl: z.string().trim().url().max(600).optional(),
  /** unverified experiences are labeled as self-declared, never as verified */
  verified: z.boolean().default(false),
});

export const internationalParamsSchema = z.object({ id: uuidSchema });

// ── BLADNA International: countries, providers, recommendations ───

/** ISO-3166 style country code from the path; lookup is case-insensitive. */
export const internationalCountryParamsSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2,4}$/, 'INVALID_COUNTRY_CODE'),
});

export const internationalProvidersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});

/** `limit` default 6, hard maximum 12 (§58 recommendation strip). */
export const internationalRecommendationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(6),
});

// ── Volunteer applications ───────────────────────────────────────

export const internationalApplicationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(INTERNATIONAL_APPLICATION_STATUSES).optional(),
});

export const createInternationalApplicationSchema = z.object({
  opportunityId: uuidSchema,
  motivationLetter: z.string().trim().max(4000).optional(),
  languages: z.string().trim().max(200).optional(),
  availability: z.string().trim().max(500).optional(),
  previousExperience: z.string().trim().max(2000).optional(),
  passportReadiness: z.enum(INTERNATIONAL_PASSPORT_READINESS),
});

// ── Volunteer passport ───────────────────────────────────────────

/** Whole years between `dateOfBirth` and `reference` (birthday not yet reached → one less). */
function ageAt(dateOfBirth: Date, reference: Date): number {
  let age = reference.getFullYear() - dateOfBirth.getFullYear();
  const monthDelta = reference.getMonth() - dateOfBirth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getDate() < dateOfBirth.getDate())) age -= 1;
  return age;
}

function parseIsoDate(value: string): Date | null {
  // `YYYY-MM-DD` must be a real calendar date: reject numeric overflow such
  // as 2010-13-40, which `new Date()` would silently roll over.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed;
}

/** Every field optional: the caller patches only what it sends. */
export const updateInternationalPassportSchema = z.object({
  passportReadiness: z.enum(INTERNATIONAL_PASSPORT_READINESS).optional(),
  travelReady: z.boolean().optional(),
  emergencyContactReady: z.boolean().optional(),
  preferredCategories: z.array(z.enum(INTERNATIONAL_PROJECT_TYPES)).max(12).optional(),
  preferredCountryIds: z.array(uuidSchema).max(50).optional(),
  /** `YYYY-MM-DD`, a past date showing an age of 10–120 years. */
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.')
    .refine(
      (value) => {
        const parsed = parseIsoDate(value);
        return parsed !== null && parsed.getTime() < Date.now();
      },
      { message: 'dateOfBirth must be a past date.' },
    )
    .refine(
      (value) => {
        const parsed = parseIsoDate(value);
        if (!parsed) return false;
        const age = ageAt(parsed, new Date());
        return age >= 10 && age <= 120;
      },
      { message: 'dateOfBirth must show an age between 10 and 120 years.' },
    )
    .optional(),
});

// ── Platform content desk (moderation) ───────────────────────────

export const internationalVerificationDecisionSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  notes: z.string().trim().max(2000).optional(),
});

export const adminInternationalApplicationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(INTERNATIONAL_APPLICATION_STATUSES).optional(),
  opportunityId: uuidSchema.optional(),
});

export const updateInternationalApplicationStatusSchema = z.object({
  status: z.enum(INTERNATIONAL_APPLICATION_STATUSES),
  decisionNote: z.string().trim().max(2000).optional(),
});

export const adminInternationalExperiencesQuerySchema = paginationQuerySchema.extend({
  verified: z.enum(['true', 'false']).optional(),
  volunteerProfileId: uuidSchema.optional(),
});

export const verifyInternationalExperienceSchema = z.object({
  verified: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
});
