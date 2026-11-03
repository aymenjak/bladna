// Canonical status → badge tone map (RESEARCH §5.3 / P2).
//
// Before this file, every surface carried its own `STATUS_TONE`/`VERIF_TONE`/
// class-string map — the same enum rendered different colors depending on the
// page (e.g. `VerificationStatus.PENDING` was amber on admin-console but sand
// on admin-international). One flat value → tone map makes every flow state
// render exactly one canonical badge; labels stay in the dictionaries (i18n
// keys are per-surface), color is never the only encoding (the label text is
// always present inside the badge).

import type { HTMLAttributes, ReactNode } from 'react';
import { Badge, type BadgeProps } from '@bladna/ui';
import type {
  ActivityStatus,
  ApplicationStatus,
  AttendanceStatus,
  CampaignStatus,
  CertificateStatus,
  ContributionStatus,
  DataRequestStatus,
  HourStatus,
  InternationalApplicationStatus,
  InvoiceStatus,
  OrgMemberStatus,
  OpportunityStatus,
  OrganizationStatus,
  PaymentStatus,
  ProgramStatus,
  ReportStatus,
  RiskLevel,
  SponsorshipStatus,
  SubscriptionStatus,
  SupportOfferStatus,
  UserStatus,
  VerificationStatus,
} from '@bladna/types';

type Tone = NonNullable<BadgeProps['tone']>;

/** Every status-like enum the product renders as a badge. */
type StatusLike =
  | ActivityStatus
  | ApplicationStatus
  | AttendanceStatus
  | CampaignStatus
  | CertificateStatus
  | ContributionStatus
  | DataRequestStatus
  | HourStatus
  | InternationalApplicationStatus
  | InvoiceStatus
  | OrgMemberStatus
  | OpportunityStatus
  | OrganizationStatus
  | PaymentStatus
  | ProgramStatus
  | ReportStatus
  | RiskLevel
  | SponsorshipStatus
  | SubscriptionStatus
  | SupportOfferStatus
  | UserStatus
  | VerificationStatus;

/**
 * Exhaustive by construction: TS fails the build when a new enum value ships
 * without a tone. Semantics (one canonical choice per value, cross-enum):
 *   success  — good / done            (VERIFIED, ACCEPTED, PAID, COMPLETED…)
 *   warning  — waiting / needs action  (PENDING, UNDER_REVIEW, PAUSED…)
 *   danger   — blocked / bad           (REJECTED, SUSPENDED, FAILED…)
 *   info     — ongoing, neutral-positive (IN_PROGRESS, PROCESSING, INTERVIEW…)
 *   neutral  — inert / deliberate end  (DRAFT, ARCHIVED, WITHDRAWN, CANCELLED…)
 */
export const STATUS_TONE: Record<StatusLike, Tone> = {
  // lifecycle
  DRAFT: 'neutral',
  PLANNED: 'neutral',
  PROPOSED: 'info',
  PUBLISHED: 'success',
  ACTIVE: 'success',
  PAUSED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  ARCHIVED: 'neutral',
  IN_PROGRESS: 'info',
  // waiting on someone
  PENDING: 'warning',
  PENDING_CONFIRMATION: 'warning',
  PENDING_VERIFICATION: 'warning',
  PENDING_REVIEW: 'warning',
  UNDER_REVIEW: 'warning',
  SUBMITTED: 'warning',
  WAITLISTED: 'warning',
  OPEN: 'warning',
  INVITED: 'warning',
  PAST_DUE: 'warning',
  OVERDUE: 'warning',
  // good outcomes
  VERIFIED: 'success',
  VALID: 'success',
  CONFIRMED: 'success',
  ACCEPTED: 'success',
  PAID: 'success',
  SUCCEEDED: 'success',
  ACTION_TAKEN: 'success',
  // ongoing / informational
  INVESTIGATING: 'info',
  SHORTLISTED: 'info',
  INTERVIEW: 'info',
  PROCESSING: 'info',
  ISSUED: 'info',
  TRIALING: 'info',
  // attention: failed / blocked
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  BANNED: 'danger',
  REVOKED: 'danger',
  NO_SHOW: 'danger',
  ABSENT: 'danger',
  FAILED: 'danger',
  VOID: 'danger',
  // inert / deliberate ends (not errors)
  WITHDRAWN: 'neutral',
  DISMISSED: 'neutral',
  CLOSED: 'neutral',
  REMOVED: 'neutral',
  DELETED: 'neutral',
  REFUNDED: 'neutral',
  // time-sensitive, not fatal
  EXPIRED: 'warning',
  // risk ladder (RESEARCH §5.3: color never the only cue — label rides along)
  LOW: 'success',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

/** String-typed statuses that have no enum in @bladna/types. */
const EXTRA_STATUS_TONE: Record<string, Tone> = {
  // moderation incident lifecycle
  RESOLVED: 'success',
};

/** Canonical tone for any status value; unknown values fall back to neutral. */
export function statusTone(status: string): Tone {
  return STATUS_TONE[status as StatusLike] ?? EXTRA_STATUS_TONE[status] ?? 'neutral';
}

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Raw enum value (e.g. `row.status`). */
  status: string;
  /** Already-localized label — always rendered, so color is never alone. */
  label: ReactNode;
}

/** The one badge every flow state renders (RESEARCH §5.3). */
export function StatusBadge({ status, label, className, ...rest }: StatusBadgeProps) {
  return (
    <Badge tone={statusTone(status)} className={className} {...rest}>
      {label}
    </Badge>
  );
}
