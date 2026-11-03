import { SPONSORSHIP_KINDS } from '@bladna/types';
import { z } from 'zod';
import {
  optionalText,
  paginationQuerySchema,
  phoneSchema,
  registrationConsentsSchema,
  uuidSchema,
} from './common';

export const createSponsorSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  commercialName: z.string().trim().min(2).max(200),
  description: optionalText(8000),
  website: optionalText(300),
  industry: optionalText(120),
  contactEmail: z.string().trim().email().max(254),
  contactPhone: phoneSchema.optional(),
});

export const updateSponsorSchema = createSponsorSchema.partial();

/** Sponsor self-registration: the admin fields plus the §54 consent bar. */
export const registerSponsorSchema = createSponsorSchema.extend({
  consents: registrationConsentsSchema,
});

export const inviteSponsorMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  role: z.enum(['SPONSOR_MEMBER', 'SPONSOR_ADMIN']),
});

const csrProgramCore = z.object({
  title: z.string().trim().min(2).max(200),
  description: optionalText(8000),
  budget: z.number().gt(0).max(1000000000),
  currency: z.string().length(3).default('DZD'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  volunteerTarget: z.number().int().min(0).max(1000000).nullable().optional(),
  hourTarget: z.number().min(0).max(1000000).nullable().optional(),
  beneficiaryTarget: z.number().int().min(0).max(100000000).nullable().optional(),
  impactTarget: optionalText(1000),
});

export const createCsrProgramSchema = csrProgramCore.refine(
  (value) => value.endDate >= value.startDate,
  { message: 'END_BEFORE_START', path: ['endDate'] },
);

export const updateCsrProgramSchema = csrProgramCore
  .partial()
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: 'END_BEFORE_START',
    path: ['endDate'],
  });

export const createSponsorshipSchema = z
  .object({
    campaignId: uuidSchema.optional(),
    csrProgramId: uuidSchema.optional(),
    /** CASH (default) or IN_KIND — in-kind gifts describe what is donated. */
    kind: z.enum(SPONSORSHIP_KINDS).default('CASH'),
    /** What is contributed when `kind = IN_KIND` (transport, meals, gear…). */
    description: optionalText(2000),
    /** Cash amount, or the estimated value of an in-kind contribution (may be 0). */
    amount: z.number().min(0).max(1000000000),
    currency: z.string().length(3).default('DZD'),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
  })
  .refine((value) => value.campaignId || value.csrProgramId, {
    message: 'TARGET_REQUIRED',
  })
  .refine((value) => value.kind !== 'CASH' || value.amount > 0, {
    message: 'AMOUNT_REQUIRED',
    path: ['amount'],
  })
  .refine((value) => value.kind !== 'IN_KIND' || (value.description ?? '').trim().length > 0, {
    message: 'DESCRIPTION_REQUIRED',
    path: ['description'],
  });

export const sponsorshipActionSchema = z.object({
  action: z.enum(['ACTIVATE', 'COMPLETE', 'CANCEL']),
  reason: optionalText(1000),
});

export const sponsorFiltersSchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED']).optional(),
});

/** Sponsor status state machine action (PENDING/ACTIVE/SUSPENDED/ARCHIVED). */
export const sponsorStatusActionSchema = z.object({
  action: z.enum(['ACTIVATE', 'SUSPEND', 'ARCHIVE', 'RESTORE']),
  reason: optionalText(1000),
});

/** CSR program status state machine action (DRAFT/ACTIVE/PAUSED/COMPLETED/ARCHIVED). */
export const programActionSchema = z.object({
  action: z.enum(['ACTIVATE', 'PAUSE', 'COMPLETE', 'ARCHIVE']),
  reason: optionalText(1000),
});
