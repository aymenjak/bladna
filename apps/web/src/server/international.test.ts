import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AppError } from '@bladna/types';
import {
  adminInternationalApplicationsQuerySchema,
  createInternationalApplicationSchema,
  createInternationalExperienceSchema,
  internationalCountryParamsSchema,
  internationalRecommendationsQuerySchema,
  updateInternationalApplicationStatusSchema,
  updateInternationalPassportSchema,
  verifyInternationalExperienceSchema,
} from '@bladna/validation';
import { DEFAULT_FLAGS } from './infra/flags';
import {
  INTERNATIONAL_APPLICATION_TRANSITIONS,
  INTERNATIONAL_WITHDRAWABLE_STATUSES,
  ageAt,
  ageStatusAt,
  assertInternationalApplicationAllowed,
  buildCountryAggregates,
  canTransitionInternationalApplication,
  evaluateEligibility,
  internationalRoutes,
  isWithdrawableInternationalStatus,
  orderProviderAggregates,
  rankRecommendations,
  recordsReviewOn,
  verifiedAtFor,
  type EligibilityOpportunityInput,
  type EligibilityProfileInput,
  type RecommendationCandidate,
} from './modules/international';

/**
 * DB-free tests for the BLADNA International server layer (spec §4–§11, §21,
 * §58, §70): the deterministic eligibility engine, the application create and
 * withdraw rules, the platform transition machine, the verification stamp,
 * recommendation scoring, the country/provider aggregations, the registered
 * route table and the write schemas. Handlers themselves only wire these pure
 * decisions to Prisma, so nothing here needs a database or a new test
 * dependency.
 */

const NOW = new Date(2026, 0, 1, 12, 0, 0); // 1 Jan 2026, local time
const BIRTHDAY = new Date(2000, 5, 15); // 15 Jun 2000 → age 25 on NOW

function opportunity(
  overrides: Partial<EligibilityOpportunityInput> = {},
): EligibilityOpportunityInput {
  return {
    verificationStatus: 'VERIFIED',
    minAge: null,
    maxAge: null,
    deadline: null,
    startDate: null,
    languageRequirements: null,
    skills: null,
    ...overrides,
  };
}

function profile(overrides: Partial<EligibilityProfileInput> = {}): EligibilityProfileInput {
  return {
    dateOfBirth: BIRTHDAY,
    availability: ['FLEXIBLE'],
    passportReadiness: 'READY',
    ...overrides,
  };
}

function statusesOf(result: ReturnType<typeof evaluateEligibility>): Record<string, string> {
  return Object.fromEntries(result.checks.map((check) => [check.key, check.status]));
}

function expectAppError(run: () => unknown, code: string, status?: number): AppError {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(AppError);
  const appError = thrown as AppError;
  expect(appError.code).toBe(code);
  if (status !== undefined) expect(appError.status).toBe(status);
  return appError;
}

// ── Eligibility engine (§11) ────────────────────────────────────

