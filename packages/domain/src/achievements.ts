// Factual achievement thresholds (spec §30).
// No composite "human value" score — the platform shows factual experience.

export const ACHIEVEMENT_CODES = [
  'FIRST_ACTIVITY',
  'TEN_HOURS',
  'TWENTY_FIVE_HOURS',
  'FIFTY_HOURS',
  'ONE_HUNDRED_HOURS',
  'TWO_HUNDRED_FIFTY_HOURS',
  'INTERNATIONAL_VOLUNTEER',
  'SKILL_VERIFIED',
  'CERTIFICATE_COLLECTION',
] as const;

export type AchievementCode = (typeof ACHIEVEMENT_CODES)[number];

export interface AchievementInputs {
  /** Hours with status VERIFIED. */
  verifiedHours: number;
  completedActivities: number;
  internationalExperiences: number;
  organizationVerifiedSkills: number;
  validCertificates: number;
}

export function evaluateAchievements(inputs: AchievementInputs): AchievementCode[] {
  const unlocked: AchievementCode[] = [];

  if (inputs.completedActivities >= 1) unlocked.push('FIRST_ACTIVITY');
  if (inputs.verifiedHours >= 10) unlocked.push('TEN_HOURS');
  if (inputs.verifiedHours >= 25) unlocked.push('TWENTY_FIVE_HOURS');
  if (inputs.verifiedHours >= 50) unlocked.push('FIFTY_HOURS');
  if (inputs.verifiedHours >= 100) unlocked.push('ONE_HUNDRED_HOURS');
  if (inputs.verifiedHours >= 250) unlocked.push('TWO_HUNDRED_FIFTY_HOURS');
  if (inputs.internationalExperiences >= 1) unlocked.push('INTERNATIONAL_VOLUNTEER');
  if (inputs.organizationVerifiedSkills >= 1) unlocked.push('SKILL_VERIFIED');
  if (inputs.validCertificates >= 5) unlocked.push('CERTIFICATE_COLLECTION');

  return unlocked;
}
