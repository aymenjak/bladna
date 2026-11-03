// Volunteer self-service module (spec §29–§31, §57, §72).
//
// The volunteer owns their identity: profile, skills/languages/interests,
// privacy flags, notification preferences and data requests, plus the
// volunteer card (one per profile, unique BLD-CARD- number, QR = the profile's
// public verification token) and the CV export (an aggregate document of the
// owner's own rows — not a list endpoint). Reads are guarded by the
// volunteer.* system permissions, every mutation writes an audit row.
// The public directory only exposes profiles that opted into publicity and
// masks emails unless publicEmail is set.

import { randomBytes } from 'node:crypto';
import { getPrisma, type Prisma } from '@bladna/database';
import {
  AppError,
  NOTIFICATION_TYPES,
  type LocaleCode,
  type NotificationType,
} from '@bladna/types';
import {
  buildPageMeta,
  maskEmail,
  normalizePageParams,
  pickLocalized,
  resolveLocale,
} from '@bladna/utils';
import {
  dataRequestSchema,
  manageInterestsSchema,
  manageLanguagesSchema,
  manageSkillsSchema,
  notificationPreferenceSchema,
  paginationQuerySchema,
  privacySettingsSchema,
  profileParamsSchema,
  updateVolunteerProfileSchema,
  volunteerSearchSchema,
} from '@bladna/validation';
import { env } from '../env';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireAuth, requireSystemPermission } from '../guards';
import { pdfResponse, renderCardPdf, renderCvPdf } from '../infra/pdf';
import { qrToDataUrl, qrToPng } from '../infra/qr';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

const PROFILE_SELECT = {
  id: true,
  volunteerId: true,
  publicToken: true,
  bio: true,
  wilayaId: true,
  cityId: true,
  availability: true,
  onlinePreference: true,
  internationalPreference: true,
  publicProfile: true,
  publicPhone: true,
  publicEmail: true,
  showWilaya: true,
  showHours: true,
  showCertificates: true,
  verificationStatus: true,
  dateOfBirth: true,
  createdAt: true,
  wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
  city: { select: { id: true, nameAr: true, nameFr: true, nameEn: true } },
  // Skillset: GET /me/profile is the read side of POST /me/skills|languages|
  // interests (those routes only exist as writes), so the profile page and
  // its manage island can render current rows without extra round-trips.
  skills: {
    select: {
      skillId: true,
      yearsExperience: true,
      skill: { select: { id: true, nameAr: true, nameFr: true, nameEn: true, category: true } },
    },
  },
  languages: {
    select: {
      languageId: true,
      level: true,
      language: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
    },
  },
  interests: {
    select: {
      interestId: true,
      interest: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      profileImage: true,
      preferredLanguage: true,
    },
  },
} as const satisfies Prisma.VolunteerProfileSelect;

const MUTABLE_SELECT = {
  bio: true,
  wilayaId: true,
  cityId: true,
  availability: true,
  onlinePreference: true,
  internationalPreference: true,
  publicProfile: true,
  publicPhone: true,
  publicEmail: true,
  dateOfBirth: true,
} as const satisfies Prisma.VolunteerProfileSelect;

const SKILL_ROWS_SELECT = {
  skillId: true,
  yearsExperience: true,
  verificationLevel: true,
  skill: { select: { id: true, nameAr: true, nameFr: true, nameEn: true, category: true } },
} as const satisfies Prisma.VolunteerSkillSelect;

const LANGUAGE_ROWS_SELECT = {
  languageId: true,
  level: true,
  language: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
} as const satisfies Prisma.VolunteerLanguageSelect;

const INTEREST_ROWS_SELECT = {
  interestId: true,
  interest: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
} as const satisfies Prisma.VolunteerInterestSelect;

const CARD_SELECT = {
  id: true,
  cardNumber: true,
  volunteerProfileId: true,
  verificationStatus: true,
  status: true,
  issuedAt: true,
  expiresAt: true,
  qrToken: true,
  createdAt: true,
} as const satisfies Prisma.VolunteerCardSelect;

/** `BLD-CARD-` + uppercase base36 suffix; uniqueness retried by the caller. */
function nextCardNumber(): string {
  const suffix = BigInt(`0x${randomBytes(5).toString('hex')}`)
    .toString(36)
    .toUpperCase()
    .padStart(8, '0');
  return `BLD-CARD-${suffix}`;
}

/** Public verification URL the card QR points at (resolves via GET /public/verify). */
function cardVerifyUrl(qrToken: string): string {
  return `${env.publicAppUrl}/verify?code=${encodeURIComponent(qrToken)}`;
}

const DATA_REQUEST_NOTICE: Record<LocaleCode, { title: string; body: string }> = {
  ar: {
    title: 'استلمنا طلبك',
    body: 'استلمنا طلبك ({type}) وسيراجعه فريق بلادنا. ستصلك رسالة عند معالجته.',
  },
  fr: {
    title: 'Demande reçue',
    body: 'Nous avons bien reçu votre demande ({type}). L’équipe BLADNA l’examinera et vous préviendra.',
  },
  en: {
    title: 'Request received',
    body: 'We received your {type} request. The BLADNA team will review it and notify you.',
  },
};

