// Explicit status state machines (spec §107).
// Arbitrary status changes are rejected; transitions are the only legal mutations.

import { AppError } from '@bladna/types';
import type {
  AgreementStatus,
  ApplicationStatus,
  CertificateStatus,
  DisbursementStatus,
  EvidenceStatus,
  FundingCommitmentStatus,
  FundingInstallmentStatus,
  HourStatus,
  ImpactReportStatus,
  InKindStatus,
  ObligationStatus,
  OpportunityStatus,
  PartnershipProposalStatus,
  PartnershipRequestStatus,
  PartnershipStatus,
  SupportOfferStatus,
  VerificationStatus,
} from '@bladna/types';

export type TransitionMap<T extends string> = Readonly<Record<T, readonly T[]>>;

export const APPLICATION_TRANSITIONS: TransitionMap<ApplicationStatus> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['UNDER_REVIEW', 'WITHDRAWN', 'REJECTED'],
  UNDER_REVIEW: ['ACCEPTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
  WAITLISTED: ['ACCEPTED', 'REJECTED', 'WITHDRAWN'],
  ACCEPTED: ['COMPLETED', 'NO_SHOW', 'REJECTED'],
  REJECTED: [],
  WITHDRAWN: [],
  COMPLETED: [],
  NO_SHOW: [],
};

export const HOUR_TRANSITIONS: TransitionMap<HourStatus> = {
  PENDING: ['VERIFIED', 'REJECTED'],
  REJECTED: ['PENDING'], // re-queued after correction, with audit
  VERIFIED: ['REVOKED'], // never a silent edit — revocation supersedes with a new record
  REVOKED: [],
};

export const OPPORTUNITY_TRANSITIONS: TransitionMap<OpportunityStatus> = {
  // Review before publish: a DRAFT can never jump to PUBLISHED — it enters
  // the review queue first, and only moderation accepts (publishes) it.
  DRAFT: ['PENDING_REVIEW', 'ARCHIVED'],
  PENDING_REVIEW: ['PUBLISHED', 'REJECTED', 'DRAFT'],
  PUBLISHED: ['DRAFT', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'],
  REJECTED: ['DRAFT'],
  SUSPENDED: ['DRAFT', 'PUBLISHED'],
  EXPIRED: ['DRAFT', 'ARCHIVED', 'PUBLISHED'],
  ARCHIVED: ['DRAFT'],
};

export const CERTIFICATE_TRANSITIONS: TransitionMap<CertificateStatus> = {
  VALID: ['REVOKED', 'EXPIRED'],
  EXPIRED: ['REVOKED'],
  REVOKED: [],
};

export const VERIFICATION_TRANSITIONS: TransitionMap<VerificationStatus> = {
  PENDING: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED', 'PENDING'],
  VERIFIED: ['SUSPENDED', 'EXPIRED'],
  REJECTED: ['PENDING'],
  SUSPENDED: ['UNDER_REVIEW', 'VERIFIED'],
  EXPIRED: ['UNDER_REVIEW'],
};

// Support offers (spec §13): the owner decides, the offerer cancels while
// pending; decisions are terminal so the trace never rewrites history.
export const SUPPORT_OFFER_TRANSITIONS: TransitionMap<SupportOfferStatus> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: [],
  REJECTED: [],
  CANCELLED: [],
};

// ── Partnerships & CSR ecosystem (P34, design §7) ──────────────────────────
// Eleven machines, one per lifecycle column. The design's happy-path chains
// are extended with the safety edges the workflows imply (cancel/expire while
// waiting on a counterparty, reject short of approval, supersede on revision):
// terminal states stay terminal — never re-decided, never reopened.

