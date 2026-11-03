// Taxonomy reads: skills, languages, interests, categories (spec §41).
// Read-only reference data — the canonical rows are managed through seeds and
// admin tooling; every response paginates (§57).

import type { Prisma } from '@bladna/database';
import { getPrisma } from '@bladna/database';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import { paginationQuerySchema } from '@bladna/validation';
import { z } from 'zod';
import { query, type RequestContext } from '../http';
import type { AppRoute } from '../router';

const searchQuery = z.string().trim().max(80);

const skillsQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  q: searchQuery.optional(),
  category: searchQuery.optional(),
});

const languagesQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  q: searchQuery.optional(),
});

const interestsQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  q: searchQuery.optional(),
});

const categoriesQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  q: searchQuery.optional(),
});

export async function listSkills(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, skillsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SkillWhereInput = { active: true };
  if (f.category) where.category = { equals: f.category, mode: 'insensitive' };
  if (f.q) {
    where.OR = [
      { nameAr: { contains: f.q, mode: 'insensitive' } },
      { nameFr: { contains: f.q, mode: 'insensitive' } },
      { nameEn: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.skill.count({ where }),
    prisma.skill.findMany({
      where,
      orderBy: [{ category: 'asc' }, { nameFr: 'asc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function listLanguages(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, languagesQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.LanguageWhereInput = {};
  if (f.q) {
    where.OR = [
      { code: { contains: f.q, mode: 'insensitive' } },
      { nameAr: { contains: f.q, mode: 'insensitive' } },
      { nameFr: { contains: f.q, mode: 'insensitive' } },
      { nameEn: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.language.count({ where }),
    prisma.language.findMany({ where, orderBy: { nameEn: 'asc' }, skip, take }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function listInterests(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, interestsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.InterestWhereInput = { active: true };
  if (f.q) {
    where.OR = [
      { nameAr: { contains: f.q, mode: 'insensitive' } },
      { nameFr: { contains: f.q, mode: 'insensitive' } },
      { nameEn: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.interest.count({ where }),
    prisma.interest.findMany({ where, orderBy: { nameEn: 'asc' }, skip, take }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

export async function listCategories(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, categoriesQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.OpportunityCategoryWhereInput = { active: true };
  if (f.q) {
    where.OR = [
      { nameAr: { contains: f.q, mode: 'insensitive' } },
      { nameFr: { contains: f.q, mode: 'insensitive' } },
      { nameEn: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.opportunityCategory.count({ where }),
    prisma.opportunityCategory.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { nameFr: 'asc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

export const taxonomyRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/taxonomies/skills',
    handler: listSkills,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List skills',
  },
  {
    method: 'GET',
    path: '/taxonomies/languages',
    handler: listLanguages,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List languages',
  },
  {
    method: 'GET',
    path: '/taxonomies/interests',
    handler: listInterests,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List interests',
  },
  {
    method: 'GET',
    path: '/taxonomies/categories',
    handler: listCategories,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List opportunity categories',
  },
];
