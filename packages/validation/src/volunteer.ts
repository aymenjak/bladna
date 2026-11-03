import { z } from 'zod';
import {
  availabilitySchema,
  csvArray,
  languageLevelSchema,
  paginationQuerySchema,
  uuidSchema,
} from './common';

export const opportunityFiltersSchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  countryId: uuidSchema.optional(),
  wilayaId: uuidSchema.optional(),
  cityId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  type: z.enum(['LOCAL', 'NATIONAL', 'ONLINE', 'INTERNATIONAL', 'EVENT', 'CAMPAIGN']).optional(),
  locationType: z.enum(['PHYSICAL', 'ONLINE', 'HYBRID']).optional(),
  organizationId: uuidSchema.optional(),
  /** Campaign scoping: list every published opportunity linked to one campaign. */
  campaignId: uuidSchema.optional(),
  skillIds: csvArray().optional(),
  languageIds: csvArray().optional(),
  verifiedOnly: z.enum(['true', 'false']).optional(),
  online: z.enum(['true', 'false']).optional(),
  international: z.enum(['true', 'false']).optional(),
  accommodation: z.enum(['true', 'false']).optional(),
  food: z.enum(['true', 'false']).optional(),
  transportation: z.enum(['true', 'false']).optional(),
  insurance: z.enum(['true', 'false']).optional(),
  availableFrom: z.coerce.date().optional(),
  availableTo: z.coerce.date().optional(),
  minimumAge: z.coerce.number().int().min(0).max(100).optional(),
  /**
   * Support-need filter (spec §11): VOLUNTEERS = open volunteer call with
   * defined capacity and open deadline (honest open-spots flag + live
   * deadline check); the rest match initiatives declaring that need kind.
   */
  needs: z.enum(['VOLUNTEERS', 'ANY', 'FINANCIAL', 'EQUIPMENT', 'MATERIAL', 'SERVICE']).optional(),
  sort: z.enum(['recent', 'deadline', 'soonest', 'popular']).default('recent'),
  /** map mode returns only marker fields */
  mode: z.enum(['list', 'map']).default('list'),
  /**
   * Map viewport filter (P3 / RESEARCH H5, "search this area"):
   * `minLng,minLat,maxLng,maxLat` in WGS84 degrees with min ≤ max on both
   * axes. Rows without their own point match through their city's
   * coordinates — the same city-level fallback mode=map uses when rendering
   * pins, so a pin visible in the viewport is always a hit.
   */
  bounds: z
    .string()
    .transform((value) => value.split(',').map((part) => Number(part.trim())))
    .refine(
      (values) =>
        values.length === 4 &&
        values.every((value) => Number.isFinite(value)) &&
        values[0] >= -180 &&
        values[2] <= 180 &&
        values[1] >= -90 &&
        values[3] <= 90 &&
        values[0] <= values[2] &&
        values[1] <= values[3],
      { message: 'bounds must be minLng,minLat,maxLng,maxLat within WGS84, min <= max' },
    )
    .optional(),
});

export const discoverQuerySchema = opportunityFiltersSchema;

export const mapMarkersQuerySchema = z.object({
  wilayaId: uuidSchema.optional(),
  countryId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  bounds: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(), // minLng,minLat,maxLng,maxLat
});

export const volunteerSearchSchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  wilayaId: uuidSchema.optional(),
  skillIds: csvArray().optional(),
  verifiedOnly: z.enum(['true', 'false']).optional(),
});

/**
 * Public volunteer profile (P25): `GET /volunteers/:id` addresses the
 * profile row by its UUID — the human `PREFIX-REGION-NNNNNN` code stays a
 * display value (it is what `/verify/volunteer` answers to, keyed through
 * the non-guessable public token instead of an enumerable id).
 */
export const profileParamsSchema = z.object({
  id: uuidSchema,
});

export const availabilitySchemaQuery = z.object({
  availability: z.array(availabilitySchema).optional(),
});

export const languageFilterSchema = z.object({
  level: languageLevelSchema.optional(),
});

/**
 * Saved opportunities (P5): paginated list with an optional exact-id filter —
 * `?opportunityId=` answers "is this one saved?" in one indexed lookup, which
 * is how the save button learns its initial state without a dedicated route.
 */
export const savedListQuerySchema = paginationQuerySchema.extend({
  opportunityId: uuidSchema.optional(),
});

/**
 * Personalized matching (P5): the engine returns a fixed top-N (no paging —
 * the strip/page are "what fits me now" surfaces, mirroring the
 * international recommendations clamp of 1–12).
 */
export const recommendationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(12).default(6),
});
