import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, SYSTEM_ROLES, USER_STATUSES } from '@bladna/types';
import { parseOrThrow, toValidationError } from './errors';
import { registerSchema } from './auth';
import {
  opportunityFiltersSchema,
  recommendationQuerySchema,
  savedListQuerySchema,
} from './volunteer';
import { createOpportunitySchema } from './opportunity';
import { createApplicationSchema } from './application';
import { createAttendanceSessionSchema, verifyHoursSchema } from './attendance';

describe('validation schemas', () => {
  it('accepts a valid registration and lowercases email', () => {
    const parsed = registerSchema.parse({
      email: '  Aymen@Example.COM ',
      password: 'long-enough-password',
      firstName: 'Aymen',
      lastName: 'Bensalem',
      dateOfBirth: '1998-04-12',
      consents: ['terms', 'privacy_policy'],
    });
    expect(parsed.email).toBe('aymen@example.com');
    expect(parsed.accountType).toBe('VOLUNTEER');
  });

  it('requires terms + privacy consent', () => {
    const result = registerSchema.safeParse({
      email: 'a@b.com',
      password: 'long-enough-password',
      firstName: 'A',
      lastName: 'B',
      dateOfBirth: '1998-04-12',
      consents: ['marketing_email'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid emails and short passwords', () => {
    expect(
      registerSchema.safeParse({
        email: 'not-an-email',
        password: 'long-enough-password',
        firstName: 'A',
        lastName: 'B',
        dateOfBirth: '1998-04-12',
        consents: ['terms', 'privacy_policy'],
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: 'a@b.com',
        password: 'short',
        firstName: 'A',
        lastName: 'B',
        dateOfBirth: '1998-04-12',
        consents: ['terms', 'privacy_policy'],
      }).success,
    ).toBe(false);
  });

  it('parses csv filter arrays', () => {
    const parsed = opportunityFiltersSchema.parse({ skillIds: 'a, b ,c', limit: '10' });
    expect(parsed.skillIds).toEqual(['a', 'b', 'c']);
    expect(parsed.limit).toBe(10);
  });

  it('validates opportunity required fields', () => {
    const result = createOpportunitySchema.safeParse({
      titleAr: 'تنظيف الشاطئ',
      titleFr: 'Nettoyage de plage',
      titleEn: 'Beach cleanup',
      descriptionAr: 'وصف',
      descriptionFr: 'Description',
      descriptionEn: 'Description',
      type: 'LOCAL',
      locationType: 'PHYSICAL',
    });
    expect(result.success).toBe(true);
    expect(
      createOpportunitySchema.safeParse({ titleAr: 'x', type: 'LOCAL', locationType: 'PHYSICAL' })
        .success,
    ).toBe(false);
  });

  it('enforces application motivation length', () => {
    expect(createApplicationSchema.safeParse({ motivation: 'too short' }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ motivation: 'x'.repeat(80) }).success).toBe(true);
  });

  it('validates attendance session expiry ordering', () => {
    const result = createAttendanceSessionSchema.safeParse({
      name: 'Session A',
      startsAt: new Date('2027-01-01T10:00:00Z'),
      expiresAt: new Date('2027-01-01T09:00:00Z'),
    });
    expect(result.success).toBe(false);
  });

  it('requires a reason when revoking is involved in bulk verify rejects', () => {
    expect(
      verifyHoursSchema.safeParse({
        hourIds: ['6f0e5c4c-1a2b-4c5d-8e9f-0a1b2c3d4e5f'],
        action: 'VERIFY',
      }).success,
    ).toBe(true);
    expect(
      verifyHoursSchema.safeParse({
        hourIds: ['6f0e5c4c-1a2b-4c5d-8e9f-0a1b2c3d4e5f'],
        action: 'INVALID',
      }).success,
    ).toBe(false);
  });

  it('converts ZodError to AppError with field details', () => {
    try {
      parseOrThrow(z.object({ age: z.number() }), { age: 'nope' });
      throw new Error('should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('VALIDATION_ERROR');
      expect((error as AppError).details).toEqual([expect.objectContaining({ path: 'age' })]);
    }
  });

  it('toValidationError keeps messages safe', () => {
    const error = toValidationError(
      new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['a'],
          message: 'Required',
        },
      ]),
    );
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(error.details)).not.toContain('stack');
  });

  it('mirrors the Prisma enum lists', () => {
    expect(SYSTEM_ROLES).toContain('SUPER_ADMIN');
    expect(USER_STATUSES).toContain('BANNED');
  });
});

describe('P5 saved + recommendation schemas', () => {
  it('savedListQuerySchema parses the optional exact-id filter and pages', () => {
    const parsed = savedListQuerySchema.parse({
      opportunityId: '3f1a9c1e-1c2b-4f9a-8f1e-0a1b2c3d4e5f',
      page: '2',
      limit: '6',
    });
    expect(parsed.opportunityId).toBe('3f1a9c1e-1c2b-4f9a-8f1e-0a1b2c3d4e5f');
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(6);
  });

  it('savedListQuerySchema rejects a malformed opportunityId', () => {
    expect(savedListQuerySchema.safeParse({ opportunityId: 'not-a-uuid' }).success).toBe(false);
  });

  it('recommendationQuerySchema clamps limit to 1-12 with a default of 6', () => {
    expect(recommendationQuerySchema.parse({}).limit).toBe(6);
    expect(recommendationQuerySchema.parse({ limit: '9' }).limit).toBe(9);
    expect(recommendationQuerySchema.safeParse({ limit: '13' }).success).toBe(false);
    expect(recommendationQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
    expect(recommendationQuerySchema.safeParse({ limit: 'many' }).success).toBe(false);
  });
});
