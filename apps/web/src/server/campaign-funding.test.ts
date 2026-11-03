import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition } from '@bladna/domain';
import { AppError } from '@bladna/types';
import {
  contributionActionSchema,
  contributionListSchema,
  createContributionSchema,
  createSponsorshipSchema,
  opportunityFiltersSchema,
} from '@bladna/validation';
import {
  CAMPAIGN_TRANSITIONS,
  CONTRIBUTION_TRANSITIONS,
  campaignRoutes,
} from './modules/campaigns';

/**
 * DB-free tests for the campaign funding flow and the in-kind sponsorship
 * kind (spec §33, §56): the PENDING → CONFIRMED/REJECTED machine (terminal
 * states, no refunds on the platform), the bank-transfer write schemas, the
 * CASH/IN_KIND refine pair, the campaignId discovery filter and the four
 * registered contribution routes. Handlers only wire these decisions to
 * Prisma, so no database is needed.
 */

describe('contribution lifecycle', () => {
  it('decides PENDING once, into a terminal state', () => {
    expect(canTransition(CONTRIBUTION_TRANSITIONS, 'PENDING', 'CONFIRMED')).toBe(true);
    expect(canTransition(CONTRIBUTION_TRANSITIONS, 'PENDING', 'REJECTED')).toBe(true);
    expect(canTransition(CONTRIBUTION_TRANSITIONS, 'CONFIRMED', 'REJECTED')).toBe(false);
    expect(canTransition(CONTRIBUTION_TRANSITIONS, 'REJECTED', 'CONFIRMED')).toBe(false);
    expect(CONTRIBUTION_TRANSITIONS.CONFIRMED).toHaveLength(0);
    expect(CONTRIBUTION_TRANSITIONS.REJECTED).toHaveLength(0);
  });

  it('throws a 422 business-rule error on a second decision', () => {
    expect(() =>
      assertTransition(CONTRIBUTION_TRANSITIONS, 'CONFIRMED', 'REJECTED', 'contribution'),
    ).toThrowError(AppError);
    try {
      assertTransition(CONTRIBUTION_TRANSITIONS, 'REJECTED', 'CONFIRMED', 'contribution');
      throw new Error('expected a rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('BUSINESS_RULE_ERROR');
    }
  });

  it('keeps the campaign machine untouched (contributions are not a status)', () => {
    expect(canTransition(CAMPAIGN_TRANSITIONS, 'ACTIVE', 'PAUSED')).toBe(true);
    expect(canTransition(CAMPAIGN_TRANSITIONS, 'COMPLETED', 'ACTIVE')).toBe(false);
  });
});

describe('createContributionSchema', () => {
  it('accepts an amount inside the 100…1e9 band with the campaign currency', () => {
    const parsed = createContributionSchema.parse({
      amount: 5000,
      currency: 'DZD',
      reference: 'TRF-2026-001',
    });
    expect(parsed.amount).toBe(5000);
    expect(parsed.reference).toBe('TRF-2026-001');
  });

  it('rejects amounts below 100 and above 1e9', () => {
    expect(createContributionSchema.safeParse({ amount: 99 }).success).toBe(false);
    expect(createContributionSchema.safeParse({ amount: 1_000_000_001 }).success).toBe(false);
    expect(createContributionSchema.safeParse({ amount: -1 }).success).toBe(false);
    expect(createContributionSchema.safeParse({ amount: 'lots' }).success).toBe(false);
  });

  it('treats reference and note as optional bounded text', () => {
    expect(createContributionSchema.safeParse({ amount: 100 }).success).toBe(true);
    expect(
      createContributionSchema.safeParse({ amount: 100, reference: 'x'.repeat(81) }).success,
    ).toBe(false);
    expect(createContributionSchema.safeParse({ amount: 100, note: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});

describe('contribution decisions', () => {
  it('CONFIRM needs no reason; REJECT does', () => {
    expect(contributionActionSchema.safeParse({ action: 'CONFIRM' }).success).toBe(true);
    expect(contributionActionSchema.safeParse({ action: 'REJECT' }).success).toBe(false);
    expect(
      contributionActionSchema.safeParse({ action: 'REJECT', reason: 'No transfer received' })
        .success,
    ).toBe(true);
    expect(contributionActionSchema.safeParse({ action: 'CANCEL' }).success).toBe(false);
  });

  it('filters the org ledger by status only', () => {
    const parsed = contributionListSchema.parse({ status: 'PENDING', limit: '20' });
    expect(parsed.status).toBe('PENDING');
    expect(parsed.limit).toBe(20);
    expect(contributionListSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });
});

describe('createSponsorshipSchema (CASH | IN_KIND)', () => {
  const base = {
    amount: 250000,
    startDate: '2026-03-01',
    campaignId: '0a88ce14-ba19-45e4-ac2a-1b75ea467f17',
  };

  it('defaults to CASH with a positive amount', () => {
    const parsed = createSponsorshipSchema.parse(base);
    expect(parsed.kind).toBe('CASH');
  });

  it('requires an amount for CASH', () => {
    const result = createSponsorshipSchema.safeParse({ ...base, amount: 0 });
    expect(result.success).toBe(false);
  });

  it('requires a description for IN_KIND and allows a 0 estimated value', () => {
    expect(createSponsorshipSchema.safeParse({ ...base, kind: 'IN_KIND', amount: 0 }).success).toBe(
      false,
    );
    const parsed = createSponsorshipSchema.parse({
      ...base,
      kind: 'IN_KIND',
      amount: 0,
      description: 'Two minibuses for the coastal cleanup (estimated value).',
    });
    expect(parsed.kind).toBe('IN_KIND');
    expect(parsed.amount).toBe(0);
    expect(parsed.description).toContain('minibuses');
  });

  it('still demands exactly one target', () => {
    const result = createSponsorshipSchema.safeParse({
      amount: 100,
      startDate: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });
});

describe('campaignId discovery filter + registered routes', () => {
  it('accepts a well-formed campaignId and rejects garbage ids', () => {
    const parsed = opportunityFiltersSchema.parse({
      campaignId: '52ef6fa1-0d5d-4547-b716-ff184e4f8352',
    });
    expect(parsed.campaignId).toBe('52ef6fa1-0d5d-4547-b716-ff184e4f8352');
    expect(opportunityFiltersSchema.safeParse({ campaignId: 'nope' }).success).toBe(false);
  });

  it('registers the four contribution endpoints', () => {
    const keys = campaignRoutes.map((route) => `${route.method} ${route.path}`);
    expect(keys).toContain('POST /campaigns/:id/contributions');
    expect(keys).toContain('POST /campaigns/:id/contributions/:cid/cancel');
    expect(keys).toContain('GET /orgs/:orgId/campaigns/:id/contributions');
    expect(keys).toContain('POST /orgs/:orgId/campaigns/:id/contributions/:cid');
  });
});
