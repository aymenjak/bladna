import { describe, expect, it } from 'vitest';
import {
  agreementTransitionSchema,
  createAgreementSchema,
  createObligationSchema,
  createPartnershipRequestSchema,
  createPartnershipSchema,
  createProposalSchema,
  csrFocusAreaCreateSchema,
  installmentTransitionSchema,
  obligationTransitionSchema,
  partnershipRequestTransitionSchema,
  partnershipTransitionSchema,
  putFocusAreasSchema,
  updateEconomicProfileSchema,
  uploadEvidenceSchema,
  verifyDisbursementSchema,
  verifyEvidenceSchema,
} from './partnerships';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const FOCUS = '33333333-3333-4333-8333-333333333333';

describe('economic profile schema (P34)', () => {
  it('rejects an empty patch — at least one field must be supplied', () => {
    expect(updateEconomicProfileSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a single field patch and keeps the budget range sane', () => {
    expect(updateEconomicProfileSchema.parse({ csrEnabled: true }).csrEnabled).toBe(true);
    expect(
      updateEconomicProfileSchema.safeParse({
        minProjectBudget: 500000,
        maxProjectBudget: 100000,
      }).success,
    ).toBe(false);
    expect(
      updateEconomicProfileSchema.safeParse({ minProjectBudget: 100, maxProjectBudget: 200 })
        .success,
    ).toBe(true);
  });

  it('replaces the focus set with priorities (empty set clears)', () => {
    const parsed = putFocusAreasSchema.parse({ areas: [{ focusAreaId: FOCUS }] });
    expect(parsed.areas).toEqual([{ focusAreaId: FOCUS, priority: 0 }]);
    expect(putFocusAreasSchema.parse({ areas: [] }).areas).toHaveLength(0);
  });

  it('rejects a lowercase or punctuated focus code', () => {
    expect(
      csrFocusAreaCreateSchema.safeParse({
        code: 'education',
        nameAr: 'تعليم',
        nameFr: 'Éducation',
        nameEn: 'Education',
      }).success,
    ).toBe(false);
    expect(
      csrFocusAreaCreateSchema.safeParse({
        code: 'EDUCATION',
        nameAr: 'تعليم',
        nameFr: 'Éducation',
        nameEn: 'Education',
      }).success,
    ).toBe(true);
  });
});

describe('partnership request schemas (P34)', () => {
  it('rejects a self-directed request', () => {
    expect(
      createPartnershipRequestSchema.safeParse({
        requesterOrganizationId: ORG_A,
        receiverOrganizationId: ORG_A,
        message: 'نود دعم مبادرتنا',
      }).success,
    ).toBe(false);
  });

  it('accepts a cross-org request with an amount and defaults the currency', () => {
    const parsed = createPartnershipRequestSchema.parse({
      requesterOrganizationId: ORG_A,
      receiverOrganizationId: ORG_B,
      message: 'طلب شراكة لمشروع توعية بيئية',
      requestedAmount: 250000,
    });
    expect(parsed.currency).toBe('DZD');
    expect(parsed.requestedAmount).toBe(250000);
  });

  it('requires a reason to REJECT but not for review moves', () => {
    expect(partnershipRequestTransitionSchema.safeParse({ action: 'REJECTED' }).success).toBe(
      false,
    );
    expect(
      partnershipRequestTransitionSchema.parse({ action: 'REJECTED', reason: 'خارج النطاق' })
        .action,
    ).toBe('REJECTED');
    expect(partnershipRequestTransitionSchema.safeParse({ action: 'SHORTLISTED' }).success).toBe(
      true,
    );
  });
});

describe('proposal & partnership schemas (P34)', () => {
  it('rejects an end date before the start date', () => {
    expect(
      createProposalSchema.safeParse({
        title: 'برنامج تمكين الشباب',
        startDate: '2026-06-01',
        endDate: '2026-05-01',
      }).success,
    ).toBe(false);
  });

  it('rejects a partnership between one organization and itself', () => {
    expect(
      createPartnershipSchema.safeParse({
        organizationId: ORG_A,
        economicOrganizationId: ORG_A,
      }).success,
    ).toBe(false);
    expect(
      createPartnershipSchema.safeParse({ organizationId: ORG_A, economicOrganizationId: ORG_B })
        .success,
    ).toBe(true);
  });

  it('requires reasons for cancel/terminate but not for activation', () => {
    expect(partnershipTransitionSchema.safeParse({ action: 'ACTIVE' }).success).toBe(true);
    expect(partnershipTransitionSchema.safeParse({ action: 'TERMINATED' }).success).toBe(false);
    expect(
      partnershipTransitionSchema.safeParse({ action: 'TERMINATED', reason: 'انتهت المدة' })
        .success,
    ).toBe(true);
  });
});

describe('obligation & agreement schemas (P34)', () => {
  it('names the party only when the platform creates an obligation', () => {
    const parsed = createObligationSchema.parse({
      title: 'تقرير نصف سنوي',
      party: 'ECONOMIC_ORGANIZATION',
    });
    expect(parsed.party).toBe('ECONOMIC_ORGANIZATION');
    expect(createObligationSchema.safeParse({ title: 'تقرير' }).success).toBe(true);
  });

  it('waiving or breaching an obligation demands a reason', () => {
    expect(obligationTransitionSchema.safeParse({ action: 'FULFILLED' }).success).toBe(true);
    expect(obligationTransitionSchema.safeParse({ action: 'WAIVED' }).success).toBe(false);
    expect(obligationTransitionSchema.safeParse({ action: 'BREACHED' }).success).toBe(false);
  });

  it('agreements need a reason to terminate and dates in order', () => {
    expect(agreementTransitionSchema.safeParse({ action: 'TERMINATED' }).success).toBe(false);
    expect(createAgreementSchema.safeParse({ title: 'إطار تعاون' }).success).toBe(true);
    expect(
      createAgreementSchema.safeParse({
        title: 'إطار تعاون',
        startDate: '2026-10-01',
        endDate: '2026-09-01',
      }).success,
    ).toBe(false);
  });
});

describe('funding & evidence schemas (P34)', () => {
  it('only accepts terminal installment targets', () => {
    expect(installmentTransitionSchema.safeParse({ action: 'PAID' }).success).toBe(true);
    expect(installmentTransitionSchema.safeParse({ action: 'SCHEDULED' }).success).toBe(false);
    expect(installmentTransitionSchema.safeParse({ action: 'COMMITTED' }).success).toBe(false);
  });

  it('rejects a rejected disbursement/evidence without a reason', () => {
    expect(verifyDisbursementSchema.safeParse({ action: 'REJECTED' }).success).toBe(false);
    expect(verifyDisbursementSchema.safeParse({ action: 'VERIFIED' }).success).toBe(true);
    expect(verifyEvidenceSchema.safeParse({ action: 'REJECTED' }).success).toBe(false);
    expect(
      verifyEvidenceSchema.parse({ action: 'REJECTED', reason: 'فاتورة غير واضحة' }).action,
    ).toBe('REJECTED');
  });

  it('evidence upload needs at least a document or a note', () => {
    expect(uploadEvidenceSchema.safeParse({ type: 'PHOTO' }).success).toBe(false);
    expect(uploadEvidenceSchema.safeParse({ type: 'PHOTO', note: 'صورة الموقع' }).success).toBe(
      true,
    );
  });
});
