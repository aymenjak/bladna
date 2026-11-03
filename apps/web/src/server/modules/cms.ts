// CMS module: public content pages / announcements / featured / home / flags
// plus the admin CRUD behind them.
//
// Public reads only ever surface live content: PUBLISHED pages, announcements
// inside their active window, active placements whose target is still live.
// Admin writes require the `content.manage` system permission and are audited
// with before/after snapshots. Feature-flag admin CRUD lives in admin.ts.

import { getPrisma, type Prisma } from '@bladna/database';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  announcementSchema,
  contentPageSchema,
  featuredPlacementSchema,
  homeContentSchema,
  idParamsSchema,
  paginationQuerySchema,
} from '@bladna/validation';
import { z } from 'zod';
import { requireSystemPermission } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { getFeatureFlags } from '../infra/flags';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

const PAGE_SELECT = {
  id: true,
  slug: true,
  type: true,
  status: true,
  titleAr: true,
  titleFr: true,
  titleEn: true,
  bodyAr: true,
  bodyFr: true,
  bodyEn: true,
  seoDescription: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ANNOUNCEMENT_SELECT = {
  id: true,
  titleAr: true,
  titleFr: true,
  titleEn: true,
  bodyAr: true,
  bodyFr: true,
  bodyEn: true,
  active: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PLACEMENT_SELECT = {
  id: true,
  section: true,
  targetType: true,
  targetId: true,
  position: true,
  sponsored: true,
  label: true,
  active: true,
  createdAt: true,
} as const;

const pageListQuery = paginationQuerySchema.extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  type: z.enum(['PAGE', 'FAQ', 'GUIDE', 'SAFETY', 'LEGAL']).optional(),
});

const placementListQuery = paginationQuerySchema.extend({
  section: z
    .enum([
      'HOME_HERO',
      'HOME_FEATURED_OPPORTUNITIES',
      'HOME_FEATURED_ORGANIZATIONS',
      'HOME_CAMPAIGNS',
      'DISCOVER_FEATURED',
    ])
    .optional(),
  active: z.enum(['true', 'false']).optional(),
});

const slugParams = z.object({ slug: z.string().trim().min(2).max(80) });

/** Announcement patch: partial create form (the create schema is a ZodEffects,
 *  so `.partial()` is taken from its inner object and the ordering check is
 *  re-applied in the handler against the MERGED row, not just the patch). */
const announcementPatchSchema = announcementSchema.innerType().partial();

// ── Public surface ─────────────────────────────────────────────

