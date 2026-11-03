import { z } from 'zod';
import { REPORT_REASONS } from '@bladna/types';
import { paginationQuerySchema, reportTargetTypeSchema, uuidSchema } from './common';

export const createReportSchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: z.string().trim().min(1).max(200),
  reason: z.enum(REPORT_REASONS),
  description: z.string().trim().max(4000).optional(),
});

export const reviewReportSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'ACTION_TAKEN', 'DISMISSED', 'CLOSED']),
  resolution: z.string().trim().max(4000).optional(),
  /** moderation action applied alongside the resolution */
  action: z.enum(['NONE', 'RESTRICT', 'SUSPEND', 'REMOVE_CONTENT', 'WARN']).default('NONE'),
});

export const reportsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['OPEN', 'INVESTIGATING', 'ACTION_TAKEN', 'DISMISSED', 'CLOSED']).optional(),
  targetType: reportTargetTypeSchema.optional(),
  assignedToMe: z.enum(['true', 'false']).optional(),
});

export const decideRiskSchema = z.object({
  decision: z.enum(['approve', 'restrict', 'suspend', 'override']),
  note: z.string().trim().max(2000).optional(),
});

export const incidentSchema = z.object({
  type: z.enum(['SECURITY', 'FRAUD', 'ABUSE', 'SAFETY', 'MISCONDUCT', 'OTHER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(8000).optional(),
});

export const incidentUpdateSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']).optional(),
  note: z.string().trim().min(1).max(4000),
  resolution: z.string().trim().max(8000).optional(),
});

export const moderationQueueQuerySchema = paginationQuerySchema.extend({
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  targetType: z.enum(['USER', 'ORGANIZATION', 'OPPORTUNITY', 'CAMPAIGN', 'PAYMENT']).optional(),
});

export const reportParamsSchema = z.object({ id: uuidSchema });

/**
 * Trust/risk signal reads: either list persisted assessments (filters only) or
 * compute a fresh assessment for one concrete target (`targetType` + `targetId`).
 */
export const riskSignalsQuerySchema = paginationQuerySchema.extend({
  targetType: z.enum(['USER', 'ORGANIZATION', 'OPPORTUNITY', 'CAMPAIGN', 'PAYMENT']).optional(),
  targetId: uuidSchema.optional(),
});

/** decideRiskSchema + the assessment the decision applies to. */
export const riskDecisionSchema = decideRiskSchema.extend({
  assessmentId: uuidSchema,
});

export const incidentsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  type: z.enum(['SECURITY', 'FRAUD', 'ABUSE', 'SAFETY', 'MISCONDUCT', 'OTHER']).optional(),
});
