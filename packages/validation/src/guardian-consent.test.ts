import { describe, expect, it } from 'vitest';
import { AGE_OF_MAJORITY, MIN_REGISTRATION_AGE, ageOn, registerSchema } from './auth';

// Law 18-07: a minor's personal data needs the legal representative's consent;
// the age of majority in Algeria is 19 (Civil Code art. 40).

/** yyyy-mm-dd for someone who turned `years` old `daysAgo` days ago. */
function birthDateFor(years: number, daysAgo = 10): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

const base = {
  email: 'young@example.com',
  password: 'long-enough-password',
  firstName: 'Lina',
  lastName: 'Haddad',
};
const guardian = { fullName: 'Karim Haddad', relationship: 'PARENT', phone: '+213 555 12 34 56' };

function messages(input: unknown): string[] {
  const result = registerSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe('ageOn', () => {
  it('counts a birthday not yet reached this year as one year less', () => {
    expect(ageOn(new Date('2008-06-15T00:00:00Z'), new Date('2027-06-14T00:00:00Z'))).toBe(18);
    expect(ageOn(new Date('2008-06-15T00:00:00Z'), new Date('2027-06-15T00:00:00Z'))).toBe(19);
  });
});

describe('registerSchema — age and guardian consent', () => {
  it('requires a date of birth', () => {
    expect(
      registerSchema.safeParse({ ...base, consents: ['terms', 'privacy_policy'] }).success,
    ).toBe(false);
  });

  it('accepts an adult without a guardian', () => {
    const parsed = registerSchema.parse({
      ...base,
      dateOfBirth: birthDateFor(AGE_OF_MAJORITY),
      consents: ['terms', 'privacy_policy'],
    });
    expect(parsed.guardian).toBeUndefined();
  });

  it('refuses a minor without guardian details or guardian consent', () => {
    expect(
      messages({ ...base, dateOfBirth: birthDateFor(16), consents: ['terms', 'privacy_policy'] }),
    ).toEqual(expect.arrayContaining(['GUARDIAN_REQUIRED', 'GUARDIAN_CONSENT_REQUIRED']));
  });

  it('accepts a minor with a guardian and the guardian_consent purpose', () => {
    const parsed = registerSchema.parse({
      ...base,
      dateOfBirth: birthDateFor(AGE_OF_MAJORITY - 1),
      guardian,
      consents: ['terms', 'privacy_policy', 'guardian_consent'],
    });
    expect(parsed.guardian?.relationship).toBe('PARENT');
  });

  it('requires a way to reach the guardian', () => {
    expect(
      messages({
        ...base,
        dateOfBirth: birthDateFor(15),
        guardian: { fullName: 'Karim Haddad', relationship: 'PARENT' },
        consents: ['terms', 'privacy_policy', 'guardian_consent'],
      }),
    ).toContain('GUARDIAN_CONTACT_REQUIRED');
  });

  it('refuses users under the platform minimum age even with a guardian', () => {
    expect(
      messages({
        ...base,
        dateOfBirth: birthDateFor(MIN_REGISTRATION_AGE - 1),
        guardian,
        consents: ['terms', 'privacy_policy', 'guardian_consent'],
      }),
    ).toContain('BELOW_MINIMUM_AGE');
  });

  it('refuses a birth date in the future', () => {
    const future = new Date(Date.now() + 86_400_000 * 30).toISOString().slice(0, 10);
    expect(
      messages({ ...base, dateOfBirth: future, consents: ['terms', 'privacy_policy'] }),
    ).toContain('DATE_OF_BIRTH_INVALID');
  });
});
