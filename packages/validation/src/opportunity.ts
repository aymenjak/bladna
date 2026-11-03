import { z } from 'zod';
import {
  benefitTypeSchema,
  benefitValueSchema,
  emailSchema,
  localizedDescriptions,
  localizedTitles,
  locationTypeSchema,
  optionalText,
  opportunityStatusSchema,
  opportunityTypeSchema,
  paginationQuerySchema,
  phoneSchema,
  supportNeedKindSchema,
  supportOfferStatusSchema,
  uuidSchema,
} from './common';

export const opportunityBenefitSchema = z.object({
  benefitType: benefitTypeSchema,
  value: benefitValueSchema,
  note: optionalText(500),
});

export const opportunityQuestionSchema = z.object({
  promptAr: z.string().trim().min(1).max(500),
  promptFr: z.string().trim().min(1).max(500),
  promptEn: z.string().trim().min(1).max(500),
  type: z.enum(['TEXT', 'MULTILINE', 'CHOICE', 'BOOLEAN']).default('TEXT'),
  required: z.boolean().default(false),
  options: z
    .array(
      z.object({
        value: z.string().min(1).max(120),
        labelAr: z.string().min(1).max(200),
        labelFr: z.string().min(1).max(200),
        labelEn: z.string().min(1).max(200),
      }),
    )
    .max(20)
    .optional(),
});

export const opportunityRequirementSchema = z.object({
  type: z.enum(['DOCUMENT', 'EXPERIENCE', 'AVAILABILITY', 'AGE', 'EDUCATION', 'OTHER']),
  labelAr: z.string().trim().min(1).max(300),
  labelFr: z.string().trim().min(1).max(300),
  labelEn: z.string().trim().min(1).max(300),
  description: optionalText(1000),
  required: z.boolean().default(true),
});

const opportunityCore = localizedTitles.merge(localizedDescriptions).extend({
  type: opportunityTypeSchema,
  locationType: locationTypeSchema,
  categoryId: uuidSchema.nullable().optional(),
  campaignId: uuidSchema.nullable().optional(),
  countryId: uuidSchema.nullable().optional(),
  wilayaId: uuidSchema.nullable().optional(),
  cityId: uuidSchema.nullable().optional(),
  address: optionalText(400),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  startDate: z.coerce.date().nullable().optional(),
  endDate: z.coerce.date().nullable().optional(),
  applicationDeadline: z.coerce.date().nullable().optional(),
  capacity: z.number().int().min(1).max(100000).nullable().optional(),
  minimumAge: z.number().int().min(0).max(100).nullable().optional(),
  maximumAge: z.number().int().min(0).max(100).nullable().optional(),
  estimatedHours: z.number().min(0).max(1000).nullable().optional(),
  // Initiative narrative (spec §4): problem + objective, localized like every
  // other narrative field (all-or-nothing triplets, enforced below).
  problemAr: optionalText(2000),
  problemFr: optionalText(2000),
  problemEn: optionalText(2000),
  objectiveAr: optionalText(2000),
  objectiveFr: optionalText(2000),
  objectiveEn: optionalText(2000),
  // Presentation + initiative-level contact (spec §4) — falls back to the
  // organizer's own details in the UI when left empty.
  coverImage: optionalText(500),
  contactName: optionalText(120),
  contactPhone: phoneSchema.optional(),
  contactEmail: emailSchema.optional(),
  skillIds: z.array(uuidSchema).max(30).default([]),
  requiredSkillIds: z.array(uuidSchema).max(30).default([]),
  languageIds: z.array(uuidSchema).max(15).default([]),
  requiredLanguageIds: z.array(uuidSchema).max(15).default([]),
  benefits: z.array(opportunityBenefitSchema).max(10).default([]),
  requirements: z.array(opportunityRequirementSchema).max(15).default([]),
  questions: z.array(opportunityQuestionSchema).max(10).default([]),
  sourceId: uuidSchema.nullable().optional(),
  sourceUrl: z.string().trim().url().max(600).nullable().optional(),
});

/** Localized optional triplets: if any language is filled, all three must be. */
const OPTIONAL_TRIPLETS: ReadonlyArray<readonly [string, string, string]> = [
  ['problemAr', 'problemFr', 'problemEn'],
  ['objectiveAr', 'objectiveFr', 'objectiveEn'],
];

function withOptionalTriplets<TShape extends z.ZodRawShape>(
  schema: z.ZodObject<TShape>,
): z.ZodEffects<z.ZodObject<TShape>> {
  return schema.superRefine((value, ctx) => {
    const record = value as Record<string, unknown>;
    for (const triplet of OPTIONAL_TRIPLETS) {
      const filled = triplet.filter((key) => {
        const v = record[key];
        return typeof v === 'string' && v.trim() !== '';
      });
      if (filled.length > 0 && filled.length < triplet.length) {
        for (const key of triplet) {
          const v = record[key];
          if (!(typeof v === 'string' && v.trim() !== '')) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [key],
              message: 'LOCALIZED_TRIPLET_REQUIRED',
            });
          }
        }
      }
    }
  });
}

export const createOpportunitySchema = withOptionalTriplets(opportunityCore);

// full localized triplets remain required when any localized field is updated
export const updateOpportunitySchema = withOptionalTriplets(opportunityCore.partial());

