// Trust / risk engine v1 (spec §48).
// Deterministic rules with explainable reasons. AI may later re-rank, but the
// output shape stays: score, level, reasons, recommended action.
// Serious permanent actions always require a human decision.

import type { RecommendedAction, RiskLevel, RiskLevel as Level } from '@bladna/types';

export interface RiskSignals {
  /** Age of the organization account in days (new orgs are riskier). */
  organizationAgeDays?: number;
  /** Current trust level index 0..4 (LEVEL_0_UNVERIFIED = 0). */
  trustLevelIndex?: number;
  reportCount?: number;
  openReportCount?: number;
  expiredDocumentCount?: number;
  /** Source domain matches an allow-listed official domain. */
  sourceDomainOfficial?: boolean;
  /** Duplicate-content similarity against an existing record (0..1). */
  duplicateContentScore?: number;
  /** Asks volunteers to pay money / transfer fees. */
  suspiciousPaymentRequest?: boolean;
  /** Location metadata inconsistent with declared address. */
  locationMismatch?: boolean;
  priorSuspensionCount?: number;
  /** Sudden spike of applications from the same account/IP (0..1). */
  abnormalApplicationRate?: number;
  /** Abnormal certificate/hour issuance pattern detected (0..1). */
  abnormalIssuanceScore?: number;
}

export interface RiskReason {
  code: string;
  weight: number;
  detail: string;
}

export interface RiskAssessmentResult {
  riskScore: number; // 0-100
  riskLevel: Level;
  reasons: RiskReason[];
  recommendedAction: RecommendedAction;
}

export const RISK_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 60,
  HIGH: 85,
} as const;

export function assessRisk(signals: RiskSignals): RiskAssessmentResult {
  const reasons: RiskReason[] = [];
  let score = 0;

  const add = (code: string, weight: number, detail: string) => {
    score += weight;
    reasons.push({ code, weight, detail });
  };

  const ageDays = signals.organizationAgeDays ?? 365;
  if (ageDays < 7) add('ORG_NEW_ACCOUNT', 20, 'Organization account is less than 7 days old.');
  else if (ageDays < 30)
    add('ORG_YOUNG_ACCOUNT', 15, 'Organization account is less than 30 days old.');

  const trust = signals.trustLevelIndex ?? 0;
  if (trust === 0) add('ORG_UNVERIFIED', 20, 'Organization has no verification level.');
  else if (trust >= 2) score -= 15; // trusted orgs reduce risk

  if (signals.openReportCount && signals.openReportCount > 0) {
    add(
      'OPEN_REPORTS',
      Math.min(signals.openReportCount * 12, 30),
      `${signals.openReportCount} open report(s).`,
    );
  }
  if (signals.reportCount && signals.reportCount > 3) {
    add('REPORT_HISTORY', 10, `${signals.reportCount} reports in history.`);
  }
  if (signals.expiredDocumentCount && signals.expiredDocumentCount > 0) {
    add('EXPIRED_DOCUMENTS', 15, 'One or more verification documents expired.');
  }
  if (signals.duplicateContentScore && signals.duplicateContentScore >= 0.85) {
    add('DUPLICATE_CONTENT', 15, 'Content closely matches an existing record.');
  }
  if (signals.suspiciousPaymentRequest) {
    add('SUSPICIOUS_PAYMENT_REQUEST', 35, 'Requests money or payments from volunteers.');
  }
  if (signals.locationMismatch) {
    add('LOCATION_MISMATCH', 10, 'Declared location does not match supporting data.');
  }
  if (signals.priorSuspensionCount && signals.priorSuspensionCount > 0) {
    add('PRIOR_SUSPENSIONS', 15, 'Account was suspended before.');
  }
  if (signals.abnormalApplicationRate && signals.abnormalApplicationRate >= 0.7) {
    add('ABNORMAL_APPLICATION_RATE', 12, 'Unusually high application rate detected.');
  }
  if (signals.abnormalIssuanceScore && signals.abnormalIssuanceScore >= 0.7) {
    add('ABNORMAL_ISSUANCE', 20, 'Abnormal hour/certificate issuance pattern.');
  }
  if (signals.sourceDomainOfficial) {
    score -= 10;
    reasons.push({
      code: 'OFFICIAL_SOURCE_DOMAIN',
      weight: -10,
      detail: 'Source domain matches an official domain.',
    });
  }

  const riskScore = Math.max(0, Math.min(100, Math.round(score)));
  const riskLevel: RiskLevel =
    riskScore >= RISK_THRESHOLDS.HIGH
      ? 'CRITICAL'
      : riskScore >= RISK_THRESHOLDS.MEDIUM
        ? 'HIGH'
        : riskScore >= RISK_THRESHOLDS.LOW
          ? 'MEDIUM'
          : 'LOW';

  // AI/rules may recommend — humans decide permanent actions (spec §73).
  const recommendedAction: RecommendedAction =
    riskLevel === 'CRITICAL'
      ? 'SUSPEND'
      : riskLevel === 'HIGH'
        ? 'RESTRICT'
        : riskLevel === 'MEDIUM'
          ? 'QUEUE_FOR_REVIEW'
          : 'AUTO_APPROVE';

  return { riskScore, riskLevel, reasons, recommendedAction };
}
