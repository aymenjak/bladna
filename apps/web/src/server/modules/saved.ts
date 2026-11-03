// Saved opportunities / "favorites" (P5).
//
// The `SavedOpportunity` model shipped with the schema but had no route or UI
// — this module is its consumer: a volunteer bookmarks an initiative
// (idempotent POST/DELETE) and reads the list back (paginated, with an
// optional exact-id membership check that lets the save button learn its
// initial state without a dedicated status endpoint). The list keeps rows
// whose opportunity was later suspended/rejected (still non-deleted) so the
// UI can say "no longer open" instead of silently dropping a bookmark;
// deleted initiatives fall out through the `deletedAt` guard.

import { getPrisma } from '@bladna/database';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import { idParamsSchema, savedListQuerySchema } from '@bladna/validation';
import { requireAuth } from '../guards';
import { pathParams, query, type RequestContext } from '../http';
import { LIST_SELECT } from '../opportunity-select';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

/** Favorites live on the volunteer profile — org/admin sessions get 409. */
async function requireProfileId(userId: string): Promise<string> {
  const profile = await getPrisma().volunteerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw AppError.businessRule('Complete your volunteer profile first.');
  return profile.id;
}

async function listSaved(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, savedListQuerySchema);
  const user = await requireAuth(ctx);
  const profileId = await requireProfileId(user.userId);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });

  const where = {
    volunteerProfileId: profileId,
    ...(f.opportunityId ? { opportunityId: f.opportunityId } : {}),
    opportunity: { deletedAt: null },
  };
  const prisma = getPrisma();
  const [total, rows] = await Promise.all([
    prisma.savedOpportunity.count({ where }),
    prisma.savedOpportunity.findMany({
      where,
      select: {
        opportunityId: true,
        createdAt: true,
        opportunity: { select: LIST_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => ({ ...row.opportunity, savedAt: row.createdAt }));
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function saveOpportunity(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const user = await requireAuth(ctx);
  const profileId = await requireProfileId(user.userId);

  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, deletedAt: null },
    select: { id: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  // Compound-unique upsert → double-clicks and retries converge on one row.
  const row = await prisma.savedOpportunity.upsert({
    where: {
      volunteerProfileId_opportunityId: {
        volunteerProfileId: profileId,
        opportunityId: id,
      },
    },
    create: { volunteerProfileId: profileId, opportunityId: id },
    update: {},
    select: { createdAt: true },
  });

  await audit({
    actorUserId: user.userId,
    action: 'opportunity.save',
    entityType: 'savedOpportunity',
    entityId: id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { saved: true, savedAt: row.createdAt };
}

async function removeSaved(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const user = await requireAuth(ctx);
  const profileId = await requireProfileId(user.userId);

  const { count } = await getPrisma().savedOpportunity.deleteMany({
    where: { volunteerProfileId: profileId, opportunityId: id },
  });
  if (count > 0) {
    await audit({
      actorUserId: user.userId,
      action: 'opportunity.unsave',
      entityType: 'savedOpportunity',
      entityId: id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
  }
  // Idempotent: removing an absent row still answers `saved: false`.
  return { saved: false };
}

export const savedRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/me/saved-opportunities',
    handler: listSaved,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Own saved opportunities (paginated; ?opportunityId= membership check)',
  },
  {
    method: 'POST',
    path: '/me/saved-opportunities/:id',
    handler: saveOpportunity,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Save an opportunity (idempotent)',
  },
  {
    method: 'DELETE',
    path: '/me/saved-opportunities/:id',
    handler: removeSaved,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Remove a saved opportunity (idempotent)',
  },
];
