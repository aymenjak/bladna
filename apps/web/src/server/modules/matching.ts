// Personalized matching (spec §71) — wiring for the deterministic engine in
// @bladna/domain (`matchOpportunity`), which shipped with tests but no caller.
//
// Two surfaces:
//  - `GET /me/recommendations` ranks the still-open published initiatives
//    against the signed-in volunteer's signals and returns the top N with the
//    engine's transparent reason codes (dashboard strip + recommendations
//    page). Reasons are ids/counts only — the UI localizes them; age and any
//    protected attribute are never scoring inputs.
//  - `notifyMatchingVolunteers` — called after a first publish: a bounded
//    scan scores the volunteers who share a skill / wilaya / category
//    interest with the new initiative and notifies the top matches
//    (`NEW_MATCHING_OPPORTUNITY`). Threshold + hard caps: an initiative with
//    no candidate basis notifies nobody — no spray, no background job.
//
// The pure helpers (signal building, ranking) are exported for unit tests.

import { getPrisma, type Prisma } from '@bladna/database';
import { LIST_SELECT } from '../opportunity-select';
import {
  matchOpportunity,
  type MatchReason,
  type OpportunitySignals,
  type VolunteerSignals,
} from '@bladna/domain';
import {
  AppError,
  type AvailabilitySlot,
  type LocaleCode,
  type LocationType,
  type OpportunityType,
} from '@bladna/types';
import { resolveLocale } from '@bladna/utils';
import { recommendationQuerySchema } from '@bladna/validation';
import { requireAuth } from '../guards';
import { query, type RequestContext } from '../http';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

// ── Tunables ───────────────────────────────────────────────────

/**
 * Strip/page floor — below this the UI shows the "complete your profile"
 * empty state instead of noise (the baseline availability leg alone scores
 * ~10–25, so an empty profile never masquerades as a match).
 */
export const MATCH_STRIP_MIN_SCORE = 30;
/** Fan-out floor for NEW_MATCHING_OPPORTUNITY (strictly above the strip). */
export const MATCH_NOTIFY_MIN_SCORE = 40;
/** Still-open published initiatives considered per request (recency window). */
export const MATCH_CANDIDATE_CAP = 200;
/** Volunteer profiles scanned per publish — bounded work, indexed OR terms. */
export const MATCH_NOTIFY_SCAN_CAP = 300;
/** Hard cap on notifications emitted per publish. */
export const MATCH_NOTIFY_CAP = 50;

// ── Signal building (pure) ─────────────────────────────────────

/**
 * Category slug → `Interest.code` list for the interest leg of the score.
 * The Interest catalog carries five codes; seed categories without an
 * equivalent contribute no interest overlap — an honest zero beats a
 * made-up mapping. Unknown/custom slugs behave like the empty default.
 */
export const CATEGORY_INTEREST_CODES: Readonly<Record<string, readonly string[]>> = {
  environment: ['environment'],
  education: ['education'],
  health: ['health'],
  culture: ['culture'],
  youth: ['youth'],
  humanitarian: [],
  community: [],
  'animal-welfare': [],
};

/** VolunteerProfile rows as selected by this module (plus real verified hours). */
export interface VolunteerSignalRow {
  wilayaId: string | null;
  cityId: string | null;
  availability: AvailabilitySlot[];
  onlinePreference: boolean;
  internationalPreference: boolean;
  skills: Array<{ skillId: string }>;
  interests: Array<{ interest: { code: string } }>;
  languages: Array<{ languageId: string }>;
  verifiedHours: number;
}

/** Published opportunity rows (LIST_SELECT + languages) as signal inputs. */
export interface OpportunitySignalRow {
  id: string;
  wilayaId: string | null;
  cityId: string | null;
  countryId: string | null;
  categoryId: string | null;
  category: { slug: string } | null;
  locationType: LocationType;
  type: OpportunityType;
  skills: Array<{ required: boolean; skill: { id: string } }>;
  languages: Array<{ languageId: string }>;
}

export function buildVolunteerSignals(row: VolunteerSignalRow): VolunteerSignals {
  return {
    wilayaId: row.wilayaId,
    cityId: row.cityId,
    skillIds: row.skills.map((link) => link.skillId),
    interestCodes: row.interests.map((link) => link.interest.code),
    languageIds: row.languages.map((link) => link.languageId),
    availability: row.availability,
    onlinePreference: row.onlinePreference,
    internationalPreference: row.internationalPreference,
    verifiedHours: row.verifiedHours,
  };
}

