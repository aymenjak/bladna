// Achievements module (spec §30).
//
// Achievements are factual thresholds over persisted rows (verified hours,
// completed activities, international experiences, organization-verified
// skills, valid certificates) — never a synthetic score. Unlocks are computed
// from real aggregates, persisted once per achievement (skipDuplicates on the
// [profile, achievement] unique), and audited when new rows appear.

import { getPrisma, type Prisma } from '@bladna/database';
import { evaluateAchievements, type AchievementInputs } from '@bladna/domain';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import { paginationQuerySchema } from '@bladna/validation';
import { query, type RequestContext } from '../http';
import { requireAuth } from '../guards';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

const ACHIEVEMENT_CATALOG_SELECT = {
  id: true,
  code: true,
  nameAr: true,
  nameFr: true,
  nameEn: true,
  descriptionAr: true,
  descriptionFr: true,
  descriptionEn: true,
  thresholdHours: true,
  sortOrder: true,
} as const satisfies Prisma.AchievementSelect;

/** Public catalog: every active Achievement row, ordered by sortOrder. */
const CATALOG_WHERE = { active: true } as const;

/** Real aggregates feeding the threshold evaluation — one round trip each. */
async function collectInputs(profileId: string): Promise<AchievementInputs> {
  const prisma = getPrisma();
  const [hours, completedActivities, internationalExperiences, verifiedSkills, validCertificates] =
    await Promise.all([
      prisma.volunteerHour.aggregate({
        where: { volunteerProfileId: profileId, status: 'VERIFIED' },
        _sum: { hours: true },
      }),
      prisma.volunteerActivity.count({
        where: { volunteerProfileId: profileId, status: 'COMPLETED' },
      }),
      prisma.internationalExperience.count({ where: { volunteerProfileId: profileId } }),
      prisma.volunteerSkill.count({
        where: {
          volunteerProfileId: profileId,
          verificationLevel: 'ORGANIZATION_VERIFIED',
        },
      }),
      prisma.volunteerCertificate.count({
        where: { volunteerProfileId: profileId, status: 'VALID' },
      }),
    ]);

  return {
    verifiedHours: hours._sum.hours ? hours._sum.hours.toNumber() : 0,
    completedActivities,
    internationalExperiences,
    organizationVerifiedSkills: verifiedSkills,
    validCertificates,
  };
}

/**
 * Persist any newly earned achievement. Only codes present in the Achievement
 * catalog can be persisted (FK); codes missing from the catalog are still
 * reported as unlocked — they are simply not storable yet.
 */
async function persistUnlocks(
  profileId: string,
  unlocked: readonly string[],
  actor: { userId: string; ip: string; userAgent: string; requestId: string },
): Promise<number> {
  const prisma = getPrisma();
  const catalog = await prisma.achievement.findMany({
    where: { code: { in: [...unlocked] } },
    select: { id: true, code: true },
  });
  if (catalog.length === 0) return 0;

  const existing = await prisma.volunteerAchievement.findMany({
    where: { volunteerProfileId: profileId, achievementId: { in: catalog.map((row) => row.id) } },
    select: { achievementId: true },
  });
  const held = new Set(existing.map((row) => row.achievementId));
  const fresh = catalog.filter((row) => !held.has(row.id));
  if (fresh.length === 0) return 0;

  await prisma.volunteerAchievement.createMany({
    data: fresh.map((row) => ({ volunteerProfileId: profileId, achievementId: row.id })),
    skipDuplicates: true,
  });

  await audit({
    actorUserId: actor.userId,
    action: 'achievement.unlock',
    entityType: 'volunteerAchievement',
    entityId: profileId,
    after: { codes: fresh.map((row) => row.code) },
    ip: actor.ip,
    userAgent: actor.userAgent,
    requestId: actor.requestId,
  });
  return fresh.length;
}

async function myAchievements(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const inputs = await collectInputs(profile.id);
  const unlockedCodes = evaluateAchievements(inputs);
  await persistUnlocks(profile.id, unlockedCodes, {
    userId: user.userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const unlocked = new Set<string>(unlockedCodes);
  const [total, catalog, unlocks] = await Promise.all([
    prisma.achievement.count({ where: CATALOG_WHERE }),
    prisma.achievement.findMany({
      where: CATALOG_WHERE,
      select: ACHIEVEMENT_CATALOG_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      skip,
      take,
    }),
    prisma.volunteerAchievement.findMany({
      where: { volunteerProfileId: profile.id },
      select: { unlockedAt: true, achievement: { select: { code: true } } },
    }),
  ]);

  const unlockByCode = new Map(unlocks.map((row) => [row.achievement.code, row.unlockedAt]));

  const items = catalog.map((row) => ({
    ...row,
    thresholdHours: row.thresholdHours ? row.thresholdHours.toNumber() : null,
    unlocked: unlocked.has(row.code) || unlockByCode.has(row.code),
    unlockedAt: unlockByCode.get(row.code) ?? null,
  }));

  return {
    items,
    // Codes are domain facts (threshold evaluation), independent of catalog rows.
    unlockedCodes: [...unlocked],
    meta: buildPageMeta(total, { page, limit }),
  };
}

async function catalogList(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.AchievementWhereInput = CATALOG_WHERE;
  const [total, rows] = await Promise.all([
    prisma.achievement.count({ where }),
    prisma.achievement.findMany({
      where,
      select: ACHIEVEMENT_CATALOG_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      skip,
      take,
    }),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      thresholdHours: row.thresholdHours ? row.thresholdHours.toNumber() : null,
    })),
    meta: buildPageMeta(total, { page, limit }),
  };
}

// ── Route table ────────────────────────────────────────────────

export const achievementRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/me/achievements',
    handler: myAchievements,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Evaluate and list own achievements (factual thresholds, unlocks persisted)',
  },
  {
    method: 'GET',
    path: '/achievements',
    handler: catalogList,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Active achievement catalog (paginated)',
  },
];
