import { z } from 'zod';
import {
  APPLICATION_STATUSES,
  AVAILABILITY_SLOTS,
  BENEFIT_TYPES,
  BENEFIT_VALUES,
  CAMPAIGN_STATUSES,
  LANGUAGE_LEVELS,
  LOCATION_TYPES,
  LOCALES,
  METRIC_TYPES,
  OPPORTUNITY_STATUSES,
  OPPORTUNITY_TYPES,
  ORG_MEMBER_ROLES,
  ORGANIZATION_TYPES,
  REPORT_TARGET_TYPES,
  SOURCE_TYPES,
  SUPPORT_NEED_KINDS,
  SUPPORT_OFFER_STATUSES,
} from '@bladna/types';

export const uuidSchema = z.string().uuid();
export const localeSchema = z.enum(LOCALES);

export const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(254)
  .email()
  .transform((value) => value.toLowerCase());

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{8,20}$/, 'INVALID_PHONE');

export const passwordSchema = z.string().min(10).max(200);

export const nameSchema = z.string().trim().min(1).max(80);
export const optionalText = (max: number) => z.string().trim().max(max).optional();

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const opportunityStatusSchema = z.enum(OPPORTUNITY_STATUSES);
export const opportunityTypeSchema = z.enum(OPPORTUNITY_TYPES);
export const locationTypeSchema = z.enum(LOCATION_TYPES);
export const applicationStatusSchema = z.enum(APPLICATION_STATUSES);
export const orgMemberRoleSchema = z.enum(ORG_MEMBER_ROLES);
export const organizationTypeSchema = z.enum(ORGANIZATION_TYPES);
export const supportNeedKindSchema = z.enum(SUPPORT_NEED_KINDS);
export const supportOfferStatusSchema = z.enum(SUPPORT_OFFER_STATUSES);

/**
 * Consent purposes accepted at any registration (§54): `terms` and
 * `privacy_policy` are mandatory, the rest are opt-in. Shared by account,
 * organization and sponsor registration so the bar cannot drift between them.
 */
export const registrationConsentsSchema = z
  .array(
    z.enum(['terms', 'privacy_policy', 'data_processing', 'marketing_email', 'guardian_consent']),
  )
  .min(1)
  .refine((list) => list.includes('terms') && list.includes('privacy_policy'), {
    message: 'REQUIRED_CONSENTS_MISSING',
  });
export const benefitTypeSchema = z.enum(BENEFIT_TYPES);
export const benefitValueSchema = z.enum(BENEFIT_VALUES);
export const languageLevelSchema = z.enum(LANGUAGE_LEVELS);
export const availabilitySchema = z.enum(AVAILABILITY_SLOTS);
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const metricTypeSchema = z.enum(METRIC_TYPES);
export const sourceTypeSchema = z.enum(SOURCE_TYPES);
export const reportTargetTypeSchema = z.enum(REPORT_TARGET_TYPES);

/** Comma-separated query list → array (e.g. `?skills=a,b`). */
export const csvArray = (max = 30) =>
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1)).max(max));

export const isoDateSchema = z.coerce.date();

/** Localized triplet required on write endpoints for localized entities. */
export const localizedTitles = z.object({
  titleAr: z.string().trim().min(1).max(160),
  titleFr: z.string().trim().min(1).max(160),
  titleEn: z.string().trim().min(1).max(160),
});

export const localizedDescriptions = z.object({
  descriptionAr: z.string().trim().min(1).max(20000),
  descriptionFr: z.string().trim().min(1).max(20000),
  descriptionEn: z.string().trim().min(1).max(20000),
});
