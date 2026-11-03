import { describe, expect, it } from 'vitest';
import { AppError } from '@bladna/types';
import type {
  AgreementStatus,
  DisbursementStatus,
  EvidenceStatus,
  FundingCommitmentStatus,
  FundingInstallmentStatus,
  ImpactReportStatus,
  InKindStatus,
  ObligationStatus,
  PartnershipProposalStatus,
  PartnershipRequestStatus,
  PartnershipStatus,
} from '@bladna/types';
import {
  AGREEMENT_STATUSES,
  DISBURSEMENT_STATUSES,
  EVIDENCE_STATUSES,
  FUNDING_COMMITMENT_STATUSES,
  FUNDING_INSTALLMENT_STATUSES,
  IMPACT_REPORT_STATUSES,
  IN_KIND_STATUSES,
  OBLIGATION_STATUSES,
  PARTNERSHIP_PROPOSAL_STATUSES,
  PARTNERSHIP_REQUEST_STATUSES,
  PARTNERSHIP_STATUSES,
} from '@bladna/types';
import {
  AGREEMENT_TRANSITIONS,
  APPLICATION_TRANSITIONS,
  DISBURSEMENT_TRANSITIONS,
  EVIDENCE_TRANSITIONS,
  FUNDING_COMMITMENT_TRANSITIONS,
  FUNDING_INSTALLMENT_TRANSITIONS,
  HOUR_TRANSITIONS,
  HOUR_TRANSITIONS as hours,
  IMPACT_REPORT_TRANSITIONS,
  IN_KIND_TRANSITIONS,
  OBLIGATION_TRANSITIONS,
  OPPORTUNITY_TRANSITIONS,
  PARTNERSHIP_PROPOSAL_TRANSITIONS,
  PARTNERSHIP_REQUEST_TRANSITIONS,
  PARTNERSHIP_TRANSITIONS,
  VERIFICATION_TRANSITIONS,
  assertTransition,
  canTransition,
  type TransitionMap,
} from './state-machines';