async function requireProfile(userId: string, forWrite: boolean): Promise<{ id: string }> {
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    throw forWrite
      ? AppError.businessRule('Complete your volunteer profile first.')
      : AppError.notFound('Volunteer profile not found.');
  }
  return profile;
}

async function assertLocationRefs(wilayaId?: string | null, cityId?: string | null): Promise<void> {
  const prisma = getPrisma();
  const missing: string[] = [];
  if (
    wilayaId &&
    !(await prisma.wilaya.findUnique({ where: { id: wilayaId }, select: { id: true } }))
  ) {
    missing.push('wilayaId');
  }
  if (cityId && !(await prisma.city.findUnique({ where: { id: cityId }, select: { id: true } }))) {
    missing.push('cityId');
  }
  if (missing.length > 0) {
    throw AppError.validation(
      'One or more referenced locations do not exist.',
      missing.map((path) => ({
        path,
        code: 'not_found',
        message: `Referenced ${path} does not exist.`,
      })),
    );
  }
}

// ── Profile ─────────────────────────────────────────────────────

async function getProfile(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.profile.read');
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: PROFILE_SELECT,
  });
  if (!profile) throw AppError.notFound('Volunteer profile not found.');
  return { profile };
}

async function patchProfile(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.profile.update');
  const input = await body(ctx, updateVolunteerProfileSchema);
  const prisma = getPrisma();
  const profile = await requireProfile(user.userId, true);
  await assertLocationRefs(input.wilayaId, input.cityId);

  const before = await prisma.volunteerProfile.findUnique({
    where: { id: profile.id },
    select: MUTABLE_SELECT,
  });
  if (!before) throw AppError.notFound('Volunteer profile not found.');

  // Unchecked input: the FK scalars (wilayaId/cityId) are only exposed there —
  // relations stay typed, refs are validated by assertLocationRefs above.
  const data: Prisma.VolunteerProfileUncheckedUpdateInput = {};
  if (input.bio !== undefined) data.bio = input.bio;
  if (input.wilayaId !== undefined) data.wilayaId = input.wilayaId;
  if (input.cityId !== undefined) data.cityId = input.cityId;
  if (input.availability !== undefined) data.availability = input.availability;
  if (input.onlinePreference !== undefined) data.onlinePreference = input.onlinePreference;
  if (input.internationalPreference !== undefined)
    data.internationalPreference = input.internationalPreference;
  if (input.publicProfile !== undefined) data.publicProfile = input.publicProfile;
  if (input.publicPhone !== undefined) data.publicPhone = input.publicPhone;
  if (input.publicEmail !== undefined) data.publicEmail = input.publicEmail;
  if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth;

  if (Object.keys(data).length === 0) {
    throw AppError.validation('Provide at least one field to update.');
  }

  const updated = await prisma.volunteerProfile.update({
    where: { id: profile.id },
    data,
    select: PROFILE_SELECT,
  });

  await audit({
    actorUserId: user.userId,
    action: 'volunteer.profile_update',
    entityType: 'volunteerProfile',
    entityId: profile.id,
    before,
    after: { fields: Object.keys(data) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { profile: updated };
}

// ── Skills / languages / interests ─────────────────────────────

async function listSkills(profileId: string): Promise<unknown> {
  return getPrisma().volunteerSkill.findMany({
    where: { volunteerProfileId: profileId },
    select: SKILL_ROWS_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

async function manageSkills(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.skills.manage');
  const input = await body(ctx, manageSkillsSchema);
  const prisma = getPrisma();
  const profile = await requireProfile(user.userId, true);

  if (input.add.length === 0 && input.remove.length === 0) {
    throw AppError.validation('Provide skills to add or remove.');
  }

  const referenced = [...new Set([...input.add.map((entry) => entry.skillId), ...input.remove])];
  const found = await prisma.skill.count({ where: { id: { in: referenced } } });
  if (found !== referenced.length) {
    throw AppError.validation('One or more skills do not exist.');
  }

  await prisma.$transaction(async (tx) => {
    if (input.remove.length > 0) {
      await tx.volunteerSkill.deleteMany({
        where: { volunteerProfileId: profile.id, skillId: { in: input.remove } },
      });
    }
    for (const entry of input.add) {
      await tx.volunteerSkill.upsert({
        where: {
          volunteerProfileId_skillId: { volunteerProfileId: profile.id, skillId: entry.skillId },
        },
        update:
          entry.yearsExperience !== undefined ? { yearsExperience: entry.yearsExperience } : {},
        create: {
          volunteerProfileId: profile.id,
          skillId: entry.skillId,
          source: 'self',
          ...(entry.yearsExperience !== undefined
            ? { yearsExperience: entry.yearsExperience }
            : {}),
        },
      });
    }
  });

  await audit({
    actorUserId: user.userId,
    action: 'volunteer.skills_manage',
    entityType: 'volunteerProfile',
    entityId: profile.id,
    after: { added: input.add.length, removed: input.remove.length },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { skills: await listSkills(profile.id) };
}

async function listLanguages(profileId: string): Promise<unknown> {
  return getPrisma().volunteerLanguage.findMany({
    where: { volunteerProfileId: profileId },
    select: LANGUAGE_ROWS_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

async function manageLanguages(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.skills.manage');
  const input = await body(ctx, manageLanguagesSchema);
  const prisma = getPrisma();
  const profile = await requireProfile(user.userId, true);

  if (input.add.length === 0 && input.remove.length === 0) {
    throw AppError.validation('Provide languages to add or remove.');
  }

  const referenced = [...new Set([...input.add.map((entry) => entry.languageId), ...input.remove])];
  const found = await prisma.language.count({ where: { id: { in: referenced } } });
  if (found !== referenced.length) {
    throw AppError.validation('One or more languages do not exist.');
  }

  await prisma.$transaction(async (tx) => {
    if (input.remove.length > 0) {
      await tx.volunteerLanguage.deleteMany({
        where: { volunteerProfileId: profile.id, languageId: { in: input.remove } },
      });
    }
    for (const entry of input.add) {
      await tx.volunteerLanguage.upsert({
        where: {
          volunteerProfileId_languageId: {
            volunteerProfileId: profile.id,
            languageId: entry.languageId,
          },
        },
        update: { level: entry.level },
        create: {
          volunteerProfileId: profile.id,
          languageId: entry.languageId,
          level: entry.level,
        },
      });
    }
  });

  await audit({
    actorUserId: user.userId,
    action: 'volunteer.languages_manage',
    entityType: 'volunteerProfile',
    entityId: profile.id,
    after: { added: input.add.length, removed: input.remove.length },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { languages: await listLanguages(profile.id) };
}

async function listInterests(profileId: string): Promise<unknown> {
  return getPrisma().volunteerInterest.findMany({
    where: { volunteerProfileId: profileId },
    select: INTEREST_ROWS_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

async function manageInterests(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.skills.manage');
  const input = await body(ctx, manageInterestsSchema);
  const prisma = getPrisma();
  const profile = await requireProfile(user.userId, true);

  if (input.add.length === 0 && input.remove.length === 0) {
    throw AppError.validation('Provide interests to add or remove.');
  }

  const referenced = [...new Set([...input.add, ...input.remove])];
  const found = await prisma.interest.count({ where: { id: { in: referenced } } });
  if (found !== referenced.length) {
    throw AppError.validation('One or more interests do not exist.');
  }

  await prisma.$transaction(async (tx) => {
    if (input.remove.length > 0) {
      await tx.volunteerInterest.deleteMany({
        where: { volunteerProfileId: profile.id, interestId: { in: input.remove } },
      });
    }
    if (input.add.length > 0) {
      await tx.volunteerInterest.createMany({
        data: input.add.map((interestId) => ({ volunteerProfileId: profile.id, interestId })),
        skipDuplicates: true,
      });
    }
  });

  await audit({
    actorUserId: user.userId,
    action: 'volunteer.interests_manage',
    entityType: 'volunteerProfile',
    entityId: profile.id,
    after: { added: input.add.length, removed: input.remove.length },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { interests: await listInterests(profile.id) };
}

// ── Privacy, notification preferences, data requests ───────────

async function patchPrivacy(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.profile.update');
  const input = await body(ctx, privacySettingsSchema);
  const prisma = getPrisma();
  const profile = await requireProfile(user.userId, true);

  const data: Prisma.VolunteerProfileUpdateInput = {};
  if (input.publicProfile !== undefined) data.publicProfile = input.publicProfile;
  if (input.publicPhone !== undefined) data.publicPhone = input.publicPhone;
  if (input.publicEmail !== undefined) data.publicEmail = input.publicEmail;
  if (input.showWilaya !== undefined) data.showWilaya = input.showWilaya;
  if (input.showHours !== undefined) data.showHours = input.showHours;
  if (input.showCertificates !== undefined) data.showCertificates = input.showCertificates;
  if (Object.keys(data).length === 0) {
    throw AppError.validation('Provide at least one privacy setting to update.');
  }

  const updated = await prisma.volunteerProfile.update({
    where: { id: profile.id },
    data,
    select: {
      publicProfile: true,
      publicPhone: true,
      publicEmail: true,
      showWilaya: true,
      showHours: true,
      showCertificates: true,
    },
  });

  await audit({
    actorUserId: user.userId,
    action: 'volunteer.privacy_update',
    entityType: 'volunteerProfile',
    entityId: profile.id,
    after: updated,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { privacy: updated };
}

async function listNotificationPreferences(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.profile.read');
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = { userId: user.userId } as const;
  const [total, items] = await Promise.all([
    prisma.notificationPreference.count({ where }),
    prisma.notificationPreference.findMany({
      where,
      select: { type: true, channel: true, enabled: true, updatedAt: true },
      orderBy: [{ type: 'asc' }, { channel: 'asc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function updateNotificationPreferences(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.profile.update');
  const input = await body(ctx, notificationPreferenceSchema);
  const prisma = getPrisma();

  const validTypes = new Set<string>(NOTIFICATION_TYPES);
  const unknown = input.preferences.filter((pref) => !validTypes.has(pref.type));
  if (unknown.length > 0) {
    throw AppError.validation(
      'One or more notification types are unknown.',
      unknown.map((pref) => ({
        path: `preferences.${pref.type}`,
        code: 'unknown_type',
        message: 'Unknown notification type.',
      })),
    );
  }

  for (const pref of input.preferences) {
    const type = pref.type as NotificationType;
    await prisma.notificationPreference.upsert({
      where: { userId_type_channel: { userId: user.userId, type, channel: pref.channel } },
      update: { enabled: pref.enabled },
      create: { userId: user.userId, type, channel: pref.channel, enabled: pref.enabled },
    });
  }

  await audit({
    actorUserId: user.userId,
    action: 'volunteer.notification_prefs',
    entityType: 'user',
    entityId: user.userId,
    after: { updated: input.preferences.length },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { updated: input.preferences.length };
}

async function dataRequest(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const input = await body(ctx, dataRequestSchema);
  const prisma = getPrisma();

  let request: { id: string; status: string; createdAt: Date };
  let entityType: string;

  if (input.type === 'DELETE') {
    const existing = await prisma.deletionRequest.findFirst({
      where: { userId: user.userId, status: 'PENDING' },
      select: { id: true },
    });
    if (existing)
      throw AppError.conflict('A deletion request is already pending for this account.');
    const created = await prisma.deletionRequest.create({
      data: { userId: user.userId, reason: input.reason ?? null, status: 'PENDING' },
      select: { id: true, status: true, createdAt: true },
    });
    request = created;
    entityType = 'deletionRequest';
  } else {
    const existing = await prisma.dataAccessRequest.findFirst({
      where: { userId: user.userId, type: input.type, status: 'PENDING' },
      select: { id: true },
    });
    if (existing)
      throw AppError.conflict('A matching data request is already pending for this account.');
    const created = await prisma.dataAccessRequest.create({
      data: {
        userId: user.userId,
        type: input.type,
        note: input.reason ?? null,
        status: 'PENDING',
      },
      select: { id: true, status: true, createdAt: true },
    });
    request = created;
    entityType = 'dataAccessRequest';
  }

  await audit({
    actorUserId: user.userId,
    action: 'user.data_request',
    entityType,
    entityId: request.id,
    after: { type: input.type },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const copy = DATA_REQUEST_NOTICE[user.locale];
  await notify({
    userId: user.userId,
    type: 'SYSTEM',
    title: copy.title,
    body: copy.body.replace('{type}', input.type),
    data: { requestType: input.type, requestId: request.id },
  });

  return { request: { ...request, type: input.type } };
}

// ── Stats & public directory ───────────────────────────────────

async function stats(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.profile.read');
  const profile = await requireProfile(user.userId, false);
  const prisma = getPrisma();

  const [
    verified,
    pendingHours,
    rejectedHours,
    certificates,
    applications,
    completedActivities,
    attendance,
    achievements,
  ] = await Promise.all([
    prisma.volunteerHour.aggregate({
      where: { volunteerProfileId: profile.id, status: 'VERIFIED' },
      _sum: { hours: true },
      _count: true,
    }),
    prisma.volunteerHour.count({ where: { volunteerProfileId: profile.id, status: 'PENDING' } }),
    prisma.volunteerHour.count({ where: { volunteerProfileId: profile.id, status: 'REJECTED' } }),
    prisma.volunteerCertificate.count({
      where: { volunteerProfileId: profile.id, status: 'VALID' },
    }),
    prisma.opportunityApplication.count({ where: { volunteerProfileId: profile.id } }),
    prisma.volunteerActivity.count({
      where: { volunteerProfileId: profile.id, status: 'COMPLETED' },
    }),
    prisma.attendance.count({ where: { volunteerProfileId: profile.id } }),
    prisma.volunteerAchievement.count({ where: { volunteerProfileId: profile.id } }),
  ]);

  return {
    stats: {
      verifiedHours: verified._sum.hours ? verified._sum.hours.toNumber() : 0,
      verifiedHourRecords: verified._count,
      pendingHours,
      rejectedHours,
      certificates,
      applications,
      completedActivities,
      attendance,
      achievements,
    },
  };
}

// ── Volunteer card (spec §10, §72) ────────────────────────────

type CardRow = Prisma.VolunteerCardGetPayload<{ select: typeof CARD_SELECT }>;

function serializeCard(row: CardRow): Record<string, unknown> {
  const { qrToken, ...rest } = row;
  return { ...rest, qrToken, verifyUrl: cardVerifyUrl(qrToken) };
}

/**
 * Issues the caller's volunteer card: one per profile (409 otherwise), a
 * unique `BLD-CARD-XXXXXXXX` number retried like certificate numbers, and a
 * QR token that IS the profile's public verification token — scanning it
 * resolves against today's `GET /public/verify`, no parallel token scheme.
 * The verification level is mirrored from the profile at issue time; the card
 * never claims more than the profile had when it was created.
 */
async function issueCard(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true, verificationStatus: true, publicToken: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const existing = await prisma.volunteerCard.findUnique({
    where: { volunteerProfileId: profile.id },
    select: { id: true },
  });
  if (existing) throw AppError.conflict('You already have a volunteer card.');

  let created: CardRow | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      created = await prisma.volunteerCard.create({
        data: {
          cardNumber: nextCardNumber(),
          volunteerProfileId: profile.id,
          qrToken: profile.publicToken,
          verificationStatus: profile.verificationStatus,
          status: 'ACTIVE',
          issuedAt: new Date(),
        },
        select: CARD_SELECT,
      });
    } catch (error) {
      // Unique collisions on cardNumber/qrToken: re-roll and retry.
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }
  if (!created) throw AppError.internal('Could not allocate a unique card number.');

  await audit({
    actorUserId: user.userId,
    action: 'volunteer_card.issue',
    entityType: 'volunteerCard',
    entityId: created.id,
    after: {
      cardNumber: created.cardNumber,
      verificationStatus: created.verificationStatus,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { card: serializeCard(created) };
}

async function getCard(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.notFound('You have no volunteer card yet.');
  const card = await prisma.volunteerCard.findUnique({
    where: { volunteerProfileId: profile.id },
    select: CARD_SELECT,
  });
  if (!card) throw AppError.notFound('You have no volunteer card yet.');

  const dataUrl = await qrToDataUrl(card.qrToken);
  return {
    card: {
      ...serializeCard(card),
      qr: { token: card.qrToken, verifyUrl: cardVerifyUrl(card.qrToken), dataUrl },
    },
  };
}

async function cardPdf(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: {
      id: true,
      volunteerId: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });
  if (!profile) throw AppError.notFound('You have no volunteer card yet.');
  const card = await prisma.volunteerCard.findUnique({
    where: { volunteerProfileId: profile.id },
    select: CARD_SELECT,
  });
  if (!card) throw AppError.notFound('You have no volunteer card yet.');

  const verifyUrl = cardVerifyUrl(card.qrToken);
  const qr = await qrToPng(verifyUrl);
  const pdf = await renderCardPdf({
    locale: resolveLocale(ctx.query.get('locale')),
    holderName: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
    volunteerId: profile.volunteerId,
    cardNumber: card.cardNumber,
    cardStatus: card.status,
    verificationStatus: card.verificationStatus,
    issuedAt: card.issuedAt,
    verifyUrl,
    qr,
  });
  return pdfResponse(pdf, `bladna-card-${card.cardNumber}.pdf`, 'private, no-store');
}

// ── CV export (spec §57) ───────────────────────────────────────

/**
 * Own CV: one aggregate document assembled from the owner's rows (profile,
 * taxonomies, verified-hour total, certificates, achievements, international
 * experiences). It is an export, not a list endpoint — collections stay
 * paginated under their own routes. Contact data is the owner's own (privacy
 * flags govern the public surface, never self-export). The same aggregate
 * feeds `GET /me/cv` (JSON) and `GET /me/cv/pdf` (rendered document).
 */
async function buildCv(userId: string) {
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId },
    select: {
      id: true,
      volunteerId: true,
      bio: true,
      availability: true,
      verificationStatus: true,
      wilaya: { select: { code: true, nameAr: true, nameFr: true, nameEn: true } },
      city: { select: { nameAr: true, nameFr: true, nameEn: true } },
      user: {
        select: { firstName: true, lastName: true, email: true, phone: true, profileImage: true },
      },
      skills: { select: SKILL_ROWS_SELECT },
      languages: { select: LANGUAGE_ROWS_SELECT },
      interests: { select: INTEREST_ROWS_SELECT },
    },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const [hours, certificates, achievements, experiences] = await Promise.all([
    prisma.volunteerHour.aggregate({
      where: { volunteerProfileId: profile.id, status: 'VERIFIED' },
      _sum: { hours: true },
      _count: true,
    }),
    prisma.volunteerCertificate.findMany({
      where: { volunteerProfileId: profile.id },
      select: {
        certificateNumber: true,
        title: true,
        hours: true,
        issuedAt: true,
        status: true,
        expiresAt: true,
        organization: { select: { name: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    }),
    prisma.volunteerAchievement.findMany({
      where: { volunteerProfileId: profile.id },
      select: {
        unlockedAt: true,
        achievement: {
          select: {
            code: true,
            nameAr: true,
            nameFr: true,
            nameEn: true,
            descriptionAr: true,
            descriptionFr: true,
            descriptionEn: true,
          },
        },
      },
      orderBy: { unlockedAt: 'desc' },
      take: 200,
    }),
    prisma.internationalExperience.findMany({
      where: { volunteerProfileId: profile.id },
      select: {
        organizationName: true,
        program: true,
        activity: true,
        startDate: true,
        endDate: true,
        hours: true,
        verified: true,
        country: { select: { nameAr: true, nameFr: true, nameEn: true } },
      },
      orderBy: { startDate: 'desc' },
      take: 200,
    }),
  ]);

  return {
    cv: {
      profile: {
        volunteerId: profile.volunteerId,
        name: `${profile.user.firstName} ${profile.user.lastName}`.trim(),
        verificationStatus: profile.verificationStatus,
        bio: profile.bio,
        availability: profile.availability,
        wilaya: profile.wilaya,
        city: profile.city,
        profileImage: profile.user.profileImage,
      },
      contact: { email: profile.user.email, phone: profile.user.phone ?? null },
      skills: profile.skills,
      languages: profile.languages,
      interests: profile.interests,
      stats: {
        verifiedHours: hours._sum.hours ? hours._sum.hours.toNumber() : 0,
        verifiedHourRecords: hours._count,
        certificates: certificates.length,
        achievements: achievements.length,
      },
      certificates: certificates.map((row) => ({
        number: row.certificateNumber,
        title: row.title,
        organization: row.organization.name,
        hours: row.hours.toNumber(),
        issuedAt: row.issuedAt,
        status: row.status,
        expiresAt: row.expiresAt,
      })),
      achievements,
      experiences: experiences.map((row) => ({ ...row, hours: row.hours?.toNumber() ?? null })),
    },
  };
}

async function myCv(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  return buildCv(user.userId);
}

/** "City, Wilaya" for the PDF header; null when the profile has neither. */
function pickLocation(
  wilaya: { nameAr: string | null; nameFr: string | null; nameEn: string | null } | null,
  city: { nameAr: string | null; nameFr: string | null; nameEn: string | null } | null,
  locale: LocaleCode,
): string | null {
  const parts = [
    city ? pickLocalized(city, locale, ['name']) : '',
    wilaya ? pickLocalized(wilaya, locale, ['name']) : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

/** PDF twin of `GET /me/cv` — same owner-only aggregate, rendered on A4. */
async function cvPdf(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { cv } = await buildCv(user.userId);
  const locale = resolveLocale(ctx.query.get('locale'));

  const pdf = await renderCvPdf({
    locale,
    name: cv.profile.name,
    volunteerId: cv.profile.volunteerId,
    verificationStatus: cv.profile.verificationStatus,
    location: pickLocation(cv.profile.wilaya, cv.profile.city, locale),
    email: cv.contact.email,
    phone: cv.contact.phone,
    bio: cv.profile.bio,
    availability: cv.profile.availability,
    skills: cv.skills.map((row) => ({
      name: pickLocalized(row.skill, locale, ['name']),
      years: row.yearsExperience,
    })),
    languages: cv.languages.map((row) => ({
      name: pickLocalized(row.language, locale, ['name']),
      level: row.level,
    })),
    interests: cv.interests.map((row) => pickLocalized(row.interest, locale, ['name'])),
    verifiedHours: cv.stats.verifiedHours,
    certificates: cv.certificates.map((row) => ({
      number: row.number,
      title: row.title,
      organization: row.organization,
      hours: row.hours,
      issuedAt: row.issuedAt,
      status: row.status,
    })),
    achievements: cv.achievements.map((row) => pickLocalized(row.achievement, locale, ['name'])),
    experiences: cv.experiences.map((row) => ({
      organizationName: row.organizationName,
      program: row.program,
      activity: row.activity,
      country: row.country ? pickLocalized(row.country, locale, ['name']) : null,
      startDate: row.startDate,
      endDate: row.endDate,
      hours: row.hours,
      verified: row.verified,
    })),
  });
  return pdfResponse(pdf, `bladna-cv-${cv.profile.volunteerId}.pdf`, 'private, no-store');
}

async function directory(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, volunteerSearchSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.VolunteerProfileWhereInput = {
    publicProfile: true,
    user: { deletedAt: null },
    ...(f.wilayaId
      ? // Location filtering answers the very question showWilaya hides: a
        // profile that withheld its wilaya cannot be found through a wilaya
        // filter (it still appears in unfiltered pages, location omitted).
        { wilayaId: f.wilayaId, showWilaya: true }
      : {}),
    ...(f.skillIds && f.skillIds.length > 0
      ? { skills: { some: { skillId: { in: f.skillIds } } } }
      : {}),
    ...(f.verifiedOnly === 'true' ? { verificationStatus: { not: 'UNVERIFIED' } } : {}),
    ...(f.q
      ? {
          OR: [
            { user: { firstName: { contains: f.q, mode: 'insensitive' } } },
            { user: { lastName: { contains: f.q, mode: 'insensitive' } } },
            { volunteerId: { contains: f.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.volunteerProfile.count({ where }),
    prisma.volunteerProfile.findMany({
      where,
      select: {
        id: true,
        // P23: the directory card's Message link targets the owner — only
        // opt-in public profiles (line 1003) reach this select, and the
        // messaging API itself enforces blocks + `messaging` rate limits.
        userId: true,
        volunteerId: true,
        bio: true,
        verificationStatus: true,
        availability: true,
        publicEmail: true,
        showWilaya: true,
        wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
        city: { select: { id: true, nameAr: true, nameFr: true, nameEn: true } },
        skills: { select: SKILL_ROWS_SELECT },
        user: { select: { firstName: true, lastName: true, profileImage: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    volunteerId: row.volunteerId,
    bio: row.bio,
    verificationStatus: row.verificationStatus,
    availability: row.availability,
    // showWilaya gates the whole location block — a city implies its wilaya.
    wilaya: row.showWilaya ? row.wilaya : null,
    city: row.showWilaya ? row.city : null,
    skills: row.skills,
    user: {
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      profileImage: row.user.profileImage,
      email: row.publicEmail ? row.user.email : maskEmail(row.user.email),
    },
  }));

  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** Rows shown per capped public list; the payload carries honest totals. */
const PROFILE_LIST_TAKE = 8;

/**
 * Public volunteer profile (P25) — the directory card's click-through: photo,
 * bio, skillset and the achievements that make an opt-in profile worth having.
 * Privacy is the whole contract:
 *   * `publicProfile=true` decides whether the row exists at all — an unknown
 *     id and a withheld profile answer the same 404 (no existence oracle);
 *   * `showWilaya` withholds the location block (a city implies its wilaya);
 *   * `showHours` withholds the verified-hour total **without issuing the
 *     aggregate** (spec §30 — the exact rule `GET /public/verify` follows);
 *   * `showCertificates` gates the certificate list — this page is the first
 *     surface where that stored flag controls something (every row links to
 *     credential-keyed verification, which never depends on privacy flags);
 *   * email is masked unless `publicEmail`; the phone number never travels
 *     through this contract at all.
 */
async function publicProfile(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, profileParamsSchema);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findFirst({
    where: { id, publicProfile: true, user: { deletedAt: null } },
    select: {
      id: true,
      userId: true,
      volunteerId: true,
      bio: true,
      verificationStatus: true,
      availability: true,
      createdAt: true,
      publicEmail: true,
      showWilaya: true,
      showHours: true,
      showCertificates: true,
      wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
      city: { select: { id: true, nameAr: true, nameFr: true, nameEn: true } },
      skills: { select: SKILL_ROWS_SELECT },
      languages: { select: LANGUAGE_ROWS_SELECT },
      interests: { select: INTEREST_ROWS_SELECT },
      user: { select: { firstName: true, lastName: true, profileImage: true, email: true } },
    },
  });
  if (!profile) throw AppError.notFound('Profile not found.');

  const now = new Date();
  const certificateWhere = {
    volunteerProfileId: profile.id,
    status: 'VALID' as const,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
  const activityWhere = { volunteerProfileId: profile.id };
  const [verifiedHours, certificates, certificatesTotal, participations, participationsTotal] =
    await Promise.all([
      profile.showHours
        ? prisma.volunteerHour
            .aggregate({
              where: { volunteerProfileId: profile.id, status: 'VERIFIED' },
              _sum: { hours: true },
            })
            .then((result) => (result._sum.hours ? result._sum.hours.toNumber() : 0))
        : Promise.resolve(null),
      profile.showCertificates
        ? prisma.volunteerCertificate.findMany({
            where: certificateWhere,
            orderBy: { issuedAt: 'desc' },
            take: PROFILE_LIST_TAKE,
            select: {
              certificateNumber: true,
              title: true,
              hours: true,
              issuedAt: true,
              organization: { select: { name: true } },
            },
          })
        : Promise.resolve(null),
      // Honest totals next to the capped lists — a summary tile must never
      // present "8 of 12" as the whole story.
      profile.showCertificates
        ? prisma.volunteerCertificate.count({ where: certificateWhere })
        : Promise.resolve(null),
      // Participation timeline: titles, organizations and dates only — the
      // numbers inside it follow `showHours` row by row.
      prisma.volunteerActivity.findMany({
        where: activityWhere,
        orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
        take: PROFILE_LIST_TAKE,
        select: {
          id: true,
          title: true,
          startedAt: true,
          endedAt: true,
          status: true,
          organization: { select: { name: true } },
          opportunity: { select: { slug: true, titleAr: true, titleFr: true, titleEn: true } },
          hours: { select: { hours: true, status: true } },
        },
      }),
      prisma.volunteerActivity.count({ where: activityWhere }),
    ]);

  return {
    profile: {
      id: profile.id,
      userId: profile.userId,
      volunteerId: profile.volunteerId,
      bio: profile.bio,
      verificationStatus: profile.verificationStatus,
      availability: profile.availability,
      memberSince: profile.createdAt.toISOString(),
      wilaya: profile.showWilaya ? profile.wilaya : null,
      city: profile.showWilaya ? profile.city : null,
      email: profile.publicEmail ? profile.user.email : maskEmail(profile.user.email),
      user: {
        firstName: profile.user.firstName,
        lastName: profile.user.lastName,
        profileImage: profile.user.profileImage,
      },
    },
    skills: profile.skills,
    languages: profile.languages,
    interests: profile.interests,
    achievements: {
      // null = withheld by the owner (rendered as the honest note, not a 0).
      verifiedHours,
      certificates: certificates?.map((row) => ({
        number: row.certificateNumber,
        title: row.title,
        organization: row.organization.name,
        hours: row.hours.toNumber(),
        issuedAt: row.issuedAt.toISOString(),
      })),
      certificatesTotal,
      participations: participations.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt?.toISOString() ?? null,
        organization: row.organization?.name ?? null,
        opportunity: row.opportunity
          ? {
              slug: row.opportunity.slug,
              titleAr: row.opportunity.titleAr,
              titleFr: row.opportunity.titleFr,
              titleEn: row.opportunity.titleEn,
            }
          : null,
        verifiedHours: profile.showHours
          ? row.hours
              .filter((hour) => hour.status === 'VERIFIED')
              .reduce((sum, hour) => sum + hour.hours.toNumber(), 0)
          : null,
      })),
      participationsTotal,
    },
  };
}

/**
 * Own participation timeline — `VolunteerActivity` rows are the volunteer's
 * local experience (participations an org attached to an opportunity or
 * campaign). Hours and certificates hang off them, so this list answers
 * "what have I actually done" on the profile (RESEARCH H2).
 */
async function listMyActivities(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'volunteer.profile.read');
  const profile = await requireProfile(user.userId, false);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = { volunteerProfileId: profile.id };
  const [total, rows] = await Promise.all([
    prisma.volunteerActivity.count({ where }),
    prisma.volunteerActivity.findMany({
      where,
      orderBy: [{ startedAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        title: true,
        description: true,
        startedAt: true,
        endedAt: true,
        status: true,
        organization: { select: { id: true, name: true } },
        opportunity: {
          select: { id: true, slug: true, titleAr: true, titleFr: true, titleEn: true },
        },
        hours: { select: { hours: true, status: true } },
        certificates: { select: { id: true, certificateNumber: true, title: true, status: true } },
      },
    }),
  ]);

  const items = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    status: row.status,
    organization: row.organization,
    opportunity: row.opportunity,
    // Only VERIFIED hours are earned experience; pending is shown separately
    // so the timeline never implies unapproved work is counted.
    hoursVerified: row.hours
      .filter((hour) => hour.status === 'VERIFIED')
      .reduce((sum, hour) => sum + hour.hours.toNumber(), 0),
    hoursPending: row.hours
      .filter((hour) => hour.status === 'PENDING')
      .reduce((sum, hour) => sum + hour.hours.toNumber(), 0),
    certificates: row.certificates,
  }));

  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Route table ─────────────────────────────────────────────────

export const volunteerRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/me/profile',
    handler: getProfile,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own volunteer profile',
  },
  {
    method: 'PATCH',
    path: '/me/profile',
    handler: patchProfile,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Update own volunteer profile',
  },
  {
    method: 'POST',
    path: '/me/skills',
    handler: manageSkills,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Add/remove own skills',
  },
  {
    method: 'POST',
    path: '/me/languages',
    handler: manageLanguages,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Add/remove own languages',
  },
  {
    method: 'POST',
    path: '/me/interests',
    handler: manageInterests,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Add/remove own interests',
  },
  {
    method: 'PATCH',
    path: '/me/privacy',
    handler: patchPrivacy,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Update privacy settings',
  },
  {
    method: 'GET',
    path: '/me/notification-preferences',
    handler: listNotificationPreferences,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'List notification preferences (paginated)',
  },
  {
    method: 'PATCH',
    path: '/me/notification-preferences',
    handler: updateNotificationPreferences,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Update notification preferences',
  },
  {
    method: 'POST',
    path: '/me/data-request',
    handler: dataRequest,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Request export/deletion of personal data',
  },
  {
    method: 'GET',
    path: '/me/stats',
    handler: stats,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Personal activity statistics',
  },
  {
    method: 'GET',
    path: '/me/activities',
    handler: listMyActivities,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own participation timeline (paginated VolunteerActivity rows)',
  },
  {
    method: 'POST',
    path: '/me/card',
    handler: issueCard,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Issue own volunteer card (unique BLD-CARD number; QR = public verify token)',
  },
  {
    method: 'GET',
    path: '/me/card',
    handler: getCard,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own volunteer card (+ QR data URL)',
  },
  {
    method: 'GET',
    path: '/me/card/pdf',
    handler: cardPdf,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own volunteer card as PDF (?locale=)',
  },
  {
    method: 'GET',
    path: '/me/cv',
    handler: myCv,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own CV export (aggregate document, not a list endpoint)',
  },
  {
    method: 'GET',
    path: '/me/cv/pdf',
    handler: cvPdf,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own CV as a localized A4 PDF (?locale=)',
  },
  {
    method: 'GET',
    path: '/volunteers',
    handler: directory,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Public volunteer directory (opt-in profiles)',
  },
  {
    method: 'GET',
    path: '/volunteers/:id',
    handler: publicProfile,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Public volunteer profile (privacy-gated achievements)',
  },
];
