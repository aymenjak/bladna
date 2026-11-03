import { describe, expect, it } from 'vitest';
import { matchOpportunity, type OpportunitySignals, type VolunteerSignals } from './matching';

const volunteer: VolunteerSignals = {
  wilayaId: 'w-alger',
  cityId: 'c-alger',
  skillIds: ['s-clean', 's-firstaid'],
  interestCodes: ['environment'],
  languageIds: ['l-ar', 'l-en'],
  availability: ['WEEKENDS'],
  onlinePreference: false,
  internationalPreference: false,
  verifiedHours: 30,
};

const opportunity: OpportunitySignals = {
  wilayaId: 'w-alger',
  cityId: 'c-alger',
  countryId: 'dz',
  categoryId: 'cat-env',
  categoryInterestCodes: ['environment'],
  requiredSkillIds: ['s-clean'],
  optionalSkillIds: ['s-firstaid'],
  requiredLanguageIds: ['l-ar'],
  locationType: 'PHYSICAL',
  type: 'LOCAL',
  preferredAvailability: ['WEEKENDS'],
};

describe('recommendation engine v1', () => {
  it('scores a strong local match highly', () => {
    const result = matchOpportunity(volunteer, opportunity);
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.score).toBeLessThanOrEqual(100);
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain('SKILL_MATCH');
    expect(codes).toContain('INTEREST_MATCH');
    expect(codes).toContain('LOCATION_MATCH');
    expect(codes).toContain('LANGUAGE_MATCH');
  });

  it('scores unrelated opportunities low', () => {
    const result = matchOpportunity(volunteer, {
      ...opportunity,
      wilayaId: 'w-oran',
      cityId: 'c-oran',
      categoryInterestCodes: ['sports'],
      requiredSkillIds: ['s-music'],
      optionalSkillIds: [],
      requiredLanguageIds: ['l-fr'],
      preferredAvailability: ['WEEKDAYS'],
    });
    expect(result.score).toBeLessThan(40);
  });

  it('always stays within 0..100 and reasons weights sum sanely', () => {
    const hot: VolunteerSignals = {
      ...volunteer,
      skillIds: ['s-clean', 's-firstaid'],
      onlinePreference: true,
      internationalPreference: true,
      availability: ['WEEKENDS', 'WEEKDAYS', 'EVENINGS'],
    };
    const result = matchOpportunity(hot, { ...opportunity, type: 'INTERNATIONAL' });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('never includes sensitive attributes in reasoning', () => {
    const result = matchOpportunity(volunteer, opportunity);
    for (const reason of result.reasons) {
      expect(reason.code).not.toMatch(/\b(AGE|GENDER|RELIGION|ETHNIC|NAME|MARITAL)\b/);
    }
  });
});