export const PARTNERSHIP_REQUEST_TRANSITIONS: TransitionMap<PartnershipRequestStatus> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'CANCELLED', 'EXPIRED'],
  UNDER_REVIEW: ['REQUEST_INFO', 'SHORTLISTED', 'REJECTED', 'EXPIRED'],
  REQUEST_INFO: ['UNDER_REVIEW', 'CANCELLED', 'EXPIRED'],
  SHORTLISTED: ['NEGOTIATION', 'REJECTED', 'EXPIRED'],
  NEGOTIATION: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export const PARTNERSHIP_PROPOSAL_TRANSITIONS: TransitionMap<PartnershipProposalStatus> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN', 'SUPERSEDED'],
  // Decisions require the UNDER_REVIEW hop so a counterparty always sees the
  // proposal was reviewed before it was accepted or rejected.
  SUBMITTED: ['UNDER_REVIEW', 'WITHDRAWN', 'SUPERSEDED'],
  UNDER_REVIEW: ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED'],
  ACCEPTED: [], // terminal — creating the Partnership is its own audited act
  REJECTED: [],
  WITHDRAWN: [],
  SUPERSEDED: [],
};

export const PARTNERSHIP_TRANSITIONS: TransitionMap<PartnershipStatus> = {
  PROPOSED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED', 'TERMINATED'],
  PAUSED: ['ACTIVE', 'CANCELLED', 'TERMINATED'],
  COMPLETED: [],
  CANCELLED: [],
  TERMINATED: [],
};

export const AGREEMENT_TRANSITIONS: TransitionMap<AgreementStatus> = {
  DRAFT: ['PENDING_SIGNATURE'],
  PENDING_SIGNATURE: ['ACTIVE'], // activation stamps signedAt/signedById
  ACTIVE: ['EXPIRED', 'TERMINATED'],
  EXPIRED: [],
  TERMINATED: [],
};

export const OBLIGATION_TRANSITIONS: TransitionMap<ObligationStatus> = {
  PENDING: ['IN_PROGRESS', 'WAIVED', 'BREACHED'],
  IN_PROGRESS: ['FULFILLED', 'WAIVED', 'BREACHED'],
  FULFILLED: [],
  WAIVED: [],
  BREACHED: [],
};

export const FUNDING_COMMITMENT_TRANSITIONS: TransitionMap<FundingCommitmentStatus> = {
  PENDING: ['COMMITTED', 'CANCELLED'],
  COMMITTED: ['CANCELLED', 'TERMINATED'],
  CANCELLED: [],
  TERMINATED: [],
};

export const FUNDING_INSTALLMENT_TRANSITIONS: TransitionMap<FundingInstallmentStatus> = {
  SCHEDULED: ['PAID', 'CANCELLED'],
  PAID: [], // never silently edited — a refund is its own audited record
  CANCELLED: [],
};

export const DISBURSEMENT_TRANSITIONS: TransitionMap<DisbursementStatus> = {
  SCHEDULED: ['EXECUTED'],
  EXECUTED: ['VERIFIED', 'REJECTED'], // only the verification officer decides
  VERIFIED: [],
  REJECTED: [],
};

export const IN_KIND_TRANSITIONS: TransitionMap<InKindStatus> = {
  PLANNED: ['DELIVERED'],
  DELIVERED: ['RECEIVED'],
  RECEIVED: ['VERIFIED', 'REJECTED'], // officer verification, terminal
  VERIFIED: [],
  REJECTED: [],
};

export const EVIDENCE_TRANSITIONS: TransitionMap<EvidenceStatus> = {
  PENDING: ['VERIFIED', 'REJECTED'],
  VERIFIED: [],
  REJECTED: [],
};

export const IMPACT_REPORT_TRANSITIONS: TransitionMap<ImpactReportStatus> = {
  DRAFT: ['GENERATED'],
  GENERATED: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransition<T extends string>(map: TransitionMap<T>, from: T, to: T): boolean {
  return (map[from] ?? []).includes(to);
}

export function assertTransition<T extends string>(
  map: TransitionMap<T>,
  from: T,
  to: T,
  entityLabel = 'record',
): void {
  if (from === to) {
    throw AppError.businessRule(`The ${entityLabel} is already in the "${to}" status.`);
  }
  if (!canTransition(map, from, to)) {
    throw AppError.businessRule(`Invalid ${entityLabel} status change: ${from} → ${to}.`, {
      from,
      to,
      allowed: map[from] ?? [],
    });
  }
}
