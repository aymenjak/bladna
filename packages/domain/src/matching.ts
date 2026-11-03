// Recommendation engine v1 (spec §71, §117).
// Deterministic rule-based matching first — no model calls, no sensitive or
// discriminatory reasoning: age is used only for eligibility, never for score.

import type { AvailabilitySlot, LocationType, OpportunityType } from '@bladna/types';

export interface VolunteerSignals {
  wilayaId: string | null;
  cityId: string | null;
  skillIds: string[];
  interestCodes: string[];
  languageIds: string[];
  availability: AvailabilitySlot[];
  onlinePreference: boolean;
  internationalPreference: boolean;
  verifiedHours: number;
}

export interface OpportunitySignals {
  wilayaId: string | null;
  cityId: string | null;
  countryId: string | null;
  categoryId: string | null;
  categoryInterestCodes: string[];
  requiredSkillIds: string[];
  optionalSkillIds: string[];
  requiredLanguageIds: string[];
  locationType: LocationType;
  type: OpportunityType;
  preferredAvailability: AvailabilitySlot[];
}

export type MatchReasonCode =
  | 'SKILL_MATCH'
  | 'INTEREST_MATCH'
  | 'LOCATION_MATCH'
  | 'LANGUAGE_MATCH'
  | 'AVAILABILITY_MATCH'
  | 'ONLINE_PREFERENCE'
  | 'INTERNATIONAL_PREFERENCE'
  | 'EXPERIENCED_VOLUNTEER';

export interface MatchReason {
  code: MatchReasonCode;
  weight: number;
  /** Non-sensitive supporting facts (ids/counts only — UI localizes). */
  detail: Record<string, string | number | boolean>;
}

export interface MatchResult {
  /** 0–100 */
  score: number;
  reasons: MatchReason[];
}

const MAX = {
  skill: 35,
  interest: 20,
  location: 15,
  language: 10,
  availability: 10,
  preference: 10,
  experienced: 5,
} as const;

function intersect(a: readonly string[], b: readonly string[]): string[] {
  const set = new Set(b);
  return a.filter((value) => set.has(value));
}

export function matchOpportunity(
  volunteer: VolunteerSignals,
  opportunity: OpportunitySignals,
): MatchResult {
  const reasons: MatchReason[] = [];
  let score = 0;

  // 1. Skills — required skills weigh more than optional ones.
  const requiredMatches = intersect(volunteer.skillIds, opportunity.requiredSkillIds);
  const optionalMatches = intersect(volunteer.skillIds, opportunity.optionalSkillIds);
  const requiredTotal = opportunity.requiredSkillIds.length;
  const skillPoints =
    (requiredTotal > 0 ? (requiredMatches.length / requiredTotal) * (MAX.skill - 5) : 0) +
    Math.min(optionalMatches.length * 3, 5);
  if (skillPoints > 0) {
    const weight = Math.round(Math.min(skillPoints, MAX.skill));
    score += weight;
    reasons.push({
      code: 'SKILL_MATCH',
      weight,
      detail: { matched: requiredMatches.length + optionalMatches.length },
    });
  }

  // 2. Interests — profile interests vs category interest codes.
  const interestMatches = intersect(volunteer.interestCodes, opportunity.categoryInterestCodes);
  if (interestMatches.length > 0) {
    const weight = Math.min(interestMatches.length * 10, MAX.interest);
    score += weight;
    reasons.push({ code: 'INTEREST_MATCH', weight, detail: { matched: interestMatches.length } });
  }

  // 3. Location — same city > same wilaya > online/remote.
  let locationWeight = 0;
  if (opportunity.locationType === 'ONLINE') {
    locationWeight = volunteer.onlinePreference ? MAX.location : Math.round(MAX.location / 2);
  } else if (volunteer.cityId && volunteer.cityId === opportunity.cityId) {
    locationWeight = MAX.location;
  } else if (volunteer.wilayaId && volunteer.wilayaId === opportunity.wilayaId) {
    locationWeight = MAX.location - 4;
  }
  if (locationWeight > 0) {
    score += locationWeight;
    reasons.push({ code: 'LOCATION_MATCH', weight: locationWeight, detail: {} });
  }

  // 4. Languages.
  const languageMatches = intersect(volunteer.languageIds, opportunity.requiredLanguageIds);
  if (opportunity.requiredLanguageIds.length === 0 || languageMatches.length > 0) {
    const weight =
      opportunity.requiredLanguageIds.length === 0
        ? 0
        : Math.min(languageMatches.length * MAX.language, MAX.language);
    if (weight > 0) {
      score += weight;
      reasons.push({ code: 'LANGUAGE_MATCH', weight, detail: { matched: languageMatches.length } });
    }
  }

  // 5. Availability overlap.
  const availabilityMatches = intersect(volunteer.availability, opportunity.preferredAvailability);
  if (availabilityMatches.length > 0 || opportunity.preferredAvailability.length === 0) {
    const weight =
      opportunity.preferredAvailability.length === 0
        ? MAX.availability
        : Math.min(availabilityMatches.length * Math.ceil(MAX.availability / 2), MAX.availability);
    score += weight;
    reasons.push({
      code: 'AVAILABILITY_MATCH',
      weight,
      detail: { matched: availabilityMatches.length },
    });
  }

  // 6. Preferences (online / international).
  if (opportunity.locationType === 'ONLINE' && volunteer.onlinePreference) {
    score += Math.round(MAX.preference / 2);
    reasons.push({
      code: 'ONLINE_PREFERENCE',
      weight: Math.round(MAX.preference / 2),
      detail: {},
    });
  }
  if (opportunity.type === 'INTERNATIONAL' && volunteer.internationalPreference) {
    const weight = volunteer.onlinePreference ? Math.round(MAX.preference / 2) : MAX.preference;
    score += weight;
    reasons.push({ code: 'INTERNATIONAL_PREFERENCE', weight, detail: {} });
  }

  // 7. Small nudge for experienced volunteers completing a new opportunity type.
  if (volunteer.verifiedHours >= 20) {
    score += MAX.experienced;
    reasons.push({ code: 'EXPERIENCED_VOLUNTEER', weight: MAX.experienced, detail: {} });
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}
