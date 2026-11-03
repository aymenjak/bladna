// Partnerships & CSR ecosystem (P34 — design §5): input contracts for the
// economic profile, matching reads, request → proposal → partnership
// lifecycle, funding, in-kind and evidence endpoints. Transition bodies carry
// the *target status* as `action`; the server validates the edge against
// @bladna/domain's state machines, so these schemas only shape the payload.

import {
  AGREEMENT_STATUSES,
  AGREEMENT_TYPES,
  BENEFICIARY_GROUPS,
  ECONOMIC_COMPANY_SIZES,
  ECONOMIC_SECTORS,
  FUNDING_COMMITMENT_STATUSES,
  IMPACT_EVIDENCE_TYPES,
  IN_KIND_CONTRIBUTION_KINDS,
  IN_KIND_STATUSES,
  OBLIGATION_PARTIES,
  OBLIGATION_STATUSES,
  PARTNERSHIP_PROPOSAL_STATUSES,
  PARTNERSHIP_REQUEST_STATUSES,
  PARTNERSHIP_STATUSES,
  PARTNERSHIP_TYPES,
} from '@bladna/types';
import { z } from 'zod';
import {
  emailSchema,
  isoDateSchema,
  optionalText,
  paginationQuerySchema,
  phoneSchema,
  supportNeedKindSchema,
  uuidSchema,
} from './common';
import { createSupportOfferSchema } from './opportunity';

/** Big money ceiling shared by every Decimal(14,2) input (house rule: never Float). */
const money = z.number().min(0.01).max(1000000000000);
const nonNegativeMoney = z.number().min(0).max(1000000000000);

const reasonRequired = <T extends { action: string; reason?: string }>(
  value: T,
  ctx: z.RefinementCtx,
  actions: readonly string[],
  path: Array<string | number> = ['reason'],
): void => {
  if (actions.includes(value.action) && !(value.reason ?? '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: 'REASON_REQUIRED',
    });
  }
};

// ── Economic institution profile ───────────────────────────────────────────

export const updateEconomicProfileSchema = z
  .object({
    sector: z.enum(ECONOMIC_SECTORS).nullable().optional(),
    subSector: z.string().trim().max(80).nullable().optional(),
    companySize: z.enum(ECONOMIC_COMPANY_SIZES).nullable().optional(),
    nationalScope: z.boolean().optional(),
    csrEnabled: z.boolean().optional(),
    esgEnabled: z.boolean().optional(),
    csrContactName: z.string().trim().max(120).nullable().optional(),
    csrContactEmail: emailSchema.nullable().optional(),
    csrContactPhone: phoneSchema.nullable().optional(),
    annualCSRBudget: nonNegativeMoney.nullable().optional(),
    minProjectBudget: nonNegativeMoney.nullable().optional(),
    maxProjectBudget: nonNegativeMoney.nullable().optional(),
    currency: z.string().trim().length(3).optional(),
    preferredSupportTypes: z.array(supportNeedKindSchema).max(10).optional(),
    preferredBeneficiaryGroups: z.array(z.enum(BENEFICIARY_GROUPS)).max(10).optional(),
    /** Replaces the preferred-wilaya set when provided (UUIDs of `Wilaya`). */
    preferredWilayas: z.array(uuidSchema).max(58).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'NO_FIELDS_SUPPLIED' })
  .refine(
    (value) =>
      value.minProjectBudget == null ||
      value.maxProjectBudget == null ||
      value.maxProjectBudget >= value.minProjectBudget,
    { message: 'BUDGET_RANGE_INVALID', path: ['maxProjectBudget'] },
  );

export const putFocusAreasSchema = z.object({
  /** Full replacement set; each entry pairs a seeded CSRFocusArea with a priority. */
  areas: z
    .array(
      z.object({
        focusAreaId: uuidSchema,
        priority: z.number().int().min(-1000).max(1000).default(0),
      }),
    )
    .max(50),
});

export const csrFocusAreaCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'CODE_FORMAT'),
  nameAr: z.string().trim().min(1).max(120),
  nameFr: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

export const csrFocusAreaPatchSchema = z
  .object({
    nameAr: z.string().trim().min(1).max(120),
    nameFr: z.string().trim().min(1).max(120),
    nameEn: z.string().trim().min(1).max(120),
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(100000),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'NO_FIELDS_SUPPLIED' });

