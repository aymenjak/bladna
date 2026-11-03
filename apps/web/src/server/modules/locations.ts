// Location reads: countries, wilayas, cities (spec §37, §41).
// Algeria-first: wilayas/cities are the canonical division data used by
// profiles, opportunities and maps. Read-only, paginated (§57).

import type { Prisma } from '@bladna/database';
import { getPrisma } from '@bladna/database';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import { paginationQuerySchema, uuidSchema } from '@bladna/validation';
import { z } from 'zod';
import { query, type RequestContext } from '../http';
import type { AppRoute } from '../router';

const countriesQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(300).default(300),
  q: z.string().trim().max(80).optional(),
});

const wilayasQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(100),
  countryId: uuidSchema.optional(),
  q: z.string().trim().max(80).optional(),
});

const citiesQuerySchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  wilayaId: uuidSchema.optional(),
  q: z.string().trim().max(80).optional(),
  /** Nearest-cities lookup (spec §9 «قريبة مني»): order by squared distance. */
  nearLat: z.coerce.number().min(-90).max(90).optional(),
  nearLng: z.coerce.number().min(-180).max(180).optional(),
});

async function listCountries(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, countriesQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.CountryWhereInput = f.q
    ? {
        OR: [
          { code: { contains: f.q.toUpperCase(), mode: 'insensitive' } },
          { nameAr: { contains: f.q, mode: 'insensitive' } },
          { nameFr: { contains: f.q, mode: 'insensitive' } },
          { nameEn: { contains: f.q, mode: 'insensitive' } },
        ],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.country.count({ where }),
    prisma.country.findMany({ where, orderBy: { nameEn: 'asc' }, skip, take }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

export async function listWilayas(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, wilayasQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.WilayaWhereInput = {
    ...(f.countryId ? { countryId: f.countryId } : {}),
    ...(f.q
      ? {
          OR: [
            { code: { contains: f.q, mode: 'insensitive' } },
            { nameAr: { contains: f.q, mode: 'insensitive' } },
            { nameFr: { contains: f.q, mode: 'insensitive' } },
            { nameEn: { contains: f.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.wilaya.count({ where }),
    prisma.wilaya.findMany({
      where,
      include: {
        country: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
        _count: { select: { cities: true } },
      },
      orderBy: { code: 'asc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function listCities(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, citiesQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  // Nearest-first ordering needs arithmetic on two columns, which Prisma
  // where/orderBy cannot express — deterministic squared distance in SQL.
  if (f.nearLat !== undefined && f.nearLng !== undefined) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "City"
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY (("latitude" - ${f.nearLat}) * ("latitude" - ${f.nearLat})
              + ("longitude" - ${f.nearLng}) * ("longitude" - ${f.nearLng}))
      LIMIT ${take}`;
    const ids = rows.map((row) => row.id);
    const items = ids.length > 0 ? await prisma.city.findMany({ where: { id: { in: ids } } }) : [];
    return { items, meta: buildPageMeta(items.length, { page, limit }) };
  }

  const where: Prisma.CityWhereInput = {
    ...(f.wilayaId ? { wilayaId: f.wilayaId } : {}),
    ...(f.q
      ? {
          OR: [
            { nameAr: { contains: f.q, mode: 'insensitive' } },
            { nameFr: { contains: f.q, mode: 'insensitive' } },
            { nameEn: { contains: f.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.city.count({ where }),
    prisma.city.findMany({ where, orderBy: { nameEn: 'asc' }, skip, take }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

export const locationRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/locations/countries',
    handler: listCountries,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List countries',
  },
  {
    method: 'GET',
    path: '/locations/wilayas',
    handler: listWilayas,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List wilayas (optionally by country)',
  },
  {
    method: 'GET',
    path: '/locations/cities',
    handler: listCities,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List cities (optionally by wilaya)',
  },
];
