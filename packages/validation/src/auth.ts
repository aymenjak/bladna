import { z } from 'zod';
import {
  emailSchema,
  localeSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  registrationConsentsSchema,
  uuidSchema,
} from './common';

/** Age of majority in Algeria (Civil Code art. 40): younger users need a guardian (Law 18-07). */
export const AGE_OF_MAJORITY = 19;
/** Platform policy: no accounts below this age, even with a guardian. */
export const MIN_REGISTRATION_AGE = 13;

/** Whole years between `dateOfBirth` and `reference` (birthday not yet reached → one less). */
export function ageOn(dateOfBirth: Date, reference: Date = new Date()): number {
  let age = reference.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const monthDiff = reference.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export const guardianSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    relationship: z.enum(['PARENT', 'LEGAL_GUARDIAN']),
    email: emailSchema.optional(),
    phone: phoneSchema.optional(),
  })
  .refine((guardian) => Boolean(guardian.email || guardian.phone), {
    message: 'GUARDIAN_CONTACT_REQUIRED',
    path: ['email'],
  });

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    phone: phoneSchema.optional(),
    preferredLanguage: localeSchema.default('ar'),
    /** required so the age rules below cannot be skipped */
    dateOfBirth: z.coerce.date(),
    /** required (with the `guardian_consent` purpose) when the user is under AGE_OF_MAJORITY */
    guardian: guardianSchema.optional(),
    /** consent purposes accepted at registration (§54) */
    consents: registrationConsentsSchema,
    /** optional role hint: volunteer (default) or organization representative */
    accountType: z.enum(['VOLUNTEER', 'ORGANIZATION']).default('VOLUNTEER'),
  })
  .superRefine((input, ctx) => {
    const age = ageOn(input.dateOfBirth);
    if (Number.isNaN(age) || input.dateOfBirth.getTime() > Date.now() || age > 120) {
      ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'DATE_OF_BIRTH_INVALID' });
      return;
    }
    if (age < MIN_REGISTRATION_AGE) {
      ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: 'BELOW_MINIMUM_AGE' });
      return;
    }
    if (age >= AGE_OF_MAJORITY) return;
    if (!input.guardian) {
      ctx.addIssue({ code: 'custom', path: ['guardian'], message: 'GUARDIAN_REQUIRED' });
    }
    if (!input.consents.includes('guardian_consent')) {
      ctx.addIssue({ code: 'custom', path: ['consents'], message: 'GUARDIAN_CONSENT_REQUIRED' });
    }
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
  /** present when the account has TOTP enabled */
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
});

export const verifyEmailSchema = z.object({ token: z.string().min(10).max(200) });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
  /** revoke other sessions after password change (default true) */
  logoutEverywhere: z.boolean().default(true),
});

export const refreshTokenSchema = z.object({
  /** only accepted from cookie-based flows; body variant used by mobile */
  refreshToken: z.string().min(20).max(200).optional(),
});

export const enableTwoFactorSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

/** MFA challenge/step-up code: a 6-digit TOTP or a BLD-XXXX-XXXX recovery code. */
export const mfaVerifySchema = z.object({
  code: z.string().trim().min(4).max(30),
});

export const updateProfileSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: phoneSchema.optional(),
  dateOfBirth: z.coerce.date().optional(),
  preferredLanguage: localeSchema.optional(),
});

export const updateVolunteerProfileSchema = z.object({
  bio: z.string().trim().max(3000).optional(),
  wilayaId: uuidSchema.nullable().optional(),
  cityId: uuidSchema.nullable().optional(),
  availability: z
    .array(z.enum(['WEEKDAYS', 'WEEKENDS', 'EVENINGS', 'NIGHTS', 'HOLIDAYS', 'FLEXIBLE']))
    .max(6)
    .optional(),
  onlinePreference: z.boolean().optional(),
  internationalPreference: z.boolean().optional(),
  publicProfile: z.boolean().optional(),
  publicPhone: z.boolean().optional(),
  publicEmail: z.boolean().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
});

export const manageSkillsSchema = z.object({
  add: z
    .array(
      z.object({
        skillId: uuidSchema,
        yearsExperience: z.number().int().min(0).max(60).optional(),
      }),
    )
    .max(50)
    .default([]),
  remove: z.array(uuidSchema).max(50).default([]),
});

export const manageLanguagesSchema = z.object({
  add: z
    .array(
      z.object({
        languageId: uuidSchema,
        level: z.enum([
          'BEGINNER',
          'ELEMENTARY',
          'INTERMEDIATE',
          'UPPER_INTERMEDIATE',
          'ADVANCED',
          'NATIVE',
        ]),
      }),
    )
    .max(20)
    .default([]),
  remove: z.array(uuidSchema).max(20).default([]),
});

export const manageInterestsSchema = z.object({
  add: z.array(uuidSchema).max(30).default([]),
  remove: z.array(uuidSchema).max(30).default([]),
});

export const notificationPreferenceSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: z.string().min(1).max(64),
        channel: z.enum(['IN_APP', 'EMAIL', 'PUSH', 'SMS']),
        enabled: z.boolean(),
      }),
    )
    .max(200),
});

export const privacySettingsSchema = z.object({
  publicProfile: z.boolean().optional(),
  publicPhone: z.boolean().optional(),
  publicEmail: z.boolean().optional(),
  showWilaya: z.boolean().optional(),
  showHours: z.boolean().optional(),
  showCertificates: z.boolean().optional(),
});

export const dataRequestSchema = z.object({
  type: z.enum(['EXPORT', 'DEACTIVATE', 'DELETE']),
  reason: z.string().trim().max(1000).optional(),
});
