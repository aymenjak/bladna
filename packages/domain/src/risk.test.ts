import { describe, expect, it } from 'vitest';
import { assessRisk } from './risk';

describe('risk engine v1', () => {
  it('rates a verified established organization as LOW', () => {
    const result = assessRisk({
      organizationAgeDays: 800,
      trustLevelIndex: 3,
      reportCount: 0,
      openReportCount: 0,
      expiredDocumentCount: 0,
      sourceDomainOfficial: true,
    });
    expect(result.riskLevel).toBe('LOW');
    expect(result.recommendedAction).toBe('AUTO_APPROVE');
    expect(result.riskScore).toBeLessThan(30);
  });

  it('flags payment-seeking and new accounts as CRITICAL', () => {
    const result = assessRisk({
      organizationAgeDays: 2,
      trustLevelIndex: 0,
      suspiciousPaymentRequest: true,
      openReportCount: 2,
    });
    expect(result.riskLevel).toBe('CRITICAL');
    expect(result.recommendedAction).toBe('SUSPEND');
    expect(result.reasons.map((r) => r.code)).toContain('SUSPICIOUS_PAYMENT_REQUEST');
  });

  it('queues medium risks for human review, never auto-approves', () => {
    const result = assessRisk({ organizationAgeDays: 10, trustLevelIndex: 0 });
    expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(result.riskLevel);
    if (result.riskLevel !== 'LOW') {
      expect(result.recommendedAction).not.toBe('AUTO_APPROVE');
    }
  });

  it('clamps score to 0..100', () => {
    const clean = assessRisk({
      organizationAgeDays: 3000,
      trustLevelIndex: 4,
      sourceDomainOfficial: true,
    });
    expect(clean.riskScore).toBeGreaterThanOrEqual(0);
    const dirty = assessRisk({
      organizationAgeDays: 0,
      reportCount: 50,
      openReportCount: 30,
      suspiciousPaymentRequest: true,
      priorSuspensionCount: 5,
      abnormalIssuanceScore: 1,
    });
    expect(dirty.riskScore).toBeLessThanOrEqual(100);
  });
});
