import { z } from 'zod';
import {
  localizedDescriptions,
  orgMemberRoleSchema,
  optionalText,
  organizationTypeSchema,
  paginationQuerySchema,
  phoneSchema,
  registrationConsentsSchema,
  uuidSchema,
} from './common';

/**
 * Tenant self-registration payload (spec §31, §54).
 *
 * There is deliberately NO `representative` block: the creating session's user
 * becomes the OWNER member, and personal data belongs on the User row — this
 * schema collects nothing the platform cannot store.
 */
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: z.string().trim().max(200).optional(),
  organizationType: organizationTypeSchema,
  description: z.string().trim().max(8000).optional(),
  website: z
    .string()
    .trim()
    .url()
    .max(300)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  officialEmail: z.string().trim().email().max(254).optional(),
  phone: phoneSchema.optional(),
  wilayaId: uuidSchema.optional(),
  cityId: uuidSchema.optional(),
  address: z.string().trim().max(400).optional(),
  countryId: uuidSchema.optional(),
  /** consent purposes recorded in the PrivacyConsent ledger (§54) */
  consents: registrationConsentsSchema,
});

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  legalName: z.string().trim().max(200).optional(),
  description: z.string().trim().max(8000).optional(),
  website: z.string().trim().max(300).optional(),
  officialEmail: z.string().trim().email().max(254).optional(),
  phone: phoneSchema.optional(),
  wilayaId: uuidSchema.nullable().optional(),
  cityId: uuidSchema.nullable().optional(),
  address: z.string().trim().max(400).optional(),
  logo: z.string().trim().max(500).optional(),
  coverImage: z.string().trim().max(500).optional(),
});

export const inviteMemberSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  role: orgMemberRoleSchema.refine((role) => role !== 'OWNER', {
    message: 'OWNER_TRANSFER_REQUIRED',
  }),
});

export const acceptInvitationSchema = z.object({ token: z.string().min(10).max(200) });

export const updateMemberSchema = z.object({
  role: orgMemberRoleSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REMOVED']).optional(),
});

export const submitVerificationSchema = z.object({
  notes: z.string().trim().max(4000).optional(),
  documentIds: z.array(uuidSchema).min(1).max(10),
  targetLevel: z
    .enum([
      'LEVEL_1_BASIC_VERIFIED',
      'LEVEL_2_ORGANIZATION_VERIFIED',
      'LEVEL_3_TRUSTED_PARTNER',
      'LEVEL_4_STRATEGIC_PARTNER',
    ])
    .default('LEVEL_1_BASIC_VERIFIED'),
});

export const reviewVerificationSchema = z.object({
  decision: z.enum(['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'REQUEST_INFO']),
  level: z
    .enum([
      'LEVEL_0_UNVERIFIED',
      'LEVEL_1_BASIC_VERIFIED',
      'LEVEL_2_ORGANIZATION_VERIFIED',
      'LEVEL_3_TRUSTED_PARTNER',
      'LEVEL_4_STRATEGIC_PARTNER',
    ])
    .optional(),
  notes: z.string().trim().max(4000).optional(),
  rejectReason: z.string().trim().max(2000).optional(),
  expiresAt: z.coerce.date().optional(),
});

export const organizationFiltersSchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  organizationType: organizationTypeSchema.optional(),
  verificationStatus: z
    .enum(['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED', 'EXPIRED'])
    .optional(),
  wilayaId: uuidSchema.optional(),
  sort: z.enum(['recent', 'name', 'verified']).default('recent'),
});

export const dashboardQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const localizedOrganizationCopy = localizedDescriptions.partial();

export const billingActionSchema = z.object({
  action: z.enum(['UPGRADE', 'DOWNGRADE', 'CANCEL']),
  planId: uuidSchema.optional(),
});

export const orgParamsSchema = z.object({ organizationId: uuidSchema });
export const slugParamsSchema = z.object({ slug: z.string().trim().min(1).max(160) });
export const optionalNote = optionalText(2000);
