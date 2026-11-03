import { z } from 'zod';
import {
  ORGANIZATION_STATUSES,
  ORGANIZATION_TYPES,
  OPPORTUNITY_STATUSES,
  VERIFICATION_STATUSES,
} from '@bladna/types';
import { paginationQuerySchema, uuidSchema } from './common';

export const adminUsersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'BANNED', 'DELETED']).optional(),
  role: z.string().trim().max(40).optional(),
  sort: z.enum(['recent', 'email']).default('recent'),
});

export const adminUserActionSchema = z.object({
  action: z.enum(['SUSPEND', 'REINSTATE', 'BAN', 'CHANGE_ROLE', 'FORCE_LOGOUT']),
  reason: z.string().trim().max(2000).optional(),
  roles: z.array(z.string().min(1).max(40)).max(11).optional(),
  suspendedUntil: z.coerce.date().optional(),
});

export const adminOrganizationActionSchema = z.object({
  action: z.enum(['VERIFY', 'SUSPEND', 'RESTORE', 'REQUEST_INFO', 'REJECT']),
  reason: z.string().trim().max(2000).optional(),
  level: z.string().max(40).optional(),
});

export const adminOrganizationsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(ORGANIZATION_STATUSES).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  organizationType: z.enum(ORGANIZATION_TYPES).optional(),
});

export const adminOpportunitiesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(OPPORTUNITY_STATUSES).optional(),
  organizationId: uuidSchema.optional(),
});

/** Moderation of a tenant opportunity: state-machine actions only (no FEATURE — no such column). */
export const adminOpportunityActionSchema = z.object({
  action: z.enum(['PUBLISH', 'REJECT', 'SUSPEND', 'RESTORE']),
  reason: z.string().trim().max(2000).optional(),
});

export const auditQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
  entityType: z.string().trim().max(80).optional(),
  entityId: uuidSchema.optional(),
  actorUserId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const contentPageSchema = z.object({
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,80}$/, 'INVALID_SLUG'),
  type: z.enum(['PAGE', 'FAQ', 'GUIDE', 'SAFETY', 'LEGAL']).default('PAGE'),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  titleAr: z.string().trim().min(1).max(300),
  titleFr: z.string().trim().min(1).max(300),
  titleEn: z.string().trim().min(1).max(300),
  bodyAr: z.string().trim().min(1).max(200000),
  bodyFr: z.string().trim().min(1).max(200000),
  bodyEn: z.string().trim().min(1).max(200000),
  seoDescription: z.string().trim().max(400).optional(),
});

export const announcementSchema = z
  .object({
    titleAr: z.string().trim().min(1).max(200),
    titleFr: z.string().trim().min(1).max(200),
    titleEn: z.string().trim().min(1).max(200),
    bodyAr: z.string().trim().min(1).max(2000),
    bodyFr: z.string().trim().min(1).max(2000),
    bodyEn: z.string().trim().min(1).max(2000),
    active: z.boolean().default(true),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => !v.startsAt || !v.endsAt || v.endsAt >= v.startsAt, {
    message: 'END_BEFORE_START',
    path: ['endsAt'],
  });

export const featuredPlacementSchema = z.object({
  section: z.enum([
    'HOME_HERO',
    'HOME_FEATURED_OPPORTUNITIES',
    'HOME_FEATURED_ORGANIZATIONS',
    'HOME_CAMPAIGNS',
    'DISCOVER_FEATURED',
  ]),
  targetType: z.enum(['OPPORTUNITY', 'ORGANIZATION', 'CAMPAIGN']),
  targetId: uuidSchema,
  position: z.number().int().min(0).max(1000).default(0),
  sponsored: z.boolean().default(false),
  label: z.string().trim().max(200).optional(),
});

export const homeContentSchema = z.object({
  heroTitleAr: z.string().trim().min(1).max(300),
  heroTitleFr: z.string().trim().min(1).max(300),
  heroTitleEn: z.string().trim().min(1).max(300),
  heroSubtitleAr: z.string().trim().max(600).optional(),
  heroSubtitleFr: z.string().trim().max(600).optional(),
  heroSubtitleEn: z.string().trim().max(600).optional(),
  primaryCtaAr: z.string().trim().min(1).max(80),
  primaryCtaFr: z.string().trim().min(1).max(80),
  primaryCtaEn: z.string().trim().min(1).max(80),
  secondaryCtaAr: z.string().trim().min(1).max(80),
  secondaryCtaFr: z.string().trim().min(1).max(80),
  secondaryCtaEn: z.string().trim().min(1).max(80),
  announcementId: uuidSchema.nullable().optional(),
});

export const featureFlagSchema = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-zA-Z.]+$/),
  enabled: z.boolean(),
  description: z.string().trim().max(400).optional(),
});

export const adminDataExportSchema = z.object({
  kind: z.enum(['VOLUNTEERS', 'ORGANIZATIONS', 'CAMPAIGNS', 'FINANCIAL']),
  format: z.enum(['csv', 'json']).default('csv'),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** Platform setting write (`Setting.value` is JSON — any scalar/array/object, never undefined). */
export const settingSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._:-]+$/, 'INVALID_KEY'),
  scope: z.string().trim().max(120).default('global'),
  value: z.unknown().refine((v) => v !== undefined, { message: 'VALUE_REQUIRED' }),
});

/**
 * Payment creation. Only the two real methods exist in this build:
 * `bank_transfer` (pending, awaits manual admin confirmation) and `free`
 * (zero-amount orders). A payment always targets an invoice or a plan.
 */
export const createPaymentSchema = z
  .object({
    organizationId: uuidSchema,
    invoiceId: uuidSchema.optional(),
    planId: uuidSchema.optional(),
    method: z.enum(['bank_transfer', 'free']),
    amountDzd: z.number().int().min(0).max(1000000000),
    currency: z.string().length(3).default('DZD'),
    description: z.string().trim().max(300).optional(),
  })
  .refine((value) => value.invoiceId || value.planId, {
    message: 'TARGET_REQUIRED',
    path: ['invoiceId'],
  });

/** Admin payment lifecycle transition (payments are never edited in place). */
export const paymentActionSchema = z.object({
  status: z.enum(['PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED']),
  reason: z.string().trim().max(2000).optional(),
});

export const adminPaymentsQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'])
    .optional(),
  organizationId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