export function buildOpportunitySignals(row: OpportunitySignalRow): OpportunitySignals {
  const categoryCodes =
    (row.category ? CATEGORY_INTEREST_CODES[row.category.slug] : undefined) ?? [];
  return {
    wilayaId: row.wilayaId,
    cityId: row.cityId,
    countryId: row.countryId,
    categoryId: row.categoryId,
    categoryInterestCodes: [...categoryCodes],
    requiredSkillIds: row.skills.filter((link) => link.required).map((link) => link.skill.id),
    optionalSkillIds: row.skills.filter((link) => !link.required).map((link) => link.skill.id),
    // Every language the initiative declares counts — required or not, an
    // overlap is an overlap (the engine names the field "required" but the
    // score is symmetric across initiatives, so nothing is inflated).
    requiredLanguageIds: row.languages.map((link) => link.languageId),
    locationType: row.locationType,
    type: row.type,
    // Opportunities declare no availability preference — the engine treats an
    // empty preference as a uniform baseline for every initiative (documented
    // in matching.test.ts), so scores stay comparable.
    preferredAvailability: [],
  };
}

export interface RankedOpportunity<T> {
  opportunity: T;
  match: { score: number; reasons: MatchReason[] };
}

/**
 * Score + rank (score desc). `rows` arrive pre-sorted by recency and
 * `Array.prototype.sort` is stable, so equal scores keep the recency order.
 */
export function rankOpportunities<T extends OpportunitySignalRow>(
  volunteer: VolunteerSignals,
  rows: readonly T[],
): Array<RankedOpportunity<T>> {
  return rows
    .map((opportunity) => ({
      opportunity,
      match: matchOpportunity(volunteer, buildOpportunitySignals(opportunity)),
    }))
    .sort((a, b) => b.match.score - a.match.score);
}

// ── GET /me/recommendations ────────────────────────────────────

/** LIST_SELECT + the language links the signal builder needs. */
const MATCH_SELECT = {
  ...LIST_SELECT,
  languages: {
    select: {
      required: true,
      languageId: true,
      language: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
    },
  },
} as const satisfies Prisma.OpportunitySelect;

export async function recommend(ctx: RequestContext): Promise<unknown> {
  const { limit } = query(ctx, recommendationQuerySchema);
  const user = await requireAuth(ctx);
  const prisma = getPrisma();

  const profile = await prisma.volunteerProfile.findUnique({
    where: { userId: user.userId },
    select: {
      id: true,
      wilayaId: true,
      cityId: true,
      availability: true,
      onlinePreference: true,
      internationalPreference: true,
      skills: { select: { skillId: true } },
      interests: { select: { interest: { select: { code: true } } } },
      languages: { select: { languageId: true } },
    },
  });
  // Degrades the same way the dashboard stats do: org/admin sessions without
  // a volunteer profile get an AppError and simply hide the surface.
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');

  const [hours, savedRows, rows] = await Promise.all([
    prisma.volunteerHour.aggregate({
      where: { volunteerProfileId: profile.id, status: 'VERIFIED' },
      _sum: { hours: true },
    }),
    prisma.savedOpportunity.findMany({
      where: { volunteerProfileId: profile.id },
      select: { opportunityId: true },
    }),
    prisma.opportunity.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        // Still open for applications (deadline unset or in the future);
        // already-applied initiatives drop out — they're the applications tab.
        OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: new Date() } }],
        applications: { none: { volunteerProfileId: profile.id } },
      },
      select: MATCH_SELECT,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: MATCH_CANDIDATE_CAP,
    }),
  ]);

  const volunteer = buildVolunteerSignals({
    ...profile,
    verifiedHours: hours._sum.hours ? hours._sum.hours.toNumber() : 0,
  });
  const saved = new Set(savedRows.map((row) => row.opportunityId));

  const items = rankOpportunities(volunteer, rows)
    .filter((row) => row.match.score >= MATCH_STRIP_MIN_SCORE)
    .slice(0, limit)
    .map(({ opportunity, match }) => ({
      ...opportunity,
      match,
      saved: saved.has(opportunity.id),
    }));

  return { items, meta: { limit, minScore: MATCH_STRIP_MIN_SCORE, candidates: rows.length } };
}

// ── NEW_MATCHING_OPPORTUNITY fan-out on first publish ──────────

const MATCH_NOTIFY_SELECT = {
  id: true,
  slug: true,
  titleAr: true,
  titleFr: true,
  titleEn: true,
  type: true,
  locationType: true,
  categoryId: true,
  countryId: true,
  wilayaId: true,
  cityId: true,
  category: { select: { slug: true } },
  skills: { select: { required: true, skill: { select: { id: true } } } },
  languages: { select: { languageId: true } },
} as const satisfies Prisma.OpportunitySelect;

