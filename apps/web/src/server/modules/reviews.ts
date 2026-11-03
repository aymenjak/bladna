// Participant reviews & ratings (P24).
//
// An initiative page carries social proof from people who actually took part:
// a 1–5 rating plus an optional written body, one row per author per
// initiative (compound unique — a second POST is a 409, edits go through
// PATCH). Reading is public; writing requires the author to have an ACCEPTED
// application on *this* initiative or VERIFIED hours tied to it (activity or
// attendance), and `source` records which path qualified them at review time.
//
// Public authorship without a privacy leak: the display name is emitted only
// for authors with an opt-in `publicProfile` — everyone else renders as a
// neutral "verified participant" label, so a review never de-anonymizes a
// volunteer who never joined the directory.
//
// `GET` is viewer-aware: with a session it also answers whether the caller is
// eligible and carries their own review (edit/delete anchors), anonymous
// callers get `eligible: false` and no identity — one round trip for the page.

import { getPrisma } from '@bladna/database';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  createReviewSchema,
  opportunityParamsSchema,
  paginationQuerySchema,
  reviewParamsSchema,
  updateReviewSchema,
} from '@bladna/validation';
import { getSessionUser, requireAuth } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

/** Which eligibility path qualified the author (mirrors the `ReviewSource` enum). */
export type ReviewEligibility = 'PARTICIPANT' | 'HOURS';

const REVIEW_SELECT = {
  id: true,
  rating: true,
  body: true,
  source: true,
  authorId: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: {
      firstName: true,
      lastName: true,
      volunteerProfile: { select: { publicProfile: true } },
    },
  },
} as const;

/** Reviews live on the volunteer profile — org/admin sessions get 409. */
async function requireProfileId(userId: string): Promise<string> {
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');
  return profile.id;
}