export const transitionOpportunitySchema = z.object({
  action: z.enum([
    'SUBMIT_REVIEW',
    'PUBLISH',
    'REJECT',
    'SUSPEND',
    'ARCHIVE',
    'RESTORE_DRAFT',
    'EXPIRE',
  ]),
  reason: optionalText(2000),
});

export const bulkTransitionSchema = z.object({
  action: z.enum(['SUBMIT_REVIEW', 'PUBLISH', 'REJECT', 'SUSPEND', 'ARCHIVE']),
  opportunityIds: z.array(uuidSchema).min(1).max(50),
  reason: optionalText(2000),
});

export const opportunityParamsSchema = z.object({ slug: z.string().trim().min(1).max(200) });
export const idParamsSchema = z.object({ id: uuidSchema });
export const statusFilterSchema = z.object({
  status: opportunityStatusSchema.optional(),
});

// ── Participant reviews & ratings (P24) ────────────────────────

export const reviewParamsSchema = z.object({
  slug: z.string().trim().min(1).max(200),
  reviewId: uuidSchema,
});

/**
 * A review is a 1–5 star rating plus an optional written body. Eligibility
 * (ACCEPTED application or VERIFIED hours on that initiative) is checked
 * server-side against the database — never trusted from the payload — and
 * one review per author per initiative is a DB-level compound unique.
 */
export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().min(1).max(2000).optional(),
});

/**
 * Partial edit of your own review: `body: null` clears the text; an empty
 * PATCH carries neither field and is rejected instead of being a silent no-op.
 */
export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    body: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .refine((value) => value.rating !== undefined || value.body !== undefined, {
    message: 'REVIEW_FIELDS_REQUIRED',
  });

// ── Initiative support needs & offers (spec §5/§13) ────────────

const needLabelSchema = z.string().trim().min(1).max(200);

/**
 * A declared initiative need. Deterministic rules: FINANCIAL needs carry a
 * target amount and never a quantity; equipment/material/service needs carry
 * an optional quantity (+ owner-maintained `fulfilled` progress) and never a
 * target amount. The org update handler merge-validates partial input
 * against this same schema (existing row + patch).
 */
export const createSupportNeedSchema = z
  .object({
    kind: supportNeedKindSchema,
    labelAr: needLabelSchema,
    labelFr: needLabelSchema,
    labelEn: needLabelSchema,
    description: optionalText(1000),
    quantity: z.number().int().min(1).max(1000000).nullable().optional(),
    fulfilled: z.number().int().min(0).max(1000000).default(0),
    targetAmount: z.number().min(0.01).max(1000000000).nullable().optional(),
    currency: z.string().trim().length(3).default('DZD'),
    sortOrder: z.number().int().min(0).max(999).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'FINANCIAL') {
      if (value.targetAmount == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['targetAmount'],
          message: 'FINANCIAL_NEED_TARGET_REQUIRED',
        });
      }
      if (value.quantity != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['quantity'],
          message: 'QUANTITY_NOT_FOR_FINANCIAL',
        });
      }
    } else if (value.targetAmount != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetAmount'],
        message: 'TARGET_AMOUNT_ONLY_FOR_FINANCIAL',
      });
    }
    if (value.quantity != null && value.fulfilled > value.quantity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['fulfilled'],
        message: 'FULFILLED_EXCEEDS_QUANTITY',
      });
    }
  });

/** Partial patch — the server merge-validates it against the create schema. */
export const updateSupportNeedSchema = z.object({
  kind: supportNeedKindSchema.optional(),
  labelAr: needLabelSchema.optional(),
  labelFr: needLabelSchema.optional(),
  labelEn: needLabelSchema.optional(),
  description: optionalText(1000),
  quantity: z.number().int().min(1).max(1000000).nullable().optional(),
  fulfilled: z.number().int().min(0).max(1000000).optional(),
  targetAmount: z.number().min(0.01).max(1000000000).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const supportNeedListQuerySchema = paginationQuerySchema.extend({
  kind: supportNeedKindSchema.optional(),
});

/**
 * An offer of support toward one need (spec §13). Kind-specific rules are
 * enforced server-side once the need row is known: FINANCIAL offers require
 * `amount` (never `quantity`); equipment/material/service offers may carry
 * `quantity` and never an `amount`.
 */
export const createSupportOfferSchema = z.object({
  supportNeedId: uuidSchema,
  description: z.string().trim().min(3).max(500),
  quantity: z.number().int().min(1).max(1000000).optional(),
  amount: z.number().min(0.01).max(1000000000).optional(),
  currency: z.string().trim().length(3).optional(),
  contactNote: optionalText(300),
});

export const supportOfferListQuerySchema = paginationQuerySchema.extend({
  status: supportOfferStatusSchema.optional(),
});

/** REJECT always requires a reason; ACCEPT never does. */
export const decideSupportOfferSchema = z
  .object({
    action: z.enum(['ACCEPT', 'REJECT']),
    reason: optionalText(500),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'REJECT' && (!value.reason || value.reason.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'REJECT_REASON_REQUIRED',
      });
    }
  });

export const needIdParamsSchema = z.object({ needId: uuidSchema });
export const offerIdParamsSchema = z.object({ offerId: uuidSchema });

export const trackViewSchema = z.object({}).optional();
