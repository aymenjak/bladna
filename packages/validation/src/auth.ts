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

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
  preferredLanguage: localeSchema.default('ar'),
  /** consent purposes accepted at registration (§54) */
  consents: registrationConsentsSchema,
  /** optional role hint: volunteer (default) or organization representative */
  accountType: z.enum(['VOLUNTEER', 'ORGANIZATION']).default('VOLUNTEER'),
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
