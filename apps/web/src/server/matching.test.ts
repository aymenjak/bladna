import { describe, expect, it } from 'vitest';
import type { MatchReasonCode } from '@bladna/domain';
import type { AvailabilitySlot, LocationType, OpportunityType } from '@bladna/types';
import { getDictionary, LOCALES } from '../ui/i18n';
import {
  CATEGORY_INTEREST_CODES,
  MATCH_NOTIFY_MIN_SCORE,
  MATCH_STRIP_MIN_SCORE,
  buildOpportunitySignals,
  buildVolunteerSignals,
  rankOpportunities,
  recommendationRoutes,
  type OpportunitySignalRow,
  type VolunteerSignalRow,
} from './modules/matching';
import { savedRoutes } from './modules/saved';

/**
 * DB-free tests for the P5 matching wiring: the signal builders translate
 * Prisma rows into exactly what `@bladna/domain`'s `matchOpportunity`
 * consumes, ranking is deterministic (score desc, stable on ties), the strip
 * floor keeps empty profiles from masquerading as matches, every engine
 * reason code ships a localized label in all three locales, and both route
 * tables register the expected authenticated endpoints. Handlers themselves
 * only wire these decisions to Prisma — no database needed.
 */

const volunteerRow = (overrides: Partial<VolunteerSignalRow> = {}): VolunteerSignalRow => ({
  wilayaId: 'wil-16',
  cityId: 'city-1',
  availability: [] as AvailabilitySlot[],
  onlinePreference: false,
  internationalPreference: false,
  skills: [],
  interests: [],
  languages: [],
  verifiedHours: 0,
  ...overrides,
});

/** Engine input built the same way the handler builds it. */
const signals = (overrides: Partial<VolunteerSignalRow> = {}) =>
  buildVolunteerSignals(volunteerRow(overrides));

const oppRow = (overrides: Partial<OpportunitySignalRow> = {}): OpportunitySignalRow => ({
  id: 'opp-1',
  wilayaId: 'wil-16',
  cityId: 'city-1',
  countryId: 'DZ',
  categoryId: 'cat-1',
  category: { slug: 'environment' },
  locationType: 'PHYSICAL' as LocationType,
  type: 'EVENT' as OpportunityType,
  skills: [],
  languages: [],
  ...overrides,
});

describe('buildVolunteerSignals', () => {
  it('flattens profile relations into the engine input', () => {
    const signals = buildVolunteerSignals(
      volunteerRow({
        skills: [{ skillId: 's-1' }, { skillId: 's-2' }],
        interests: [{ interest: { code: 'environment' } }],
        languages: [{ languageId: 'l-ar' }],
        availability: ['WEEKENDS'],
        onlinePreference: true,
        internationalPreference: true,
        verifiedHours: 42,
      }),
    );
    expect(signals).toEqual({
      wilayaId: 'wil-16',
      cityId: 'city-1',
      skillIds: ['s-1', 's-2'],
      interestCodes: ['environment'],
      languageIds: ['l-ar'],
      availability: ['WEEKENDS'],
      onlinePreference: true,
      internationalPreference: true,
      verifiedHours: 42,
    });
  });

  it('keeps an empty profile as honest zeros (no invented signals)', () => {
    const signals = buildVolunteerSignals(volunteerRow());
    expect(signals.skillIds).toEqual([]);
    expect(signals.interestCodes).toEqual([]);
    expect(signals.languageIds).toEqual([]);
    expect(signals.verifiedHours).toBe(0);
  });
});

describe('buildOpportunitySignals', () => {
  it('splits required from optional skills', () => {
    const signals = buildOpportunitySignals(
      oppRow({
        skills: [
          { required: true, skill: { id: 's-req' } },
          { required: false, skill: { id: 's-opt' } },
          { required: true, skill: { id: 's-req-2' } },
        ],
      }),
    );
    expect(signals.requiredSkillIds).toEqual(['s-req', 's-req-2']);
    expect(signals.optionalSkillIds).toEqual(['s-opt']);
  });

  it('maps category slugs to the five Interest codes — unknown slugs stay empty', () => {
    expect(
      buildOpportunitySignals(oppRow({ category: { slug: 'environment' } })).categoryInterestCodes,
    ).toEqual(['environment']);
    expect(
      buildOpportunitySignals(oppRow({ category: { slug: 'education' } })).categoryInterestCodes,
    ).toEqual(['education']);
    // Seed categories without an equivalent interest contribute nothing.
    expect(CATEGORY_INTEREST_CODES.humanitarian).toEqual([]);
    expect(
      buildOpportunitySignals(oppRow({ category: { slug: 'humanitarian' } })).categoryInterestCodes,
    ).toEqual([]);
    expect(
      buildOpportunitySignals(oppRow({ category: { slug: 'made-up' } })).categoryInterestCodes,
    ).toEqual([]);
    expect(buildOpportunitySignals(oppRow({ category: null })).categoryInterestCodes).toEqual([]);
  });

  it('counts every declared language as a match target', () => {
    const signals = buildOpportunitySignals(
      oppRow({ languages: [{ languageId: 'l-ar' }, { languageId: 'l-fr' }] }),
    );
    expect(signals.requiredLanguageIds).toEqual(['l-ar', 'l-fr']);
  });

  it('keeps preferredAvailability empty — the documented uniform baseline', () => {
    expect(buildOpportunitySignals(oppRow()).preferredAvailability).toEqual([]);
  });
});

