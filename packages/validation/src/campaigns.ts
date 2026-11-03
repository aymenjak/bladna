import { CONTRIBUTION_STATUSES } from '@bladna/types';
import { z } from 'zod';
import {
  campaignStatusSchema,
  metricTypeSchema,
  optionalText,
  paginationQuerySchema,
  uuidSchema,
} from './common';

const campaignCore = z.object({
  name: z.string().trim().min(2).max(160),
  description: optionalText(8000),
  goal: optionalText(1000),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  volunteerTarget: z.number().int().min(0).max(1000000).nullable().optional(),
  hourTarget: z.number().min(0).max(1000000).nullable().optional(),
  beneficiaryTarget: z.number().int().min(0).max(100000000).nullable().optional(),
  budget: z.number().min(0).max(1000000000).nullable().optional(),
  currency: z.string().length(3).default('DZD'),
  coverImage: optionalText(500),
  opportunityIds: z.array(uuidSchema).max(100).default([]),
});

export const createCampaignSchema = campaignCore.refine(
  (value) => value.endDate >= value.startDate,
  {
    message: 'END_BEFORE_START',
    path: ['endDate'],
  },
);

export const updateCampaignSchema = campaignCore
  .partial()
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: 'END_BEFORE_START',
    path: ['endDate'],
  });

export const campaignStatusActionSchema = z.object({
  action: z.enum(['ACTIVATE', 'PAUSE', 'COMPLETE', 'CANCEL']),
  reason: optionalText(1000),
});

export const createImpactMetricSchema = z.object({
  campaignId: uuidSchema.optional(),
  csrProgramId: uuidSchema.optional(),
  metricType: metricTypeSchema,
  name: z.string().trim().min(2).max(160),
  target: z.number().nullable().optional(),
  actual: z.number().min(0).default(0),
  unit: z.string().trim().min(1).max(40),
  /** where the numbers come from — verified metrics need a real source */
  source: z.string().trim().min(3).max(300),
});

export const impactReportQuerySchema = z.object({
  campaignId: uuidSchema.optional(),
  csrProgramId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  format: z.enum(['json', 'csv', 'pdf']).default('json'),
});

export const campaignFiltersSchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: campaignStatusSchema.optional(),
  organizationId: uuidSchema.optional(),
});

/**
 * Record one donor's bank-transfer contribution to a campaign (spec §33):
 * the money moves bank → organization, the platform only records and tracks it.
 */
export const createContributionSchema = z.object({
  amount: z.number().min(100).max(1000000000),
  /** Must equal the campaign's currency (checked server-side). */
  currency: z.string().length(3).optional(),
  /** Bank-transfer receipt reference — unique per campaign when present. */
  reference: optionalText(80),
  note: optionalText(500),
});

export const contributionListSchema = paginationQuerySchema.extend({
  status: z.enum(CONTRIBUTION_STATUSES).optional(),
});

/** Org decision on a PENDING contribution: CONFIRM or REJECT (reason required to reject). */
export const contributionActionSchema = z
  .object({
    action: z.enum(['CONFIRM', 'REJECT']),
    reason: optionalText(1000),
  })
  .refine((value) => value.action !== 'REJECT' || (value.reason ?? '').trim().length > 0, {
    message: 'REASON_REQUIRED',
    path: ['reason'],
  });

export const joinCampaignSchema = z.object({
  opportunityId: uuidSchema.optional(),
});