describe('application state machine', () => {
  it('allows the happy path', () => {
    expect(canTransition(APPLICATION_TRANSITIONS, 'DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransition(APPLICATION_TRANSITIONS, 'SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition(APPLICATION_TRANSITIONS, 'UNDER_REVIEW', 'ACCEPTED')).toBe(true);
    expect(canTransition(APPLICATION_TRANSITIONS, 'ACCEPTED', 'COMPLETED')).toBe(true);
  });

  it('rejects arbitrary jumps', () => {
    expect(canTransition(APPLICATION_TRANSITIONS, 'DRAFT', 'ACCEPTED')).toBe(false);
    expect(canTransition(APPLICATION_TRANSITIONS, 'SUBMITTED', 'COMPLETED')).toBe(false);
    expect(canTransition(APPLICATION_TRANSITIONS, 'REJECTED', 'ACCEPTED')).toBe(false);
    expect(canTransition(APPLICATION_TRANSITIONS, 'COMPLETED', 'UNDER_REVIEW')).toBe(false);
  });

  it('throws BUSINESS_RULE_ERROR on illegal transition', () => {
    try {
      assertTransition(APPLICATION_TRANSITIONS, 'REJECTED', 'ACCEPTED', 'application');
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('BUSINESS_RULE_ERROR');
    }
  });
});

describe('hours state machine', () => {
  it('verified hours can only be revoked, never silently reverted', () => {
    expect(canTransition(hours, 'VERIFIED', 'REVOKED')).toBe(true);
    expect(canTransition(hours, 'VERIFIED', 'PENDING')).toBe(false);
    expect(canTransition(hours, 'VERIFIED', 'REJECTED')).toBe(false);
    expect(canTransition(hours, 'REVOKED', 'VERIFIED')).toBe(false);
    expect(canTransition(hours, 'REVOKED', 'PENDING')).toBe(false);
  });

  it('pending can be verified or rejected', () => {
    expect(canTransition(HOUR_TRANSITIONS, 'PENDING', 'VERIFIED')).toBe(true);
    expect(canTransition(HOUR_TRANSITIONS, 'PENDING', 'REJECTED')).toBe(true);
    expect(canTransition(HOUR_TRANSITIONS, 'REJECTED', 'PENDING')).toBe(true);
  });
});

describe('opportunity state machine', () => {
  it('enforces review before publishing from review queue', () => {
    expect(canTransition(OPPORTUNITY_TRANSITIONS, 'PENDING_REVIEW', 'PUBLISHED')).toBe(true);
    expect(canTransition(OPPORTUNITY_TRANSITIONS, 'DRAFT', 'PUBLISHED')).toBe(false); // no bypass
    expect(canTransition(OPPORTUNITY_TRANSITIONS, 'REJECTED', 'PUBLISHED')).toBe(false);
    expect(canTransition(OPPORTUNITY_TRANSITIONS, 'ARCHIVED', 'PUBLISHED')).toBe(false);
    expect(canTransition(OPPORTUNITY_TRANSITIONS, 'SUSPENDED', 'PUBLISHED')).toBe(true); // admin restore
  });
});

describe('verification state machine', () => {
  it('follows officer review flow', () => {
    expect(canTransition(VERIFICATION_TRANSITIONS, 'PENDING', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition(VERIFICATION_TRANSITIONS, 'UNDER_REVIEW', 'VERIFIED')).toBe(true);
    expect(canTransition(VERIFICATION_TRANSITIONS, 'PENDING', 'EXPIRED')).toBe(false);
    expect(canTransition(VERIFICATION_TRANSITIONS, 'VERIFIED', 'EXPIRED')).toBe(true);
  });
});

/**
 * Partnerships & CSR (P34): every machine is checked exhaustively — the map's
 * keys must mirror the Prisma/type enums exactly, every declared edge must
 * pass `assertTransition`, and every non-declared edge (including self-loops
 * and any attempt to reopen a terminal state) must throw BUSINESS_RULE_ERROR.
 */
describe('partnerships & CSR state machines (P34)', () => {
  function expectMachineExhaustive<T extends string>(
    label: string,
    map: TransitionMap<T>,
    enumValues: readonly T[],
  ): void {
    it(`${label}: keys mirror the enum and only declared edges pass`, () => {
      expect(Object.keys(map).sort()).toEqual([...enumValues].sort());

      for (const from of enumValues) {
        const legal = map[from] ?? [];
        for (const to of enumValues) {
          const declared = legal.includes(to);
          expect(canTransition(map, from, to)).toBe(declared);
          if (declared) continue;
          try {
            assertTransition(map, from, to, label);
            throw new Error('should have thrown');
          } catch (error) {
            expect(error).toBeInstanceOf(AppError);
            expect((error as AppError).code).toBe('BUSINESS_RULE_ERROR');
          }
        }
      }
    });
  }

  expectMachineExhaustive<PartnershipRequestStatus>(
    'partnership request',
    PARTNERSHIP_REQUEST_TRANSITIONS,
    PARTNERSHIP_REQUEST_STATUSES,
  );
  expectMachineExhaustive<PartnershipProposalStatus>(
    'partnership proposal',
    PARTNERSHIP_PROPOSAL_TRANSITIONS,
    PARTNERSHIP_PROPOSAL_STATUSES,
  );
  expectMachineExhaustive<PartnershipStatus>(
    'partnership',
    PARTNERSHIP_TRANSITIONS,
    PARTNERSHIP_STATUSES,
  );
  expectMachineExhaustive<AgreementStatus>('agreement', AGREEMENT_TRANSITIONS, AGREEMENT_STATUSES);
  expectMachineExhaustive<ObligationStatus>(
    'partnership obligation',
    OBLIGATION_TRANSITIONS,
    OBLIGATION_STATUSES,
  );
  expectMachineExhaustive<FundingCommitmentStatus>(
    'funding commitment',
    FUNDING_COMMITMENT_TRANSITIONS,
    FUNDING_COMMITMENT_STATUSES,
  );
  expectMachineExhaustive<FundingInstallmentStatus>(
    'funding installment',
    FUNDING_INSTALLMENT_TRANSITIONS,
    FUNDING_INSTALLMENT_STATUSES,
  );
  expectMachineExhaustive<DisbursementStatus>(
    'disbursement',
    DISBURSEMENT_TRANSITIONS,
    DISBURSEMENT_STATUSES,
  );
  expectMachineExhaustive<InKindStatus>(
    'in-kind contribution',
    IN_KIND_TRANSITIONS,
    IN_KIND_STATUSES,
  );
  expectMachineExhaustive<EvidenceStatus>(
    'impact evidence',
    EVIDENCE_TRANSITIONS,
    EVIDENCE_STATUSES,
  );
  expectMachineExhaustive<ImpactReportStatus>(
    'impact report',
    IMPACT_REPORT_TRANSITIONS,
    IMPACT_REPORT_STATUSES,
  );

  it('walks the request happy path and blocks decisions from DRAFT', () => {
    expect(canTransition(PARTNERSHIP_REQUEST_TRANSITIONS, 'DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransition(PARTNERSHIP_REQUEST_TRANSITIONS, 'UNDER_REVIEW', 'SHORTLISTED')).toBe(
      true,
    );
    expect(canTransition(PARTNERSHIP_REQUEST_TRANSITIONS, 'SHORTLISTED', 'NEGOTIATION')).toBe(true);
    expect(canTransition(PARTNERSHIP_REQUEST_TRANSITIONS, 'NEGOTIATION', 'APPROVED')).toBe(true);
    expect(canTransition(PARTNERSHIP_REQUEST_TRANSITIONS, 'DRAFT', 'APPROVED')).toBe(false);
    expect(canTransition(PARTNERSHIP_REQUEST_TRANSITIONS, 'REJECTED', 'APPROVED')).toBe(false);
  });

  it('expires waiting requests but never a decided one', () => {
    for (const waiting of [
      'SUBMITTED',
      'UNDER_REVIEW',
      'REQUEST_INFO',
      'SHORTLISTED',
      'NEGOTIATION',
    ] as const) {
      expect(canTransition(PARTNERSHIP_REQUEST_TRANSITIONS, waiting, 'EXPIRED')).toBe(true);
    }
    for (const decided of ['APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(canTransition(PARTNERSHIP_REQUEST_TRANSITIONS, decided, 'EXPIRED')).toBe(false);
      expect(PARTNERSHIP_REQUEST_TRANSITIONS[decided]).toHaveLength(0);
    }
  });

  it('requires the review hop before a proposal decision; supersession is one-way', () => {
    expect(canTransition(PARTNERSHIP_PROPOSAL_TRANSITIONS, 'SUBMITTED', 'ACCEPTED')).toBe(false);
    expect(canTransition(PARTNERSHIP_PROPOSAL_TRANSITIONS, 'UNDER_REVIEW', 'ACCEPTED')).toBe(true);
    expect(canTransition(PARTNERSHIP_PROPOSAL_TRANSITIONS, 'DRAFT', 'SUPERSEDED')).toBe(true);
    expect(canTransition(PARTNERSHIP_PROPOSAL_TRANSITIONS, 'SUPERSEDED', 'ACCEPTED')).toBe(false);
    expect(canTransition(PARTNERSHIP_PROPOSAL_TRANSITIONS, 'ACCEPTED', 'REJECTED')).toBe(false);
  });

  it('locks agreements, paid installments and verified evidence as terminal', () => {
    expect(canTransition(AGREEMENT_TRANSITIONS, 'ACTIVE', 'PENDING_SIGNATURE')).toBe(false);
    expect(AGREEMENT_TRANSITIONS.EXPIRED).toHaveLength(0);
    expect(AGREEMENT_TRANSITIONS.TERMINATED).toHaveLength(0);
    expect(FUNDING_INSTALLMENT_TRANSITIONS.PAID).toHaveLength(0);
    expect(EVIDENCE_TRANSITIONS.VERIFIED).toHaveLength(0);
    expect(EVIDENCE_TRANSITIONS.REJECTED).toHaveLength(0);
    expect(DISBURSEMENT_TRANSITIONS.VERIFIED).toHaveLength(0);
    expect(IN_KIND_TRANSITIONS.VERIFIED).toHaveLength(0);
    expect(IMPACT_REPORT_TRANSITIONS.ARCHIVED).toHaveLength(0);
  });

  it('funnels every disbursement through execution before officer verification', () => {
    expect(canTransition(DISBURSEMENT_TRANSITIONS, 'SCHEDULED', 'VERIFIED')).toBe(false);
    expect(canTransition(DISBURSEMENT_TRANSITIONS, 'SCHEDULED', 'EXECUTED')).toBe(true);
    expect(canTransition(DISBURSEMENT_TRANSITIONS, 'EXECUTED', 'VERIFIED')).toBe(true);
    expect(canTransition(DISBURSEMENT_TRANSITIONS, 'EXECUTED', 'REJECTED')).toBe(true);
  });
});