describe('rankOpportunities', () => {
  it('orders by score descending', () => {
    const strong = oppRow({
      id: 'strong',
      skills: [
        { required: true, skill: { id: 's-1' } },
        { required: true, skill: { id: 's-2' } },
      ],
    });
    const weak = oppRow({ id: 'weak', wilayaId: 'wil-99', cityId: 'city-99' });
    const volunteer = signals({ skills: [{ skillId: 's-1' }, { skillId: 's-2' }] });
    const ranked = rankOpportunities(volunteer, [weak, strong]);
    expect(ranked.map((row) => row.opportunity.id)).toEqual(['strong', 'weak']);
    expect(ranked[0].match.score).toBeGreaterThan(ranked[1].match.score);
  });

  it('keeps input (recency) order on score ties — stable sort', () => {
    const volunteer = signals();
    const rows = [oppRow({ id: 'first' }), oppRow({ id: 'second' }), oppRow({ id: 'third' })];
    expect(rankOpportunities(volunteer, rows).map((row) => row.opportunity.id)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });

  it('clears the strip floor for a real skills + interest + location match', () => {
    const volunteer = signals({
      skills: [{ skillId: 's-1' }],
      interests: [{ interest: { code: 'environment' } }],
    });
    const opportunity = oppRow({ skills: [{ required: true, skill: { id: 's-1' } }] });
    const [top] = rankOpportunities(volunteer, [opportunity]);
    expect(top.match.score).toBeGreaterThanOrEqual(MATCH_STRIP_MIN_SCORE);
    const codes = top.match.reasons.map((reason) => reason.code);
    expect(codes).toContain('SKILL_MATCH');
    expect(codes).toContain('INTEREST_MATCH');
    expect(codes).toContain('LOCATION_MATCH');
    expect(codes).toContain('AVAILABILITY_MATCH');
    // Every stated reason is a fact: weights sum to the displayed score
    // (below the 100 clamp the engine never rounds the total).
    const sum = top.match.reasons.reduce((total, reason) => total + reason.weight, 0);
    expect(sum).toBe(top.match.score);
  });

  it('keeps an empty profile below the strip floor (no noise matches)', () => {
    const volunteer = signals({ wilayaId: null, cityId: null });
    const rows = [
      oppRow({ id: 'online', locationType: 'ONLINE' as LocationType }),
      oppRow({ id: 'local', wilayaId: 'wil-99', cityId: 'city-99' }),
    ];
    for (const ranked of rankOpportunities(volunteer, rows)) {
      expect(ranked.match.score).toBeLessThan(MATCH_STRIP_MIN_SCORE);
    }
  });

  it('raises the experienced-volunteer reason only at 20+ verified hours', () => {
    const opportunity = oppRow();
    const [novice] = rankOpportunities(signals({ verifiedHours: 19 }), [opportunity]);
    const [vet] = rankOpportunities(signals({ verifiedHours: 20 }), [opportunity]);
    const codes = novice.match.reasons.map((reason) => reason.code);
    const vetCodes = vet.match.reasons.map((reason) => reason.code);
    expect(codes).not.toContain('EXPERIENCED_VOLUNTEER');
    expect(vetCodes).toContain('EXPERIENCED_VOLUNTEER');
    expect(vet.match.score - novice.match.score).toBe(5);
  });
});

describe('thresholds and route tables', () => {
  it('requires a strictly stronger match to notify than to show in the strip', () => {
    expect(MATCH_NOTIFY_MIN_SCORE).toBeGreaterThan(MATCH_STRIP_MIN_SCORE);
  });

  it('registers GET /me/recommendations as an authenticated route', () => {
    expect(recommendationRoutes).toHaveLength(1);
    const route = recommendationRoutes[0];
    expect(route.method).toBe('GET');
    expect(route.path).toBe('/me/recommendations');
    expect(route.auth).toBe('authenticated');
  });

  it('registers the saved-opportunities trio (list + idempotent save/remove)', () => {
    expect(savedRoutes).toHaveLength(3);
    const byKey = savedRoutes.map((route) => `${route.method} ${route.path}`);
    expect(byKey).toEqual([
      'GET /me/saved-opportunities',
      'POST /me/saved-opportunities/:id',
      'DELETE /me/saved-opportunities/:id',
    ]);
    for (const route of savedRoutes) expect(route.auth).toBe('authenticated');
  });
});

describe('reason labels', () => {
  const CODES: MatchReasonCode[] = [
    'SKILL_MATCH',
    'INTEREST_MATCH',
    'LOCATION_MATCH',
    'LANGUAGE_MATCH',
    'AVAILABILITY_MATCH',
    'ONLINE_PREFERENCE',
    'INTERNATIONAL_PREFERENCE',
    'EXPERIENCED_VOLUNTEER',
  ];

  it('ships a localized label for every engine reason code in all locales', () => {
    for (const locale of LOCALES) {
      const { dict } = getDictionary(locale);
      for (const code of CODES) {
        expect(dict.matching.reasons[code], `${locale} missing ${code}`).toBeTruthy();
      }
    }
  });
});
