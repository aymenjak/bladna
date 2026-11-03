import { z } from 'zod';
import { applicationStatusSchema, paginationQuerySchema, uuidSchema } from './common';

export const createApplicationSchema = z.object({
  motivation: z.string().trim().min(50).max(5000),
  availability: z.string().trim().max(1000).optional(),
  answers: z
    .array(z.object({ questionId: uuidSchema, answer: z.string().trim().max(3000) }))
    .max(20)
    .default([]),
});

export const updateApplicationStatusSchema = z.object({
  status: z.enum(['UNDER_REVIEW', 'ACCEPTED', 'WAITLISTED', 'REJECTED', 'COMPLETED', 'NO_SHOW']),
  decisionNote: z.string().trim().max(2000).optional(),
});

export const bulkApplicationActionSchema = z.object({
  action: z.enum(['UNDER_REVIEW', 'ACCEPTED', 'WAITLISTED', 'REJECTED']),
  applicationIds: z.array(uuidSchema).min(1).max(100),
  decisionNote: z.string().trim().max(2000).optional(),
});

export const withdrawApplicationSchema = z.object({}).optional();

export const myApplicationsQuerySchema = paginationQuerySchema.extend({
  status: applicationStatusSchema.optional(),
});

export const opportunityApplicationsQuerySchema = paginationQuerySchema.extend({
  status: applicationStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['recent', 'oldest']).default('recent'),
});