async function listPublicPages(ctx: RequestContext): Promise<unknown> {
  const f = query(
    ctx,
    paginationQuerySchema.extend({
      type: z.enum(['PAGE', 'FAQ', 'GUIDE', 'SAFETY', 'LEGAL']).optional(),
    }),
  );
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  // Public lists only ever contain PUBLISHED rows, whatever the query says.
  const where = { status: 'PUBLISHED' as const, ...(f.type ? { type: f.type } : {}) };
  const [total, items] = await Promise.all([
    prisma.contentPage.count({ where }),
    prisma.contentPage.findMany({
      where,
      select: PAGE_SELECT,
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function getPublicPage(ctx: RequestContext): Promise<unknown> {
  const { slug } = pathParams(ctx, slugParams);
  const page = await getPrisma().contentPage.findFirst({
    where: { slug, status: 'PUBLISHED' },
    select: PAGE_SELECT,
  });
  // A draft/archived page is indistinguishable from a missing one publicly.
  if (!page) throw AppError.notFound('Page not found.');
  return { page };
}

async function listAnnouncements(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();
  const now = new Date();

  const where = {
    active: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
  };
  const [total, items] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.findMany({
      where,
      select: ANNOUNCEMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

interface ResolvedPlacement {
  id: string;
  section: string;
  targetType: string;
  targetId: string;
  position: number;
  sponsored: boolean;
  label: string | null;
  target: Record<string, unknown> | null;
}

async function listFeatured(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = { active: true };
  const [total, placements] = await Promise.all([
    prisma.featuredPlacement.count({ where }),
    prisma.featuredPlacement.findMany({
      where,
      select: PLACEMENT_SELECT,
      orderBy: [{ section: 'asc' }, { position: 'asc' }],
      skip,
      take,
    }),
  ]);

  // Resolve the live target per placement; a placement whose target went dark
  // (draft, suspended, archived…) is dropped from the response entirely.
  const items: ResolvedPlacement[] = [];
  for (const p of placements) {
    let target: Record<string, unknown> | null = null;
    if (p.targetType === 'OPPORTUNITY') {
      target = await prisma.opportunity.findFirst({
        where: { id: p.targetId, status: 'PUBLISHED', deletedAt: null },
        select: {
          id: true,
          slug: true,
          titleAr: true,
          titleFr: true,
          titleEn: true,
          status: true,
          locationType: true,
          startDate: true,
          endDate: true,
        },
      });
    } else if (p.targetType === 'ORGANIZATION') {
      target = await prisma.organization.findFirst({
        where: { id: p.targetId, status: 'ACTIVE', deletedAt: null },
        select: {
          id: true,
          name: true,
          slug: true,
          logo: true,
          organizationType: true,
          verificationStatus: true,
          trustLevel: true,
        },
      });
    } else if (p.targetType === 'CAMPAIGN') {
      target = await prisma.campaign.findFirst({
        where: { id: p.targetId, status: 'ACTIVE' },
        select: { id: true, name: true, slug: true, coverImage: true, status: true, endDate: true },
      });
    }
    if (target) items.push({ ...p, target });
  }

  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function getHome(): Promise<unknown> {
  const prisma = getPrisma();
  const home = await prisma.homeContent.findFirst({ orderBy: { updatedAt: 'desc' } });
  let announcement: Record<string, unknown> | null = null;
  if (home?.announcementId) {
    announcement = await prisma.announcement.findFirst({
      where: { id: home.announcementId, active: true },
      select: ANNOUNCEMENT_SELECT,
    });
  }
  return { home: home ?? null, announcement };
}

async function getFlags(): Promise<unknown> {
  return { flags: await getFeatureFlags() };
}

// ── Admin: content pages ───────────────────────────────────────

async function adminListPages(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'content.manage');
  const f = query(ctx, pageListQuery);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.ContentPageWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.type) where.type = f.type;

  const [total, items] = await Promise.all([
    prisma.contentPage.count({ where }),
    prisma.contentPage.findMany({
      where,
      select: PAGE_SELECT,
      orderBy: [{ updatedAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function adminCreatePage(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const input = await body(ctx, contentPageSchema);
  const prisma = getPrisma();

  const clash = await prisma.contentPage.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (clash) throw AppError.conflict('A page with this slug already exists.');

  try {
    const page = await prisma.contentPage.create({
      data: {
        slug: input.slug,
        type: input.type,
        status: input.status,
        titleAr: input.titleAr,
        titleFr: input.titleFr,
        titleEn: input.titleEn,
        bodyAr: input.bodyAr,
        bodyFr: input.bodyFr,
        bodyEn: input.bodyEn,
        seoDescription: input.seoDescription ?? null,
        updatedById: user.userId,
      },
      select: PAGE_SELECT,
    });
    await audit({
      actorUserId: user.userId,
      action: 'cms.page.create',
      entityType: 'content_page',
      entityId: page.id,
      after: { slug: page.slug, status: page.status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { page };
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('A page with this slug already exists.');
    throw error;
  }
}

async function adminUpdatePage(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const user = await requireSystemPermission(ctx, 'content.manage');
  const input = await body(ctx, contentPageSchema.partial());
  const prisma = getPrisma();

  const existing = await prisma.contentPage.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Page not found.');

  if (input.slug && input.slug !== existing.slug) {
    const clash = await prisma.contentPage.findUnique({
      where: { slug: input.slug },
      select: { id: true },
    });
    if (clash) throw AppError.conflict('A page with this slug already exists.');
  }

  try {
    const page = await prisma.contentPage.update({
      where: { id },
      data: {
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.titleAr !== undefined ? { titleAr: input.titleAr } : {}),
        ...(input.titleFr !== undefined ? { titleFr: input.titleFr } : {}),
        ...(input.titleEn !== undefined ? { titleEn: input.titleEn } : {}),
        ...(input.bodyAr !== undefined ? { bodyAr: input.bodyAr } : {}),
        ...(input.bodyFr !== undefined ? { bodyFr: input.bodyFr } : {}),
        ...(input.bodyEn !== undefined ? { bodyEn: input.bodyEn } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
        updatedById: user.userId,
      },
      select: PAGE_SELECT,
    });
    await audit({
      actorUserId: user.userId,
      action: 'cms.page.update',
      entityType: 'content_page',
      entityId: id,
      before: { status: existing.status, slug: existing.slug },
      after: { status: page.status, slug: page.slug },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { page };
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('A page with this slug already exists.');
    throw error;
  }
}

async function adminDeletePage(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const user = await requireSystemPermission(ctx, 'content.manage');
  const prisma = getPrisma();

  const existing = await prisma.contentPage.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) throw AppError.notFound('Page not found.');
  await prisma.contentPage.delete({ where: { id } });
  await audit({
    actorUserId: user.userId,
    action: 'cms.page.delete',
    entityType: 'content_page',
    entityId: id,
    before: { slug: existing.slug },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { deleted: true };
}

// ── Admin: announcements ───────────────────────────────────────

async function adminListAnnouncements(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'content.manage');
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const [total, items] = await Promise.all([
    prisma.announcement.count(),
    prisma.announcement.findMany({
      select: ANNOUNCEMENT_SELECT,
      orderBy: [{ createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function adminCreateAnnouncement(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const input = await body(ctx, announcementSchema);
  const prisma = getPrisma();

  const announcement = await prisma.announcement.create({
    data: {
      titleAr: input.titleAr,
      titleFr: input.titleFr,
      titleEn: input.titleEn,
      bodyAr: input.bodyAr,
      bodyFr: input.bodyFr,
      bodyEn: input.bodyEn,
      active: input.active,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
    },
    select: ANNOUNCEMENT_SELECT,
  });
  await audit({
    actorUserId: user.userId,
    action: 'cms.announcement.create',
    entityType: 'announcement',
    entityId: announcement.id,
    after: {
      active: announcement.active,
      startsAt: announcement.startsAt,
      endsAt: announcement.endsAt,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { announcement };
}

async function adminUpdateAnnouncement(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const user = await requireSystemPermission(ctx, 'content.manage');
  const input = await body(ctx, announcementPatchSchema);
  const prisma = getPrisma();

  const existing = await prisma.announcement.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Announcement not found.');

  // Ordering must hold on the merged row, not only on the patched fields.
  const mergedStart = input.startsAt !== undefined ? input.startsAt : existing.startsAt;
  const mergedEnd = input.endsAt !== undefined ? input.endsAt : existing.endsAt;
  if (mergedStart && mergedEnd && mergedEnd.getTime() < mergedStart.getTime()) {
    throw AppError.validation('endsAt must not be before startsAt.', [
      { path: 'endsAt', code: 'invalid_order', message: 'endsAt must not be before startsAt.' },
    ]);
  }

  const announcement = await prisma.announcement.update({
    where: { id },
    data: {
      ...(input.titleAr !== undefined ? { titleAr: input.titleAr } : {}),
      ...(input.titleFr !== undefined ? { titleFr: input.titleFr } : {}),
      ...(input.titleEn !== undefined ? { titleEn: input.titleEn } : {}),
      ...(input.bodyAr !== undefined ? { bodyAr: input.bodyAr } : {}),
      ...(input.bodyFr !== undefined ? { bodyFr: input.bodyFr } : {}),
      ...(input.bodyEn !== undefined ? { bodyEn: input.bodyEn } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
    },
    select: ANNOUNCEMENT_SELECT,
  });
  await audit({
    actorUserId: user.userId,
    action: 'cms.announcement.update',
    entityType: 'announcement',
    entityId: id,
    before: { active: existing.active, startsAt: existing.startsAt, endsAt: existing.endsAt },
    after: {
      active: announcement.active,
      startsAt: announcement.startsAt,
      endsAt: announcement.endsAt,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { announcement };
}

async function adminDeleteAnnouncement(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const user = await requireSystemPermission(ctx, 'content.manage');
  const prisma = getPrisma();

  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, titleEn: true },
  });
  if (!existing) throw AppError.notFound('Announcement not found.');
  await prisma.announcement.delete({ where: { id } });
  await audit({
    actorUserId: user.userId,
    action: 'cms.announcement.delete',
    entityType: 'announcement',
    entityId: id,
    before: { titleEn: existing.titleEn },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { deleted: true };
}

// ── Admin: featured placements ─────────────────────────────────

async function adminListPlacements(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'content.manage');
  const f = query(ctx, placementListQuery);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.FeaturedPlacementWhereInput = {};
  if (f.section) where.section = f.section;
  if (f.active !== undefined) where.active = f.active === 'true';

  const [total, items] = await Promise.all([
    prisma.featuredPlacement.count({ where }),
    prisma.featuredPlacement.findMany({
      where,
      select: PLACEMENT_SELECT,
      orderBy: [{ section: 'asc' }, { position: 'asc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function adminCreatePlacement(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const input = await body(ctx, featuredPlacementSchema);
  const prisma = getPrisma();

  // The target must exist — featuring a missing record would render an empty
  // card forever. Live-status filtering happens on the public read.
  if (input.targetType === 'OPPORTUNITY') {
    const target = await prisma.opportunity.findFirst({
      where: { id: input.targetId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw AppError.validation('Referenced opportunity does not exist.');
  } else if (input.targetType === 'ORGANIZATION') {
    const target = await prisma.organization.findFirst({
      where: { id: input.targetId, deletedAt: null },
      select: { id: true },
    });
    if (!target) throw AppError.validation('Referenced organization does not exist.');
  } else {
    const target = await prisma.campaign.findFirst({
      where: { id: input.targetId },
      select: { id: true },
    });
    if (!target) throw AppError.validation('Referenced campaign does not exist.');
  }

  try {
    const placement = await prisma.featuredPlacement.create({
      data: {
        section: input.section,
        targetType: input.targetType,
        targetId: input.targetId,
        position: input.position,
        sponsored: input.sponsored,
        label: input.label ?? null,
        createdById: user.userId,
      },
      select: PLACEMENT_SELECT,
    });
    await audit({
      actorUserId: user.userId,
      action: 'cms.featured.create',
      entityType: 'featured_placement',
      entityId: placement.id,
      after: {
        section: placement.section,
        targetType: placement.targetType,
        targetId: placement.targetId,
      },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { placement };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('This target is already featured in that section.');
    }
    if (isForeignKeyViolation(error))
      throw AppError.validation('Referenced target does not exist.');
    throw error;
  }
}

async function adminDeletePlacement(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const user = await requireSystemPermission(ctx, 'content.manage');
  const prisma = getPrisma();

  const existing = await prisma.featuredPlacement.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Placement not found.');
  await prisma.featuredPlacement.delete({ where: { id } });
  await audit({
    actorUserId: user.userId,
    action: 'cms.featured.delete',
    entityType: 'featured_placement',
    entityId: id,
    before: {
      section: existing.section,
      targetType: existing.targetType,
      targetId: existing.targetId,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { deleted: true };
}

// ── Admin: home content ────────────────────────────────────────

async function adminUpsertHome(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const input = await body(ctx, homeContentSchema);
  const prisma = getPrisma();

  if (input.announcementId) {
    const announcement = await prisma.announcement.findUnique({
      where: { id: input.announcementId },
      select: { id: true },
    });
    if (!announcement) throw AppError.validation('Referenced announcement does not exist.');
  }

  const existing = await prisma.homeContent.findFirst({ orderBy: { updatedAt: 'desc' } });
  const data = {
    heroTitleAr: input.heroTitleAr,
    heroTitleFr: input.heroTitleFr,
    heroTitleEn: input.heroTitleEn,
    heroSubtitleAr: input.heroSubtitleAr ?? null,
    heroSubtitleFr: input.heroSubtitleFr ?? null,
    heroSubtitleEn: input.heroSubtitleEn ?? null,
    primaryCtaAr: input.primaryCtaAr,
    primaryCtaFr: input.primaryCtaFr,
    primaryCtaEn: input.primaryCtaEn,
    secondaryCtaAr: input.secondaryCtaAr,
    secondaryCtaFr: input.secondaryCtaFr,
    secondaryCtaEn: input.secondaryCtaEn,
    announcementId: input.announcementId ?? null,
    updatedById: user.userId,
  };
  const home = existing
    ? await prisma.homeContent.update({ where: { id: existing.id }, data })
    : await prisma.homeContent.create({ data });

  await audit({
    actorUserId: user.userId,
    action: 'cms.home.update',
    entityType: 'home_content',
    entityId: home.id,
    before: existing ? { announcementId: existing.announcementId } : undefined,
    after: { announcementId: home.announcementId },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { home };
}

// ── Route table (literals before :params per method) ───────────

export const cmsRoutes: AppRoute[] = [
  // public
  {
    method: 'GET',
    path: '/content/pages',
    handler: listPublicPages,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List published content pages',
  },
  {
    method: 'GET',
    path: '/announcements',
    handler: listAnnouncements,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Announcements inside their active window',
  },
  {
    method: 'GET',
    path: '/featured',
    handler: listFeatured,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Featured placements (dead targets dropped)',
  },
  {
    method: 'GET',
    path: '/home',
    handler: getHome,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Home page content (+ active announcement)',
  },
  {
    method: 'GET',
    path: '/flags',
    handler: getFlags,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Effective feature flag map',
  },
  {
    method: 'GET',
    path: '/content/pages/:slug',
    handler: getPublicPage,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Published page by slug (drafts 404)',
  },
  // admin: pages
  {
    method: 'GET',
    path: '/admin/content/pages',
    handler: adminListPages,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'All content pages (all statuses)',
  },
  {
    method: 'POST',
    path: '/admin/content/pages',
    handler: adminCreatePage,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Create a content page (audited)',
  },
  {
    method: 'PATCH',
    path: '/admin/content/pages/:id',
    handler: adminUpdatePage,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Update a content page (audited)',
  },
  {
    method: 'DELETE',
    path: '/admin/content/pages/:id',
    handler: adminDeletePage,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Delete a content page (audited)',
  },
  // admin: announcements
  {
    method: 'GET',
    path: '/admin/announcements',
    handler: adminListAnnouncements,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'All announcements (incl. scheduled)',
  },
  {
    method: 'POST',
    path: '/admin/announcements',
    handler: adminCreateAnnouncement,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Create an announcement (audited)',
  },
  {
    method: 'PATCH',
    path: '/admin/announcements/:id',
    handler: adminUpdateAnnouncement,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Update an announcement (merged window check)',
  },
  {
    method: 'DELETE',
    path: '/admin/announcements/:id',
    handler: adminDeleteAnnouncement,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Delete an announcement (audited)',
  },
  // admin: featured
  {
    method: 'GET',
    path: '/admin/featured',
    handler: adminListPlacements,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Featured placements (all, incl. inactive)',
  },
  {
    method: 'POST',
    path: '/admin/featured',
    handler: adminCreatePlacement,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Feature a target (existence-checked, audited)',
  },
  {
    method: 'DELETE',
    path: '/admin/featured/:id',
    handler: adminDeletePlacement,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Remove a featured placement (audited)',
  },
  // admin: home
  {
    method: 'POST',
    path: '/home',
    handler: adminUpsertHome,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Upsert home page content (singleton, audited)',
  },
];