const MATCH_NOTICE: Record<LocaleCode, { title: string; body: string }> = {
  ar: {
    title: 'فرصة جديدة تناسب مهاراتك',
    body: 'نُشرت «{opportunity}» وتتطابق مع مهاراتك واهتماماتك — تفقّد قسم «فرص تناسبك» في لوحتك.',
  },
  fr: {
    title: 'Une nouvelle opportunité vous correspond',
    body: '«{opportunity}» vient d’être publiée et correspond à vos compétences et centres d’intérêt — consultez «Opportunités qui vous correspondent » dans votre tableau de bord.',
  },
  en: {
    title: 'A new opportunity matches your profile',
    body: '“{opportunity}” was just published and fits your skills and interests — check “Matched for you” on your dashboard.',
  },
};

function localizedTitle(
  row: { titleAr: string; titleFr: string; titleEn: string },
  locale: LocaleCode,
): string {
  return locale === 'ar' ? row.titleAr : locale === 'fr' ? row.titleFr : row.titleEn;
}

/**
 * Bounded fan-out after the first publish. Candidates come from indexed OR
 * terms (shared skill / same wilaya / shared category interest), are scored
 * with the same engine as the strip, and only scores ≥ threshold notify —
 * capped at MATCH_NOTIFY_CAP. Failures propagate to the caller, which
 * deliberately fire-and-forgets (a notification outage must never fail the
 * publish itself).
 */
export async function notifyMatchingVolunteers(opportunityId: string): Promise<void> {
  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, deletedAt: null },
    select: MATCH_NOTIFY_SELECT,
  });
  if (!opportunity) return;

  const signals = buildOpportunitySignals(opportunity);
  const skillIds = [...signals.requiredSkillIds, ...signals.optionalSkillIds];
  const interestCodes = signals.categoryInterestCodes;
  const or: Prisma.VolunteerProfileWhereInput[] = [];
  if (skillIds.length > 0) or.push({ skills: { some: { skillId: { in: skillIds } } } });
  if (opportunity.wilayaId) or.push({ wilayaId: opportunity.wilayaId });
  if (interestCodes.length > 0) {
    or.push({ interests: { some: { interest: { code: { in: [...interestCodes] } } } } });
  }
  // No honest candidate basis (no skills, no wilaya, no category interest)
  // → nobody is notified rather than spraying the whole table.
  if (or.length === 0) return;

  const rows = await prisma.volunteerProfile.findMany({
    where: { user: { deletedAt: null }, OR: or },
    select: {
      id: true,
      userId: true,
      wilayaId: true,
      cityId: true,
      availability: true,
      onlinePreference: true,
      internationalPreference: true,
      skills: { select: { skillId: true } },
      interests: { select: { interest: { select: { code: true } } } },
      languages: { select: { languageId: true } },
      user: { select: { preferredLanguage: true } },
    },
    take: MATCH_NOTIFY_SCAN_CAP,
  });
  if (rows.length === 0) return;

  // Real verified hours for the scanned set — one aggregate, exact scores.
  const hours = await prisma.volunteerHour.groupBy({
    by: ['volunteerProfileId'],
    where: { volunteerProfileId: { in: rows.map((row) => row.id) }, status: 'VERIFIED' },
    _sum: { hours: true },
  });
  const hoursByProfile = new Map(
    hours.map((row) => [row.volunteerProfileId, row._sum.hours?.toNumber() ?? 0]),
  );

  const matched = rows
    .map((row) => ({
      row,
      match: matchOpportunity(
        buildVolunteerSignals({ ...row, verifiedHours: hoursByProfile.get(row.id) ?? 0 }),
        signals,
      ),
    }))
    .filter((entry) => entry.match.score >= MATCH_NOTIFY_MIN_SCORE)
    .slice(0, MATCH_NOTIFY_CAP);

  for (const { row } of matched) {
    const locale = resolveLocale(row.user.preferredLanguage.toLowerCase());
    const copy = MATCH_NOTICE[locale];
    await notify({
      userId: row.userId,
      type: 'NEW_MATCHING_OPPORTUNITY',
      title: copy.title,
      body: copy.body.replace('{opportunity}', localizedTitle(opportunity, locale)),
      data: { opportunityId: opportunity.id, slug: opportunity.slug },
    });
  }
}

export const recommendationRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/me/recommendations',
    handler: recommend,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Ranked matching opportunities with transparent reason codes (top N)',
  },
];

/**
 * Fire-and-forget entry point for the publish paths — a notification outage
 * must never fail a transition (failures are logged loudly, the persisted
 * notification work is what fans out below).
 */
export function announceMatching(opportunityId: string): void {
  void notifyMatchingVolunteers(opportunityId).catch((error: unknown) => {
    console.error('[matching] NEW_MATCHING_OPPORTUNITY fan-out failed', {
      opportunityId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