describe('evaluateEligibility', () => {
  it('is ELIGIBLE and canApply when a dated, available profile clears an open offer', () => {
    const result = evaluateEligibility({
      opportunity: opportunity(),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });

    expect(statusesOf(result)).toEqual({
      age: 'ELIGIBLE',
      language: 'NOT_REQUIRED',
      experience: 'NOT_REQUIRED',
      availability: 'ELIGIBLE',
      documents: 'NOT_REQUIRED',
    });
    expect(result.overall).toBe('ELIGIBLE');
    expect(result.blockers).toEqual([]);
    expect(result.canApply).toBe(true);
    expect(result.passportReadiness).toBe('READY');
  });

  it('returns UNKNOWN checks, NOT_AVAILABLE readiness and canApply=false without a profile', () => {
    const result = evaluateEligibility({
      opportunity: opportunity(),
      profile: null,
      hasActiveApplication: false,
      now: NOW,
    });

    expect(result.checks.find((check) => check.key === 'age')?.status).toBe('UNKNOWN');
    expect(result.checks.find((check) => check.key === 'availability')?.status).toBe('UNKNOWN');
    // Offer-side requirements are still readable without a profile.
    expect(result.checks.find((check) => check.key === 'language')?.status).toBe('NOT_REQUIRED');
    expect(result.checks.find((check) => check.key === 'documents')?.status).toBe('NOT_REQUIRED');
    expect(result.overall).toBe('UNKNOWN');
    expect(result.passportReadiness).toBe('NOT_AVAILABLE');
    expect(result.canApply).toBe(false);
  });

  it('applies inclusive age bounds against the reference date', () => {
    // Age on NOW is exactly 25 → both bounds include it.
    expect(ageAt(BIRTHDAY, NOW)).toBe(25);
    expect(ageStatusAt(BIRTHDAY, NOW, 25, 25)).toBe('ELIGIBLE');
    expect(ageStatusAt(BIRTHDAY, NOW, 0, 99)).toBe('ELIGIBLE');

    const tooYoung = evaluateEligibility({
      opportunity: opportunity({ minAge: 30 }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(tooYoung.checks.find((check) => check.key === 'age')?.status).toBe('NOT_ELIGIBLE');
    expect(tooYoung.overall).toBe('NOT_ELIGIBLE');
    expect(tooYoung.blockers).toContain('not_eligible');
    expect(tooYoung.canApply).toBe(false);

    const tooOld = evaluateEligibility({
      opportunity: opportunity({ maxAge: 20 }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(tooOld.checks.find((check) => check.key === 'age')?.status).toBe('NOT_ELIGIBLE');
  });

  it('evaluates age at startDate (not at now) and treats a past start as a blocker', () => {
    const futureStart = new Date(2030, 6, 1); // 1 Jul 2030 → age 30
    const atStart = evaluateEligibility({
      opportunity: opportunity({ startDate: futureStart, minAge: 30 }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(atStart.checks.find((check) => check.key === 'age')?.status).toBe('ELIGIBLE');
    expect(atStart.blockers).toEqual([]);

    const pastStart = evaluateEligibility({
      opportunity: opportunity({ startDate: new Date(2020, 0, 1) }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(pastStart.blockers).toContain('already_started');
    expect(pastStart.canApply).toBe(false);
  });

  it('marks language/experience UNKNOWN when the offer states requirements, NOT_REQUIRED otherwise', () => {
    const stated = evaluateEligibility({
      opportunity: opportunity({ languageRequirements: 'English B2', skills: 'first aid' }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(statusesOf(stated)).toMatchObject({
      language: 'UNKNOWN',
      experience: 'UNKNOWN',
      documents: 'NOT_REQUIRED',
    });
    expect(stated.overall).toBe('UNKNOWN');
    expect(stated.canApply).toBe(true); // UNKNOWN alone never blocks the application

    const blank = evaluateEligibility({
      opportunity: opportunity({ languageRequirements: '   ', skills: '' }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(blank.checks.find((check) => check.key === 'language')?.status).toBe('NOT_REQUIRED');
    expect(blank.checks.find((check) => check.key === 'experience')?.status).toBe('NOT_REQUIRED');
  });

  it('ranks overall as NOT_ELIGIBLE > UNKNOWN > ELIGIBLE', () => {
    const mixed = evaluateEligibility({
      opportunity: opportunity({ minAge: 30, languageRequirements: 'English B2' }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(mixed.overall).toBe('NOT_ELIGIBLE');

    const unknownOnly = evaluateEligibility({
      opportunity: opportunity({ languageRequirements: 'English B2' }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(unknownOnly.overall).toBe('UNKNOWN');

    const clean = evaluateEligibility({
      opportunity: opportunity(),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(clean.overall).toBe('ELIGIBLE');
  });

  it('reports blockers in the machine order and keeps canApply false while any exists', () => {
    const result = evaluateEligibility({
      opportunity: opportunity({
        verificationStatus: 'REJECTED',
        deadline: new Date(2025, 11, 1),
        startDate: new Date(2025, 0, 1),
        minAge: 40, // also NOT_ELIGIBLE
      }),
      profile: profile(),
      hasActiveApplication: true,
      now: NOW,
    });
    expect(result.blockers).toEqual([
      'deadline_passed',
      'already_started',
      'duplicate_application',
      'not_eligible',
      'opportunity_hidden',
    ]);
    expect(result.canApply).toBe(false);
    expect(result.overall).toBe('NOT_ELIGIBLE');
  });

  it('keeps deadline_passed ahead of an ELIGIBLE overall (canApply false, overall ELIGIBLE)', () => {
    const result = evaluateEligibility({
      opportunity: opportunity({ deadline: NOW }),
      profile: profile(),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(result.overall).toBe('ELIGIBLE');
    expect(result.blockers).toEqual(['deadline_passed']);
    expect(result.canApply).toBe(false);
  });

  it('treats a profile with no availability slots as UNKNOWN', () => {
    const result = evaluateEligibility({
      opportunity: opportunity(),
      profile: profile({ availability: [] }),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(result.checks.find((check) => check.key === 'availability')?.status).toBe('UNKNOWN');
    expect(result.overall).toBe('UNKNOWN');
    expect(result.canApply).toBe(true);
  });

  it('treats a missing birth date as an UNKNOWN age check', () => {
    const result = evaluateEligibility({
      opportunity: opportunity({ minAge: 18 }),
      profile: profile({ dateOfBirth: null }),
      hasActiveApplication: false,
      now: NOW,
    });
    expect(result.checks.find((check) => check.key === 'age')?.status).toBe('UNKNOWN');
    expect(result.overall).toBe('UNKNOWN');
    expect(result.canApply).toBe(true);
  });
});

// ── POST /international/applications re-check ───────────────────

describe('assertInternationalApplicationAllowed', () => {
  const base = { opportunity: opportunity(), dateOfBirth: BIRTHDAY, now: NOW };

  it('accepts an open offer with no active duplicate', () => {
    expect(() =>
      assertInternationalApplicationAllowed({ ...base, hasActiveApplication: false }),
    ).not.toThrow();
  });

  it('rejects a duplicate with 409 CONFLICT — ahead of every 422 rule', () => {
    const error = expectAppError(
      () =>
        assertInternationalApplicationAllowed({
          ...base,
          opportunity: opportunity({ deadline: new Date(2025, 11, 1) }),
          hasActiveApplication: true,
        }),
      'CONFLICT',
      409,
    );
    expect(error.message).toBe('You have already applied to this opportunity.');
  });

  it('rejects a passed deadline with 422 BUSINESS_RULE_ERROR', () => {
    const error = expectAppError(
      () =>
        assertInternationalApplicationAllowed({
          ...base,
          opportunity: opportunity({ deadline: new Date(2025, 11, 1) }),
          hasActiveApplication: false,
        }),
      'BUSINESS_RULE_ERROR',
      422,
    );
    expect(error.message).toBe('The application deadline for this opportunity has passed.');
  });

  it('rejects an offer that already started with 422', () => {
    const error = expectAppError(
      () =>
        assertInternationalApplicationAllowed({
          ...base,
          opportunity: opportunity({ startDate: new Date(2025, 0, 1) }),
          hasActiveApplication: false,
        }),
      'BUSINESS_RULE_ERROR',
      422,
    );
    expect(error.message).toBe('This opportunity has already started.');
  });

  it('rejects age bound failures with 422 and bound-specific wording', () => {
    const tooYoung = expectAppError(
      () =>
        assertInternationalApplicationAllowed({
          ...base,
          opportunity: opportunity({ minAge: 30 }),
          hasActiveApplication: false,
        }),
      'BUSINESS_RULE_ERROR',
      422,
    );
    expect(tooYoung.message).toBe('You must be at least 30 years old for this opportunity.');

    const tooOld = expectAppError(
      () =>
        assertInternationalApplicationAllowed({
          ...base,
          opportunity: opportunity({ maxAge: 20 }),
          hasActiveApplication: false,
        }),
      'BUSINESS_RULE_ERROR',
      422,
    );
    expect(tooOld.message).toBe('This opportunity accepts participants up to 20 years old.');

    // No bounds stated → only the open [0, 99] window can fail, without a
    // bound-specific claim the offer never made.
    expectAppError(
      () =>
        assertInternationalApplicationAllowed({
          ...base,
          dateOfBirth: new Date(1900, 0, 1),
          hasActiveApplication: false,
        }),
      'BUSINESS_RULE_ERROR',
      422,
    );
  });

  it('cannot evaluate age without a birth date (everything else still applies)', () => {
    expect(() =>
      assertInternationalApplicationAllowed({
        ...base,
        dateOfBirth: null,
        opportunity: opportunity({ minAge: 30 }),
        hasActiveApplication: false,
      }),
    ).not.toThrow();
  });
});

// ── Volunteer withdraw window (§9) ──────────────────────────────

describe('international application withdrawal', () => {
  it('allows exactly the open statuses', () => {
    expect([...INTERNATIONAL_WITHDRAWABLE_STATUSES]).toEqual([
      'DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'SHORTLISTED',
      'INTERVIEW',
      'WAITLISTED',
    ]);
    for (const status of INTERNATIONAL_WITHDRAWABLE_STATUSES) {
      expect(isWithdrawableInternationalStatus(status)).toBe(true);
    }
  });

  it('refuses terminal decisions', () => {
    for (const status of ['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'COMPLETED']) {
      expect(isWithdrawableInternationalStatus(status)).toBe(false);
    }
  });
});

// ── Platform transition machine (§9) ────────────────────────────

describe('INTERNATIONAL_APPLICATION_TRANSITIONS', () => {
  it('matches the platform machine exactly', () => {
    expect(INTERNATIONAL_APPLICATION_TRANSITIONS).toEqual({
      DRAFT: ['SUBMITTED', 'WITHDRAWN'],
      SUBMITTED: ['UNDER_REVIEW', 'REJECTED', 'WITHDRAWN'],
      UNDER_REVIEW: ['SHORTLISTED', 'WAITLISTED', 'REJECTED', 'WITHDRAWN'],
      SHORTLISTED: ['INTERVIEW', 'WAITLISTED', 'REJECTED'],
      INTERVIEW: ['ACCEPTED', 'WAITLISTED', 'REJECTED'],
      WAITLISTED: ['ACCEPTED', 'REJECTED'],
      ACCEPTED: ['COMPLETED'],
      REJECTED: [],
      WITHDRAWN: [],
      COMPLETED: [],
    });
  });

  it('accepts legal edges and rejects illegal ones (the handler answers 422)', () => {
    expect(canTransitionInternationalApplication('DRAFT', 'SUBMITTED')).toBe(true);
    expect(canTransitionInternationalApplication('UNDER_REVIEW', 'SHORTLISTED')).toBe(true);
    expect(canTransitionInternationalApplication('INTERVIEW', 'ACCEPTED')).toBe(true);
    expect(canTransitionInternationalApplication('ACCEPTED', 'COMPLETED')).toBe(true);

    expect(canTransitionInternationalApplication('ACCEPTED', 'WITHDRAWN')).toBe(false);
    expect(canTransitionInternationalApplication('REJECTED', 'SUBMITTED')).toBe(false);
    expect(canTransitionInternationalApplication('COMPLETED', 'REJECTED')).toBe(false);
    expect(canTransitionInternationalApplication('SUBMITTED', 'ACCEPTED')).toBe(false);
    // Self transitions are not edges either.
    expect(canTransitionInternationalApplication('SUBMITTED', 'SUBMITTED')).toBe(false);
    // The volunteer's withdraw window is broader than the platform machine.
    expect(canTransitionInternationalApplication('WAITLISTED', 'WITHDRAWN')).toBe(false);
    expect(isWithdrawableInternationalStatus('WAITLISTED')).toBe(true);
  });

  it('stamps the reviewer only on ACCEPTED / REJECTED / COMPLETED', () => {
    expect(recordsReviewOn('ACCEPTED')).toBe(true);
    expect(recordsReviewOn('REJECTED')).toBe(true);
    expect(recordsReviewOn('COMPLETED')).toBe(true);
    expect(recordsReviewOn('UNDER_REVIEW')).toBe(false);
    expect(recordsReviewOn('SHORTLISTED')).toBe(false);
    expect(recordsReviewOn('WITHDRAWN')).toBe(false);
  });
});

// ── Verification history (§8, append-only) ──────────────────────

describe('verifiedAtFor', () => {
  const now = new Date(2026, 0, 2);

  it('stamps when the offer becomes VERIFIED', () => {
    expect(verifiedAtFor('PENDING', 'VERIFIED', now)).toBe(now);
    expect(verifiedAtFor('UNDER_REVIEW', 'VERIFIED', now)).toBe(now);
  });

  it('clears the stamp when the offer leaves VERIFIED', () => {
    expect(verifiedAtFor('VERIFIED', 'REJECTED', now)).toBeNull();
    expect(verifiedAtFor('VERIFIED', 'SUSPENDED', now)).toBeNull();
  });

  it('leaves the stamp untouched when the flag does not move', () => {
    expect(verifiedAtFor('VERIFIED', 'VERIFIED', now)).toBeUndefined();
    expect(verifiedAtFor('PENDING', 'REJECTED', now)).toBeUndefined();
  });
});

describe('verification events stay append-only', () => {
  const source = readFileSync(
    fileURLToPath(new URL('./modules/international.ts', import.meta.url)),
    'utf8',
  );

  it('only ever creates InternationalVerificationEvent rows', () => {
    expect(source).toContain('prisma.$transaction');
    expect(source).toMatch(/internationalVerificationEvent\.create\(/);
    expect(source).not.toMatch(
      /internationalVerificationEvent\.(update|upsert|delete|updateMany|deleteMany)\(/,
    );
  });
});

// ── Recommendations (§58) ───────────────────────────────────────

describe('rankRecommendations', () => {
  const candidates: RecommendationCandidate[] = [
    { id: 'c1', category: 'VOLUNTEERING', countryId: 'DZ', deadline: new Date(2026, 1, 1) },
    { id: 'c2', category: 'YOUTH_EXCHANGE', countryId: 'FR', deadline: null },
    { id: 'c3', category: 'VOLUNTEERING', countryId: 'US', deadline: new Date(2026, 5, 1) },
  ];
  const matching = {
    preferredCategories: ['VOLUNTEERING'] as const,
    preferredCountryIds: ['DZ'],
    internationalPreference: false,
  };

  it('scores +2 category / +2 country and drops zero-score offers', () => {
    const ranked = rankRecommendations(candidates, matching, 6, NOW);
    expect(ranked.map((row) => row.id)).toEqual(['c1', 'c3']);
    expect(ranked[0]).toMatchObject({ score: 4, reasons: ['category', 'country'] });
    expect(ranked[1]).toMatchObject({ score: 2, reasons: ['category'] });
  });

  it('sorts by score desc, then deadline asc with nulls last', () => {
    const ties: RecommendationCandidate[] = [
      { id: 'no-deadline', category: 'VOLUNTEERING', countryId: null, deadline: null },
      { id: 'late', category: 'VOLUNTEERING', countryId: null, deadline: new Date(2026, 8, 1) },
      { id: 'early', category: 'VOLUNTEERING', countryId: null, deadline: new Date(2026, 3, 1) },
    ];
    const ranked = rankRecommendations(ties, matching, 6, NOW);
    expect(ranked.map((row) => row.id)).toEqual(['early', 'late', 'no-deadline']);
  });

  it('honours the limit', () => {
    expect(rankRecommendations(candidates, matching, 1, NOW)).toHaveLength(1);
  });

  it('adds international_interest for opted-in volunteers', () => {
    const ranked = rankRecommendations(
      candidates,
      { ...matching, internationalPreference: true },
      6,
      NOW,
    );
    expect(ranked[0].reasons).toEqual(['category', 'country', 'international_interest']);
  });

  it('falls back to every open offer with international_interest only when opted in', () => {
    const noMatches = {
      preferredCategories: ['SPORT_PROJECT'] as const,
      preferredCountryIds: [] as string[],
      internationalPreference: true,
    };
    const fallback = rankRecommendations(
      [
        ...candidates,
        { id: 'closed', category: 'VOLUNTEERING', countryId: null, deadline: new Date(2025, 0, 1) },
      ],
      noMatches,
      6,
      NOW,
    );
    // The passed deadline is not "open"; everything else comes back with one reason.
    expect(fallback.map((row) => row.id)).toEqual(['c1', 'c3', 'c2']);
    for (const row of fallback) expect(row.reasons).toEqual(['international_interest']);

    const optedOut = rankRecommendations(
      candidates,
      { ...noMatches, internationalPreference: false },
      6,
      NOW,
    );
    expect(optedOut).toEqual([]);
  });
});

// ── Country / provider aggregations ─────────────────────────────

describe('buildCountryAggregates', () => {
  const countries = [
    { id: 'a', code: 'DZ', nameAr: 'الجزائر', nameFr: 'Algérie', nameEn: 'Algeria' },
    { id: 'b', code: 'FR', nameAr: 'فرنسا', nameFr: 'France', nameEn: 'France' },
    { id: 'c', code: 'BE', nameAr: 'بلجيكا', nameFr: 'Belgique', nameEn: 'Belgium' },
    { id: 'd', code: 'TN', nameAr: 'تونس', nameFr: 'Tunisie', nameEn: 'Tunisia' },
  ];

  it('orders by count desc then nameEn asc and drops countries without offers', () => {
    const rows = buildCountryAggregates(countries, [
      { countryId: 'a', count: 2 },
      { countryId: 'b', count: 5 },
      { countryId: 'c', count: 2 },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['b', 'a', 'c']);
    expect(rows.map((row) => row.opportunityCount)).toEqual([5, 2, 2]);
    expect(rows[0]).toMatchObject({ code: 'FR', nameEn: 'France', opportunityCount: 5 });
    expect(rows.map((row) => row.id)).not.toContain('d');
  });

  it('returns an empty list when no country has a visible offer', () => {
    expect(buildCountryAggregates(countries, [])).toEqual([]);
  });
});

describe('orderProviderAggregates', () => {
  it('orders by count desc then provider asc', () => {
    expect(
      orderProviderAggregates([
        { provider: 'UNHCR', opportunityCount: 1 },
        { provider: 'BRAC', opportunityCount: 3 },
        { provider: 'AIC', opportunityCount: 3 },
      ]),
    ).toEqual([
      { provider: 'AIC', opportunityCount: 3 },
      { provider: 'BRAC', opportunityCount: 3 },
      { provider: 'UNHCR', opportunityCount: 1 },
    ]);
  });
});

// ── Write schemas ───────────────────────────────────────────────

describe('international validation schemas', () => {
  it('clamps the recommendation limit to 1–12 with a default of 6', () => {
    expect(internationalRecommendationsQuerySchema.parse({})).toEqual({ limit: 6 });
    expect(internationalRecommendationsQuerySchema.parse({ limit: '12' })).toEqual({ limit: 12 });
    expect(internationalRecommendationsQuerySchema.safeParse({ limit: '13' }).success).toBe(false);
    expect(internationalRecommendationsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('accepts 2–4 letter country codes only', () => {
    expect(internationalCountryParamsSchema.parse({ code: 'DZ' })).toEqual({ code: 'DZ' });
    expect(internationalCountryParamsSchema.safeParse({ code: 'dz' }).success).toBe(true);
    expect(internationalCountryParamsSchema.safeParse({ code: 'DZ1' }).success).toBe(false);
    expect(internationalCountryParamsSchema.safeParse({ code: 'ALGERIA' }).success).toBe(false);
  });

  it('validates an application payload with field length caps', () => {
    const valid = {
      opportunityId: '3f1d2a4c-6b7e-4f8a-9c0d-1e2f3a4b5c6d',
      passportReadiness: 'READY',
      motivationLetter: 'x'.repeat(4000),
    };
    expect(createInternationalApplicationSchema.safeParse(valid).success).toBe(true);
    expect(
      createInternationalApplicationSchema.safeParse({
        ...valid,
        motivationLetter: 'x'.repeat(4001),
      }).success,
    ).toBe(false);
    expect(
      createInternationalApplicationSchema.safeParse({ opportunityId: valid.opportunityId })
        .success,
    ).toBe(false); // passportReadiness is required
    expect(
      createInternationalApplicationSchema.safeParse({ ...valid, opportunityId: 'nope' }).success,
    ).toBe(false);
  });

  it('accepts the extended experience payload (role + opportunityId)', () => {
    const base = {
      organizationName: 'Red Crescent',
      program: 'WorkCamp',
      startDate: '2025-06-01',
      role: 'Team lead',
      opportunityId: '3f1d2a4c-6b7e-4f8a-9c0d-1e2f3a4b5c6d',
    };
    const parsed = createInternationalExperienceSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.role).toBe('Team lead');
    expect(parsed.success && parsed.data.verified).toBe(false); // always self-declared
    expect(
      createInternationalExperienceSchema.safeParse({ ...base, role: 'x'.repeat(121) }).success,
    ).toBe(false);
    expect(
      createInternationalExperienceSchema.safeParse({ ...base, opportunityId: 'nope' }).success,
    ).toBe(false);
  });

  it('accepts a passport patch and enforces the dateOfBirth window', () => {
    const valid = {
      passportReadiness: 'IN_PROGRESS',
      travelReady: true,
      emergencyContactReady: false,
      preferredCategories: ['VOLUNTEERING', 'YOUTH_EXCHANGE'],
      preferredCountryIds: ['3f1d2a4c-6b7e-4f8a-9c0d-1e2f3a4b5c6d'],
      dateOfBirth: '2000-01-01',
    };
    expect(updateInternationalPassportSchema.safeParse(valid).success).toBe(true);
    expect(updateInternationalPassportSchema.safeParse({}).success).toBe(true); // all optional

    expect(updateInternationalPassportSchema.safeParse({ dateOfBirth: '01-01-2000' }).success).toBe(
      false,
    ); // not YYYY-MM-DD
    expect(updateInternationalPassportSchema.safeParse({ dateOfBirth: '2010-13-40' }).success).toBe(
      false,
    ); // not a real calendar date
    expect(updateInternationalPassportSchema.safeParse({ dateOfBirth: '2999-01-01' }).success).toBe(
      false,
    ); // must be in the past
    expect(updateInternationalPassportSchema.safeParse({ dateOfBirth: '2024-01-01' }).success).toBe(
      false,
    ); // younger than 10
    expect(
      updateInternationalPassportSchema.safeParse({
        preferredCategories: ['VOLUNTEERING', 'VOLUNTEERING'],
      }).success,
    ).toBe(true); // dedup happens server-side
    expect(
      updateInternationalPassportSchema.safeParse({ preferredCategories: ['Nonsense'] }).success,
    ).toBe(false);
  });

  it('validates the moderation bodies', () => {
    expect(
      updateInternationalApplicationStatusSchema.safeParse({ status: 'SHORTLISTED' }).success,
    ).toBe(true);
    expect(
      updateInternationalApplicationStatusSchema.safeParse({ status: 'ARCHIVED' }).success,
    ).toBe(false);
    expect(
      adminInternationalApplicationsQuerySchema.safeParse({ status: 'ACCEPTED' }).success,
    ).toBe(true);
    expect(
      adminInternationalApplicationsQuerySchema.safeParse({ status: 'ARCHIVED' }).success,
    ).toBe(false);
    expect(verifyInternationalExperienceSchema.safeParse({ verified: true }).success).toBe(true);
    expect(
      verifyInternationalExperienceSchema.safeParse({
        verified: false,
        notes: 'x'.repeat(1001),
      }).success,
    ).toBe(false);
    expect(verifyInternationalExperienceSchema.safeParse({ verified: 'yes' }).success).toBe(false);
  });
});

// ── Route table ─────────────────────────────────────────────────

describe('internationalRoutes', () => {
  const expected: Array<{ method: string; path: string; auth: string }> = [
    // pre-existing surface (must stay registered untouched)
    { method: 'GET', path: '/international/opportunities', auth: 'public' },
    { method: 'GET', path: '/international/opportunities/:id', auth: 'public' },
    { method: 'GET', path: '/international/experiences', auth: 'authenticated' },
    { method: 'POST', path: '/international/experiences', auth: 'authenticated' },
    { method: 'GET', path: '/admin/international/opportunities', auth: 'admin' },
    { method: 'POST', path: '/admin/international/opportunities', auth: 'admin' },
    { method: 'GET', path: '/admin/international/opportunities/:id', auth: 'admin' },
    { method: 'PATCH', path: '/admin/international/opportunities/:id', auth: 'admin' },
    // BLADNA International additions
    { method: 'GET', path: '/international/countries', auth: 'public' },
    { method: 'GET', path: '/international/countries/:code', auth: 'public' },
    { method: 'GET', path: '/international/providers', auth: 'public' },
    { method: 'GET', path: '/international/opportunities/:id/eligibility', auth: 'authenticated' },
    { method: 'GET', path: '/international/recommendations', auth: 'authenticated' },
    { method: 'GET', path: '/international/applications', auth: 'authenticated' },
    { method: 'POST', path: '/international/applications', auth: 'authenticated' },
    { method: 'GET', path: '/international/applications/:id', auth: 'authenticated' },
    { method: 'POST', path: '/international/applications/:id/withdraw', auth: 'authenticated' },
    { method: 'GET', path: '/international/passport', auth: 'authenticated' },
    { method: 'PATCH', path: '/international/passport', auth: 'authenticated' },
    { method: 'POST', path: '/admin/international/opportunities/:id/verification', auth: 'admin' },
    { method: 'GET', path: '/admin/international/opportunities/:id/events', auth: 'admin' },
    { method: 'GET', path: '/admin/international/applications', auth: 'admin' },
    { method: 'PATCH', path: '/admin/international/applications/:id', auth: 'admin' },
    { method: 'GET', path: '/admin/international/experiences', auth: 'admin' },
    { method: 'POST', path: '/admin/international/experiences/:id/verify', auth: 'admin' },
  ];

  it('registers exactly the expected surface with no duplicates', () => {
    expect(internationalRoutes).toHaveLength(expected.length);
    const keys = internationalRoutes.map((route) => `${route.method} ${route.path}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const route of expected) {
      const match = internationalRoutes.find(
        (candidate) => candidate.method === route.method && candidate.path === route.path,
      );
      expect(match, `missing ${route.method} ${route.path}`).toBeDefined();
      expect(match?.auth).toBe(route.auth);
      expect(typeof match?.summary).toBe('string');
      expect(match?.summary?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('keeps the paths the SSR pages look up by requireHandler', () => {
    for (const path of [
      '/international/applications',
      '/international/passport',
      '/international/countries',
      '/international/experiences',
      '/international/opportunities/:id',
    ]) {
      expect(internationalRoutes.some((route) => route.path === path)).toBe(true);
    }
  });
});

// ── Feature flags ───────────────────────────────────────────────

describe('DEFAULT_FLAGS international keys', () => {
  it('ships the six BLADNA International flags with the product defaults', () => {
    expect(DEFAULT_FLAGS).toMatchObject({
      INTERNATIONAL_ENABLED: true,
      INTERNATIONAL_APPLICATIONS: true,
      INTERNATIONAL_PASSPORT: true,
      INTERNATIONAL_SAFETY: true,
      INTERNATIONAL_MATCHING: true,
      INTERNATIONAL_INGESTION: false,
      INTERNATIONAL_PARTNERS: false,
    });
  });
});
