import { z } from 'zod';
import { paginationQuerySchema, uuidSchema } from './common';

export const createAttendanceSessionSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    /** AttendanceSession rows always belong to an opportunity of the tenant. */
    opportunityId: uuidSchema,
    startsAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    /** seconds the QR token stays valid after issue (server caps it) */
    ttlSeconds: z.number().int().min(30).max(86400).default(900),
  })
  .refine((value) => value.expiresAt > value.startsAt, {
    message: 'EXPIRY_BEFORE_START',
    path: ['expiresAt'],
  });

export const checkInByQrSchema = z.object({
  token: z.string().min(10).max(200),
});

export const manualAttendanceSchema = z.object({
  volunteerProfileId: uuidSchema,
  /** Attendance rows always belong to an opportunity of the tenant. */
  opportunityId: uuidSchema,
  date: z.coerce.date(),
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
  hours: z.number().min(0).max(24).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const confirmAttendanceSchema = z.object({
  action: z.enum(['CONFIRM', 'REJECT']),
  reason: z.string().trim().max(1000).optional(),
  /** CONFIRM: verified hours (used when the record has no hours/check-out yet). */
  hours: z.number().gt(0).max(24).optional(),
  /** CONFIRM: check-out timestamp, recorded together with the confirmation. */
  checkOutAt: z.coerce.date().optional(),
});

export const verifyHoursSchema = z.object({
  hourIds: z.array(uuidSchema).min(1).max(100),
  action: z.enum(['VERIFY', 'REJECT']),
  reason: z.string().trim().max(1000).optional(),
});

export const revokeHourSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
  /** when a corrected amount is recorded immediately */
  correction: z
    .object({
      hours: z.number().gt(0).max(168),
      date: z.coerce.date(),
      reason: z.string().trim().min(3).max(1000),
    })
    .optional(),
});

export const createCertificateSchema = z.object({
  activityId: uuidSchema,
  volunteerProfileId: uuidSchema,
  hours: z.number().gt(0).max(168),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  templateId: uuidSchema.optional(),
});

export const revokeCertificateSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const attendanceQuerySchema = paginationQuerySchema.extend({
  opportunityId: uuidSchema.optional(),
  status: z.enum(['PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'ABSENT']).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const hoursQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'REVOKED']).optional(),
  organizationId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