export const focusAreaIdParamsSchema = z.object({ id: uuidSchema });
export const metricIdParamsSchema = z.object({ metricId: uuidSchema });
// ── Partner matches (reads; the engine itself is M3) ──────────────────────

export const partnerMatchesQuerySchema = paginationQuerySchema.extend({
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  wilayaId: uuidSchema.optional(),
});

// ── Partnership requests ───────────────────────────────────────────────────

export const createPartnershipRequestSchema = z
  .object({
    requesterOrganizationId: uuidSchema,
    receiverOrganizationId: uuidSchema,
    opportunityId: uuidSchema.optional(),
    supportNeedId: uuidSchema.optional(),
    csrProgramId: uuidSchema.optional(),
    requestedAmount: money.optional(),
    currency: z.string().trim().length(3).default('DZD'),
    message: z.string().trim().min(3).max(2000),
  })
  .superRefine((value, ctx) => {
    if (value.requesterOrganizationId === value.receiverOrganizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['receiverOrganizationId'],
        message: 'REQUESTER_MUST_DIFFER_FROM_RECEIVER',
      });
    }
  });

export const partnershipRequestListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PARTNERSHIP_REQUEST_STATUSES).optional(),
  side: z.enum(['requester', 'receiver']).optional(),
});

export const partnershipRequestTransitionSchema = z
  .object({
    action: z.enum(PARTNERSHIP_REQUEST_STATUSES),
    reason: optionalText(1000),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['REJECTED']));

// ── Proposals (versioned) ──────────────────────────────────────────────────

export const createProposalSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: optionalText(8000),
    requestedAmount: money.optional(),
    currency: z.string().trim().length(3).default('DZD'),
    supportType: supportNeedKindSchema.optional(),
    implementationPlan: optionalText(8000),
    expectedOutcomes: optionalText(4000),
    beneficiaryTarget: z.number().int().min(0).max(100000000).optional(),
    volunteerTarget: z.number().int().min(0).max(1000000).optional(),
    hourTarget: z.number().min(0).max(1000000).optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: 'END_BEFORE_START',
    path: ['endDate'],
  });

export const partnershipProposalTransitionSchema = z
  .object({
    action: z.enum(PARTNERSHIP_PROPOSAL_STATUSES),
    reason: optionalText(1000),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['REJECTED']));

// ── Partnerships ───────────────────────────────────────────────────────────

export const createPartnershipSchema = z
  .object({
    organizationId: uuidSchema,
    economicOrganizationId: uuidSchema,
    opportunityId: uuidSchema.optional(),
    campaignId: uuidSchema.optional(),
    csrProgramId: uuidSchema.optional(),
    partnershipType: z.enum(PARTNERSHIP_TYPES).default('COOPERATION'),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    totalValue: nonNegativeMoney.optional(),
    currency: z.string().trim().length(3).default('DZD'),
  })
  .superRefine((value, ctx) => {
    if (value.organizationId === value.economicOrganizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['economicOrganizationId'],
        message: 'PARTNERSHIP_SIDES_MUST_DIFFER',
      });
    }
  });

export const partnershipListQuerySchema = paginationQuerySchema.extend({
  organizationId: uuidSchema.optional(),
  status: z.enum(PARTNERSHIP_STATUSES).optional(),
  partnershipType: z.enum(PARTNERSHIP_TYPES).optional(),
});

export const partnershipTransitionSchema = z
  .object({
    action: z.enum(PARTNERSHIP_STATUSES),
    reason: optionalText(1000),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['CANCELLED', 'TERMINATED']));

// ── Obligations (each side manages its own party rows) ─────────────────────

export const createObligationSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: optionalText(4000),
  dueDate: isoDateSchema.optional(),
  value: nonNegativeMoney.optional(),
  currency: z.string().trim().length(3).default('DZD'),
  /** Platform actors must name the side; org members are pinned server-side. */
  party: z.enum(OBLIGATION_PARTIES).optional(),
});

export const updateObligationSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: optionalText(4000),
    dueDate: isoDateSchema.nullable().optional(),
    value: nonNegativeMoney.nullable().optional(),
    currency: z.string().trim().length(3),
    evidenceDocumentId: uuidSchema.nullable().optional(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'NO_FIELDS_SUPPLIED' });

export const obligationTransitionSchema = z
  .object({
    action: z.enum(OBLIGATION_STATUSES),
    reason: optionalText(1000),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['WAIVED', 'BREACHED']));

