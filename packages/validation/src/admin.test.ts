import { describe, expect, it } from 'vitest';
import {
  adminOpportunitiesQuerySchema,
  adminOpportunityActionSchema,
  adminOrganizationsQuerySchema,
  adminUserActionSchema,
} from './admin';

describe('adminOrganizationsQuerySchema (platform org list)', () => {
  it('accepts an empty query (pagination stays server-defaulted)', () => {
    expect(adminOrganizationsQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts the documented filter set', () => {
    const parsed = adminOrganizationsQuerySchema.safeParse({
      q: 'atlas',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      organizationType: 'ASSOCIATION',
      page: '2',
      limit: '10',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown organization status', () => {
    expect(adminOrganizationsQuerySchema.safeParse({ status: 'CLOSED' }).success).toBe(false);
  });

  it('rejects an unknown verification status', () => {
    expect(
      adminOrganizationsQuerySchema.safeParse({ verificationStatus: 'APPROVED' }).success,
    ).toBe(false);
  });

  it('rejects an unknown organization type', () => {
    expect(adminOrganizationsQuerySchema.safeParse({ organizationType: 'CLUB' }).success).toBe(
      false,
    );
  });
});

describe('adminOpportunitiesQuerySchema (platform opportunity list)', () => {
  it('accepts status + search filters', () => {
    expect(
      adminOpportunitiesQuerySchema.safeParse({ q: 'plant', status: 'PUBLISHED' }).success,
    ).toBe(true);
  });

  it('rejects an unknown opportunity status', () => {
    expect(adminOpportunitiesQuerySchema.safeParse({ status: 'LIVE' }).success).toBe(false);
  });

  it('rejects a non-uuid organizationId', () => {
    expect(adminOpportunitiesQuerySchema.safeParse({ organizationId: 'not-a-uuid' }).success).toBe(
      false,
    );
  });

  it('accepts a uuid organizationId', () => {
    expect(
      adminOpportunitiesQuerySchema.safeParse({
        organizationId: '3f1d2a4c-6b7e-4f8a-9c0d-1e2f3a4b5c6d',
      }).success,
    ).toBe(true);
  });
});

describe('adminOpportunityActionSchema (moderation action)', () => {
  it('accepts PUBLISH without a reason', () => {
    expect(adminOpportunityActionSchema.safeParse({ action: 'PUBLISH' }).success).toBe(true);
  });

  it('accepts REJECT with a reason (presence is enforced by the handler)', () => {
    const parsed = adminOpportunityActionSchema.safeParse({
      action: 'REJECT',
      reason: '  Misleading description  ',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.reason).toBe('Misleading description');
  });

  it('rejects actions outside the moderation set', () => {
    expect(adminOpportunityActionSchema.safeParse({ action: 'FEATURE' }).success).toBe(false);
    expect(adminOpportunityActionSchema.safeParse({ action: 'DELETE' }).success).toBe(false);
  });

  it('requires the action field', () => {
    expect(adminOpportunityActionSchema.safeParse({}).success).toBe(false);
  });
});

describe('adminUserActionSchema (user security action)', () => {
  it('accepts SUSPEND with a reason', () => {
    const parsed = adminUserActionSchema.safeParse({ action: 'SUSPEND', reason: 'Spam accounts' });
    expect(parsed.success).toBe(true);
  });

  it('keeps reason optional for REINSTATE / FORCE_LOGOUT', () => {
    expect(adminUserActionSchema.safeParse({ action: 'REINSTATE' }).success).toBe(true);
    expect(adminUserActionSchema.safeParse({ action: 'FORCE_LOGOUT' }).success).toBe(true);
  });

  it('rejects an unknown action', () => {
    expect(adminUserActionSchema.safeParse({ action: 'DELETE' }).success).toBe(false);
  });
});