async function publishedOpportunity(slug: string): Promise<{ id: string }> {
  const opportunity = await getPrisma().opportunity.findFirst({
    where: { slug, status: 'PUBLISHED', deletedAt: null },
    select: { id: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');
  return opportunity;
}

/**
 * P24 eligibility for ONE initiative: an ACCEPTED application first, else
 * VERIFIED hours tied to it through the activity or the attendance row.
 */
export async function eligibilityFor(
  opportunityId: string,
  profileId: string,
): Promise<ReviewEligibility | null> {
  const prisma = getPrisma();
  const application = await prisma.opportunityApplication.findFirst({
    where: { opportunityId, volunteerProfileId: profileId, status: 'ACCEPTED' },
    select: { id: true },
  });
  if (application) return 'PARTICIPANT';
  const hours = await prisma.volunteerHour.findFirst({
    where: {
      volunteerProfileId: profileId,
      status: 'VERIFIED',
      OR: [{ activity: { opportunityId } }, { attendance: { opportunityId } }],
    },
    select: { id: true },
  });
  return hours ? 'HOURS' : null;
}

type ReviewRow = {
  id: string;
  rating: number;
  body: string | null;
  source: ReviewEligibility;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    firstName: string;
    lastName: string;
    volunteerProfile: { publicProfile: boolean } | null;
  };
};

/** Public projection: name only when the author opted into a public profile. */
function projectReview(row: ReviewRow, viewerUserId: string | null) {
  const publicProfile = row.author.volunteerProfile?.publicProfile === true;
  return {
    id: row.id,
    rating: row.rating,
    body: row.body,
    source: row.source,
    // ISO strings: identical to what JSON over HTTP produces, so the SSR and
    // API paths hand the UI the very same shape.
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isMine: viewerUserId !== null && row.authorId === viewerUserId,
    author: {
      name: publicProfile ? `${row.author.firstName} ${row.author.lastName}`.trim() : null,
    },
  };
}

/** Public, viewer-aware list — also invoked SSR by the detail page. */
export async function list(ctx: RequestContext): Promise<unknown> {
  const { slug } = pathParams(ctx, opportunityParamsSchema);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const opportunity = await publishedOpportunity(slug);
  const session = await getSessionUser(ctx);
  const prisma = getPrisma();

  const where = { opportunityId: opportunity.id };
  const [total, rows, aggregate, distribution] = await Promise.all([
    prisma.opportunityReview.count({ where }),
    prisma.opportunityReview.findMany({
      where,
      select: REVIEW_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.opportunityReview.aggregate({ where, _avg: { rating: true } }),
    prisma.opportunityReview.groupBy({ by: ['rating'], where, _count: { _all: true } }),
  ]);

  // 5-slot histogram (rating 1..5) so the section can show spread, not just mean.
  const histogram = [1, 2, 3, 4, 5].map(
    (rating) => distribution.find((row) => row.rating === rating)?._count._all ?? 0,
  );
  const average = aggregate._avg.rating ?? 0;

  // Viewer state: eligibility + their own review (edit/delete anchor) — or the
  // anonymous triple of falses, never an identity leak.
  const viewer: {
    authenticated: boolean;
    eligible: boolean;
    eligibility: ReviewEligibility | null;
    review: { id: string; rating: number; body: string | null } | null;
  } = { authenticated: session !== null, eligible: false, eligibility: null, review: null };
  if (session) {
    const profile = await prisma.volunteerProfile.findUnique({
      where: { userId: session.userId },
      select: { id: true },
    });
    if (profile) {
      const [eligibility, own] = await Promise.all([
        eligibilityFor(opportunity.id, profile.id),
        prisma.opportunityReview.findUnique({
          where: {
            opportunityId_authorId: { opportunityId: opportunity.id, authorId: session.userId },
          },
          select: { id: true, rating: true, body: true },
        }),
      ]);
      viewer.eligible = eligibility !== null;
      viewer.eligibility = eligibility;
      viewer.review = own;
    }
  }

  return {
    items: rows.map((row) => projectReview(row, session?.userId ?? null)),
    meta: buildPageMeta(total, { page, limit }),
    stats: {
      count: total,
      average: Math.round(average * 100) / 100,
      distribution: histogram,
    },
    viewer,
  };
}

async function create(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { slug } = pathParams(ctx, opportunityParamsSchema);
  const input = await body(ctx, createReviewSchema);
  const profileId = await requireProfileId(user.userId);
  const opportunity = await publishedOpportunity(slug);

  const source = await eligibilityFor(opportunity.id, profileId);
  if (!source) {
    throw AppError.forbidden(
      'Reviews come from accepted participants and volunteers with verified hours.',
    );
  }

  // One clock reading for both stamps: creation is not an edit, and the UI
  // derives its "edited" marker from `updatedAt !== createdAt`.
  const now = new Date();
  try {
    const review = await getPrisma().opportunityReview.create({
      data: {
        opportunityId: opportunity.id,
        authorId: user.userId,
        rating: input.rating,
        body: input.body || null,
        source,
        createdAt: now,
        updatedAt: now,
      },
      select: { id: true, rating: true, body: true, source: true, createdAt: true },
    });
    await audit({
      actorUserId: user.userId,
      action: 'opportunity.review',
      entityType: 'opportunityReview',
      entityId: review.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { review };
  } catch (error) {
    // Compound unique: a double-submit or a second review converges on 409.
    if (isUniqueViolation(error)) {
      throw AppError.conflict('You have already reviewed this initiative.');
    }
    throw error;
  }
}

async function update(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { slug, reviewId } = pathParams(ctx, reviewParamsSchema);
  const input = await body(ctx, updateReviewSchema);
  const opportunity = await publishedOpportunity(slug);
  const prisma = getPrisma();

  // Foreign rows read as 404 — an author id must not be probeable.
  const existing = await prisma.opportunityReview.findFirst({
    where: { id: reviewId, opportunityId: opportunity.id, authorId: user.userId },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound('Review not found.');

  const review = await prisma.opportunityReview.update({
    where: { id: reviewId },
    data: {
      ...(input.rating !== undefined ? { rating: input.rating } : {}),
      ...(input.body !== undefined ? { body: input.body?.trim() || null } : {}),
    },
    select: { id: true, rating: true, body: true, source: true, updatedAt: true },
  });

  await audit({
    actorUserId: user.userId,
    action: 'opportunity.review.update',
    entityType: 'opportunityReview',
    entityId: reviewId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { review };
}

async function remove(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { slug, reviewId } = pathParams(ctx, reviewParamsSchema);
  const opportunity = await publishedOpportunity(slug);

  // Idempotent like the saved-opportunities DELETE: removing an absent row
  // still answers `deleted: false`, a real removal is audited.
  const { count } = await getPrisma().opportunityReview.deleteMany({
    where: { id: reviewId, opportunityId: opportunity.id, authorId: user.userId },
  });
  if (count > 0) {
    await audit({
      actorUserId: user.userId,
      action: 'opportunity.review.delete',
      entityType: 'opportunityReview',
      entityId: reviewId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }
  return { deleted: count > 0 };
}

export const reviewRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/opportunities/:slug/reviews',
    handler: list,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Reviews + rating stats for one initiative (viewer-aware)',
  },
  {
    method: 'POST',
    path: '/opportunities/:slug/reviews',
    handler: create,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Leave a review (eligible participants, one per author, audited)',
  },
  {
    method: 'PATCH',
    path: '/opportunities/:slug/reviews/:reviewId',
    handler: update,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Edit your own review (rating and/or body)',
  },
  {
    method: 'DELETE',
    path: '/opportunities/:slug/reviews/:reviewId',
    handler: remove,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Delete your own review (idempotent, audited)',
  },
];