// ── Agreements (numbers come from Counter("agreement_number")) ─────────────

export const createAgreementSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    agreementType: z.enum(AGREEMENT_TYPES).default('FRAMEWORK'),
    documentId: uuidSchema.optional(),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    totalValue: nonNegativeMoney.optional(),
    currency: z.string().trim().length(3).default('DZD'),
  })
  .refine((value) => !value.startDate || !value.endDate || value.endDate >= value.startDate, {
    message: 'END_BEFORE_START',
    path: ['endDate'],
  });

export const agreementTransitionSchema = z
  .object({
    action: z.enum(AGREEMENT_STATUSES),
    reason: optionalText(1000),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['TERMINATED']));

// ── Funding: commitment → installments → disbursements ────────────────────

export const createCommitmentSchema = z.object({
  amount: money,
  currency: z.string().trim().length(3).default('DZD'),
  csrProgramId: uuidSchema.optional(),
  sponsorshipId: uuidSchema.optional(),
  notes: optionalText(1000),
});

export const commitmentTransitionSchema = z
  .object({
    action: z.enum(FUNDING_COMMITMENT_STATUSES),
    reason: optionalText(1000),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['CANCELLED', 'TERMINATED']));

export const createInstallmentSchema = z.object({
  amount: money,
  dueAt: isoDateSchema.optional(),
  reference: optionalText(80),
});

export const installmentTransitionSchema = z.object({
  action: z.enum(['PAID', 'CANCELLED']),
  paidAt: isoDateSchema.optional(),
  reference: optionalText(80),
  evidenceDocumentId: uuidSchema.optional(),
});

export const createDisbursementSchema = z.object({
  amount: money,
  installmentId: uuidSchema.optional(),
  reference: optionalText(80),
  evidenceDocumentId: uuidSchema.optional(),
});

/** Economic side marks the transfer executed (SCHEDULED → EXECUTED). */
export const disbursementTransitionSchema = z.object({
  action: z.enum(['EXECUTED']),
  reference: optionalText(80),
  executedAt: isoDateSchema.optional(),
  evidenceDocumentId: uuidSchema.optional(),
});

/** Verification officer decides on an EXECUTED disbursement — terminal. */
export const verifyDisbursementSchema = z
  .object({
    action: z.enum(['VERIFIED', 'REJECTED']),
    reason: optionalText(500),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['REJECTED']));

// ── In-kind contributions ──────────────────────────────────────────────────

export const createInKindSchema = z.object({
  kind: z.enum(IN_KIND_CONTRIBUTION_KINDS).default('OTHER'),
  item: z.string().trim().min(2).max(200),
  quantity: z.number().int().min(1).max(1000000),
  unit: optionalText(40),
  estimatedValue: nonNegativeMoney.optional(),
  marketValue: nonNegativeMoney.optional(),
  currency: z.string().trim().length(3).default('DZD'),
  deliveryDate: isoDateSchema.optional(),
  deliveryLocation: optionalText(200),
  evidenceDocumentId: uuidSchema.optional(),
  notes: optionalText(1000),
});

export const inKindTransitionSchema = z
  .object({
    action: z.enum(IN_KIND_STATUSES),
    reason: optionalText(500),
    deliveryDate: isoDateSchema.optional(),
    evidenceDocumentId: uuidSchema.optional(),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['REJECTED']));

// ── Impact evidence ────────────────────────────────────────────────────────

export const uploadEvidenceSchema = z
  .object({
    type: z.enum(IMPACT_EVIDENCE_TYPES),
    documentId: uuidSchema.optional(),
    note: optionalText(2000),
  })
  .refine((value) => Boolean(value.documentId) || Boolean(value.note), {
    message: 'DOCUMENT_OR_NOTE_REQUIRED',
  });

export const verifyEvidenceSchema = z
  .object({
    action: z.enum(['VERIFIED', 'REJECTED']),
    reason: optionalText(500),
  })
  .superRefine((value, ctx) => reasonRequired(value, ctx, ['REJECTED']));

/**
 * Body-addressed support offer (P34 — design §5): the alternative to the
 * slug-path route, accepting `organizationId` so an institution offers on
 * behalf of its tenant while the acting member stays the auditable actor.
 */
export const createOrgSupportOfferSchema = createSupportOfferSchema.extend({
  organizationId: uuidSchema.optional(),
});
