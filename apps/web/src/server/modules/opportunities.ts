// Opportunities module (spec §37–§44, §107).
//
// Public: paginated discover (PostgreSQL FTS + trgm), detail by slug, view tracking.
// Tenant: org-scoped CRUD under /orgs/:orgId/opportunities with server-side RBAC
// (requireOrgMembership) and the explicit OPPORTUNITY_TRANSITIONS state machine —
// status only changes through POST .../transition, never through update payloads.

import { getPrisma, type Prisma } from '@bladna/database';
import {
  assertTransition,
  OPPORTUNITY_TRANSITIONS,
  organizationBadge,
  type Permission,
} from '@bladna/domain';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams, slugify, uniqueSlug } from '@bladna/utils';
import {
  adminOpportunitiesQuerySchema,
  adminOpportunityActionSchema,
  bulkTransitionSchema,
  createOpportunitySchema,
  idParamsSchema,
  opportunityFiltersSchema,
  opportunityParamsSchema,
  paginationQuerySchema,
  transitionOpportunitySchema,
  updateOpportunitySchema,
} from '@bladna/validation';
import { z } from 'zod';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireOrgMembership, requireSystemPermission } from '../guards';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prisma-errors';
import { LIST_SELECT } from '../opportunity-select';
import { audit } from '../services/audit';
import { announceMatching } from './matching';
import type { AppRoute } from '../router';

type TransitionAction = z.infer<typeof transitionOpportunitySchema>['action'];

const ACTION_TARGET: Record<
  TransitionAction,
  'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'SUSPENDED' | 'ARCHIVED' | 'DRAFT' | 'EXPIRED'
> = {
  SUBMIT_REVIEW: 'PENDING_REVIEW',
  PUBLISH: 'PUBLISHED',
  REJECT: 'REJECTED',
  SUSPEND: 'SUSPENDED',
  ARCHIVE: 'ARCHIVED',
  RESTORE_DRAFT: 'DRAFT',
  EXPIRE: 'EXPIRED',
};

/**
 * Platform moderation actions (the admin console) → target status. RESTORE
 * reinstates a suspended/expired listing directly (SUSPENDED → PUBLISHED is a
 * legal move); REJECTED/ARCHIVED rows still travel through DRAFT, and
 * assertTransition reports the legal targets on any mismatch.
 */
const ADMIN_ACTION_TARGET: Record<
  z.infer<typeof adminOpportunityActionSchema>['action'],
  'PUBLISHED' | 'REJECTED' | 'SUSPENDED'
> = {
  PUBLISH: 'PUBLISHED',
  REJECT: 'REJECTED',
  SUSPEND: 'SUSPENDED',
  RESTORE: 'PUBLISHED',
};

/**
 * Server-side permission required per transition. Publication and rejection
 * are moderation acts (review-before-publish): only `opportunity.moderate`
 * may move an opportunity to PUBLISHED or REJECTED — organizations submit
 * it for review, they never publish it themselves.
 */
const ACTION_PERMISSION: Record<TransitionAction, Permission> = {
  SUBMIT_REVIEW: 'opportunity.update',
  PUBLISH: 'opportunity.moderate',
  REJECT: 'opportunity.moderate',
  SUSPEND: 'opportunity.suspend:own',
  ARCHIVE: 'opportunity.update',
  RESTORE_DRAFT: 'opportunity.update',
  EXPIRE: 'opportunity.update',
};

const orgListSchema = paginationQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z
    .enum(['DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'SUSPENDED', 'EXPIRED', 'ARCHIVED'])
    .optional(),
  q: z.string().trim().max(120).optional(),
});

const discoverSchema = opportunityFiltersSchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

type DiscoverFilters = z.infer<typeof discoverSchema>;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  descriptionAr: true,
  descriptionFr: true,
  descriptionEn: true,
  // Initiative narrative + presentation + contact (spec §4).
  problemAr: true,
  problemFr: true,
  problemEn: true,
  objectiveAr: true,
  objectiveFr: true,
  objectiveEn: true,
  coverImage: true,
  contactName: true,
  contactPhone: true,
  contactEmail: true,
  address: true,
  sourceUrl: true,
  verificationStatus: true,
  verifiedAt: true,
  updatedAt: true,
  campaignId: true,
  organizationId: true,
  // Contact fallback: the detail page shows initiative contact details or the
  // organizer's own, so the organizer's channel must be available here.
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      logo: true,
      verificationStatus: true,
      trustLevel: true,
      organizationType: true,
      website: true,
      officialEmail: true,
      phone: true,
    },
  },
  country: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
  campaign: { select: { id: true, slug: true, name: true, status: true } },
  source: {
    select: {
      id: true,
      name: true,
      sourceType: true,
      url: true,
      domain: true,
      official: true,
      verified: true,
      lastCheckedAt: true,
    },
  },
  languages: {
    select: {
      required: true,
      language: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
    },
  },
  requirements: true,
  questions: {
    select: {
      id: true,
      promptAr: true,
      promptFr: true,
      promptEn: true,
      type: true,
      required: true,
      options: true,
      sortOrder: true,
    },
  },
} as const satisfies Prisma.OpportunitySelect;

const MAP_SELECT = {
  id: true,
  slug: true,
  titleAr: true,
  titleFr: true,
  titleEn: true,
  latitude: true,
  longitude: true,
  wilayaId: true,
  cityId: true,
  categoryId: true,
  locationType: true,
  type: true,
  // P11 — the side list (visible alternative to the pins) renders place and
  // date context, and the page header counts distinct wilayas.
  startDate: true,
  wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
  // City-level fallback (spec §16): an initiative without its own point is
  // pinned at its city — names ride along for the side list; coordinates are
  // folded into the flat lat/lng below.
  city: {
    select: { id: true, nameAr: true, nameFr: true, nameEn: true, latitude: true, longitude: true },
  },
} as const satisfies Prisma.OpportunitySelect;

/**
 * Full-text search: the GIN-indexed tsvector expression from migration 0002,
 * plus trigram-friendly ILIKE on the titles (the 'simple' dictionary does not
 * stem Arabic, so title matching carries language coverage).
 */
async function searchOpportunityIds(q: string): Promise<string[]> {
  const rows = await getPrisma().$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Opportunity"
    WHERE "deletedAt" IS NULL
      AND (
        to_tsvector('simple', coalesce("searchVector", '')) @@ plainto_tsquery('simple', ${q})
        OR lower("titleEn") LIKE '%' || lower(${q}) || '%'
        OR lower("titleFr") LIKE '%' || lower(${q}) || '%'
        OR "titleAr" LIKE '%' || ${q} || '%'
      )
    LIMIT 1000`;
  return rows.map((row) => row.id);
}

function buildDiscoverWhere(f: DiscoverFilters): Prisma.OpportunityWhereInput {
  const where: Prisma.OpportunityWhereInput = { deletedAt: null, status: 'PUBLISHED' };
  if (f.countryId) where.countryId = f.countryId;
  if (f.wilayaId) where.wilayaId = f.wilayaId;
  if (f.cityId) where.cityId = f.cityId;
  if (f.categoryId) where.categoryId = f.categoryId;
  if (f.type) where.type = f.type;
  if (f.locationType) where.locationType = f.locationType;
  if (f.organizationId) where.organizationId = f.organizationId;
  if (f.campaignId) where.campaignId = f.campaignId;
  if (f.skillIds?.length) where.skills = { some: { skillId: { in: f.skillIds } } };
  if (f.languageIds?.length) where.languages = { some: { languageId: { in: f.languageIds } } };
  if (f.verifiedOnly === 'true') where.organization = { verificationStatus: 'VERIFIED' };

  const and: Prisma.OpportunityWhereInput[] = [];

  // Map viewport (P3 / H5 "search this area"): own point inside the box, or
  // an ungeocoded row pinned at a city whose coordinates are inside it (the
  // same city-level fallback mode=map uses when rendering pins, so every pin
  // visible in the viewport matches this filter).
  if (f.bounds) {
    const [minLng, minLat, maxLng, maxLat] = f.bounds;
    and.push({
      OR: [
        { latitude: { gte: minLat, lte: maxLat }, longitude: { gte: minLng, lte: maxLng } },
        {
          AND: [
            { latitude: null },
            { longitude: null },
            {
              city: {
                latitude: { gte: minLat, lte: maxLat },
                longitude: { gte: minLng, lte: maxLng },
              },
            },
          ],
        },
      ],
    });
  }

  // mode=map (spec §16): every pin must land somewhere — require an own point
  // or a pinnable city (the same city-level fallback the renderer uses), so
  // placeless rows like ONLINE/NATIONAL initiatives never leak into the map
  // payload. They stay in the regular list; they just have nothing to pin.
  if (f.mode === 'map') {
    and.push({
      OR: [
        { AND: [{ latitude: { not: null } }, { longitude: { not: null } }] },
        { city: { latitude: { not: null }, longitude: { not: null } } },
      ],
    });
  }

  // Boolean switches (never clobber the explicit type/locationType filters above).
  if (f.online === 'true') and.push({ locationType: { in: ['ONLINE', 'HYBRID'] } });
  else if (f.online === 'false') and.push({ locationType: 'PHYSICAL' });
  if (f.international === 'true') and.push({ type: 'INTERNATIONAL' });
  else if (f.international === 'false') and.push({ type: { not: 'INTERNATIONAL' } });

  // Benefits: "food=true" requires it INCLUDED; "food=false" excludes opportunities providing it.
  const benefit = (
    benefitType: 'ACCOMMODATION' | 'FOOD' | 'TRANSPORTATION' | 'INSURANCE',
    required: boolean,
  ): Prisma.OpportunityWhereInput =>
    required
      ? { benefits: { some: { benefitType, value: 'INCLUDED' } } }
      : { benefits: { none: { benefitType, value: 'INCLUDED' } } };

  if (f.accommodation !== undefined) and.push(benefit('ACCOMMODATION', f.accommodation === 'true'));
  if (f.food !== undefined) and.push(benefit('FOOD', f.food === 'true'));
  if (f.transportation !== undefined)
    and.push(benefit('TRANSPORTATION', f.transportation === 'true'));
  if (f.insurance !== undefined) and.push(benefit('INSURANCE', f.insurance === 'true'));

  // Date-range overlap (open-ended when either side is null).
  if (f.availableFrom) and.push({ OR: [{ endDate: null }, { endDate: { gte: f.availableFrom } }] });
  if (f.availableTo) and.push({ OR: [{ startDate: null }, { startDate: { lte: f.availableTo } }] });

  // Age eligibility against the visitor's age.
  if (f.minimumAge !== undefined) {
    and.push({ OR: [{ minimumAge: null }, { minimumAge: { lte: f.minimumAge } }] });
    and.push({ OR: [{ maximumAge: null }, { maximumAge: { gte: f.minimumAge } }] });
  }

  // Support-need filter (spec §11): VOLUNTEERS = honest open-spots flag plus a
  // live deadline check; ANY = declares any support need; the rest match a
  // declared need of that kind.
  if (f.needs === 'VOLUNTEERS') {
    const now = new Date();
    and.push({ hasOpenSpots: true });
    and.push({ OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: now } }] });
  } else if (f.needs === 'ANY') {
    and.push({ supportNeeds: { some: {} } });
  } else if (f.needs) {
    and.push({ supportNeeds: { some: { kind: f.needs } } });
  }

  if (and.length > 0) where.AND = and;
  return where;
}

function orderByFor(sort: DiscoverFilters['sort']): Prisma.OpportunityOrderByWithRelationInput[] {
  switch (sort) {
    case 'deadline':
      return [{ applicationDeadline: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'soonest':
      return [{ startDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }];
    case 'popular':
      return [{ viewCount: 'desc' }, { createdAt: 'desc' }];
    case 'recent':
    default:
      return [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }];
  }
}

export async function discover(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, discoverSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = buildDiscoverWhere(f);
  if (f.q) {
    const ids = await searchOpportunityIds(f.q);
    if (ids.length === 0) {
      return { items: [], meta: buildPageMeta(0, { page, limit }) };
    }
    where.id = { in: ids };
  }

  const [total, rows] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where,
      select: f.mode === 'map' ? MAP_SELECT : LIST_SELECT,
      orderBy: orderByFor(f.sort),
      skip: f.mode === 'map' ? 0 : skip,
      take,
    }),
  ]);

  // mode=map (spec §16): fall back to the city's coordinates when the
  // initiative has no point of its own (city-level pin). The place relations
  // stay in the payload — the side list renders them (P11).
  const items =
    f.mode === 'map'
      ? (rows as Array<Prisma.OpportunityGetPayload<{ select: typeof MAP_SELECT }>>).map(
          ({ city, ...flat }) => ({
            ...flat,
            latitude: flat.latitude ?? city?.latitude ?? null,
            longitude: flat.longitude ?? city?.longitude ?? null,
            city,
          }),
        )
      : rows;

  return { items, meta: buildPageMeta(total, { page, limit }) };
}

export async function detail(ctx: RequestContext): Promise<unknown> {
  const { slug } = pathParams(ctx, opportunityParamsSchema);
  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findFirst({
    where: { slug, status: 'PUBLISHED', deletedAt: null },
    select: DETAIL_SELECT,
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  // Declared support needs + initiative-level impact metrics (spec §5/§14).
  const [needRows, metricRows] = await Promise.all([
    prisma.supportNeed.findMany({
      where: { opportunityId: opportunity.id },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        kind: true,
        labelAr: true,
        labelFr: true,
        labelEn: true,
        description: true,
        quantity: true,
        fulfilled: true,
        targetAmount: true,
        currency: true,
        sortOrder: true,
      },
    }),
    prisma.impactMetric.findMany({
      where: { opportunityId: opportunity.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        metricType: true,
        name: true,
        target: true,
        actual: true,
        unit: true,
        source: true,
        verified: true,
        createdAt: true,
      },
    }),
  ]);

  const acceptedAgg =
    needRows.length === 0
      ? []
      : await prisma.supportOffer.groupBy({
          by: ['supportNeedId'],
          where: { supportNeedId: { in: needRows.map((need) => need.id) }, status: 'ACCEPTED' },
          _count: { _all: true },
          _sum: { amount: true, quantity: true },
        });
  const aggByNeed = new Map(acceptedAgg.map((row) => [row.supportNeedId, row]));

  return {
    opportunity: {
      ...opportunity,
      supportNeeds: needRows.map((need) => {
        const agg = aggByNeed.get(need.id);
        return {
          id: need.id,
          kind: need.kind,
          labelAr: need.labelAr,
          labelFr: need.labelFr,
          labelEn: need.labelEn,
          description: need.description,
          quantity: need.quantity,
          fulfilled: need.fulfilled,
          targetAmount: need.targetAmount == null ? null : Number(need.targetAmount),
          currency: need.currency,
          sortOrder: need.sortOrder,
          // Honest progress: filled count when a target quantity exists, plus
          // accepted-offer totals (acceptedAmount = financial progress,
          // acceptedQuantity = the pledged segment of the P18 two-tone bar).
          progress:
            need.quantity != null && need.quantity > 0
              ? Math.min(need.fulfilled, need.quantity)
              : null,
          acceptedOffers: agg?._count._all ?? 0,
          acceptedAmount: Number(agg?._sum.amount ?? 0),
          acceptedQuantity: agg?._sum.quantity ?? 0,
        };
      }),
      impactMetrics: metricRows.map((metric) => ({
        ...metric,
        target: metric.target == null ? null : Number(metric.target),
        actual: Number(metric.actual),
      })),
    },
  };
}

export async function trackView(ctx: RequestContext): Promise<unknown> {
  const { slug } = pathParams(ctx, opportunityParamsSchema);
  const res = await getPrisma().opportunity.updateMany({
    where: { slug, status: 'PUBLISHED', deletedAt: null },
    data: { viewCount: { increment: 1 } },
  });
  if (res.count === 0) throw AppError.notFound('Opportunity not found.');
  return { ok: true };
}

// ── Organization (tenant) side ──────────────────────────────────

async function orgList(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const f = query(ctx, orgListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.OpportunityWhereInput = {
    organizationId: org.orgId,
    deletedAt: null,
    ...(f.status ? { status: f.status } : {}),
  };
  if (f.q) {
    where.OR = [
      { titleAr: { contains: f.q, mode: 'insensitive' } },
      { titleFr: { contains: f.q, mode: 'insensitive' } },
      { titleEn: { contains: f.q, mode: 'insensitive' } },
      { slug: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where,
      select: {
        ...LIST_SELECT,
        organizationId: true,
        updatedAt: true,
        verificationStatus: true,
        _count: { select: { applications: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function orgDetail(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const { id } = pathParams(ctx, idParamsSchema);

  const opportunity = await getPrisma().opportunity.findFirst({
    where: { id, organizationId: org.orgId, deletedAt: null },
    select: {
      ...DETAIL_SELECT,
      organizationId: true,
      updatedAt: true,
      _count: { select: { applications: true } },
    },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');
  return { opportunity };
}

/** Validates referenced taxonomy/location/campaign/source rows before writing. */
async function assertReferences(
  prisma: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
  input: {
    categoryId?: string | null;
    countryId?: string | null;
    wilayaId?: string | null;
    cityId?: string | null;
    sourceId?: string | null;
    campaignId?: string | null;
    skillIds?: string[];
    requiredSkillIds?: string[];
    languageIds?: string[];
    requiredLanguageIds?: string[];
  },
  orgId: string,
): Promise<void> {
  const missing: string[] = [];

  if (
    input.categoryId &&
    !(await prisma.opportunityCategory.findUnique({
      where: { id: input.categoryId },
      select: { id: true },
    }))
  ) {
    missing.push('categoryId');
  }
  if (
    input.countryId &&
    !(await prisma.country.findUnique({ where: { id: input.countryId }, select: { id: true } }))
  ) {
    missing.push('countryId');
  }
  if (
    input.wilayaId &&
    !(await prisma.wilaya.findUnique({ where: { id: input.wilayaId }, select: { id: true } }))
  ) {
    missing.push('wilayaId');
  }
  if (
    input.cityId &&
    !(await prisma.city.findUnique({ where: { id: input.cityId }, select: { id: true } }))
  ) {
    missing.push('cityId');
  }
  if (
    input.sourceId &&
    !(await prisma.opportunitySource.findUnique({
      where: { id: input.sourceId },
      select: { id: true },
    }))
  ) {
    missing.push('sourceId');
  }
  if (input.campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: input.campaignId },
      select: { organizationId: true },
    });
    if (!campaign || campaign.organizationId !== orgId) missing.push('campaignId');
  }

  const skillIds = [...new Set([...(input.skillIds ?? []), ...(input.requiredSkillIds ?? [])])];
  if (skillIds.length > 0) {
    const found = await prisma.skill.count({ where: { id: { in: skillIds } } });
    if (found !== skillIds.length) missing.push('skillIds');
  }
  const languageIds = [
    ...new Set([...(input.languageIds ?? []), ...(input.requiredLanguageIds ?? [])]),
  ];
  if (languageIds.length > 0) {
    const found = await prisma.language.count({ where: { id: { in: languageIds } } });
    if (found !== languageIds.length) missing.push('languageIds');
  }

  if (missing.length > 0) {
    throw AppError.validation(
      'One or more referenced records do not exist.',
      missing.map((path) => ({
        path,
        code: 'not_found',
        message: `Referenced ${path} does not exist.`,
      })),
    );
  }
}

function assertDateOrder(input: {
  startDate?: Date | null;
  endDate?: Date | null;
  minimumAge?: number | null;
  maximumAge?: number | null;
}): void {
  if (input.startDate && input.endDate && input.endDate.getTime() < input.startDate.getTime()) {
    throw AppError.validation('endDate must not be before startDate.', [
      { path: 'endDate', code: 'invalid_order', message: 'endDate must not be before startDate.' },
    ]);
  }
  if (input.minimumAge != null && input.maximumAge != null && input.minimumAge > input.maximumAge) {
    throw AppError.validation('minimumAge must not exceed maximumAge.', [
      {
        path: 'minimumAge',
        code: 'invalid_range',
        message: 'minimumAge must not exceed maximumAge.',
      },
    ]);
  }
}

async function allocateSlug(title: string): Promise<string> {
  const base = slugify(title, 80);
  const rows = await getPrisma().opportunity.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
    take: 100,
  });
  return uniqueSlug(base, new Set(rows.map((row) => row.slug)));
}

async function create(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.create');
  const input = await body(ctx, createOpportunitySchema);
  assertDateOrder(input);
  await assertReferences(getPrisma(), input, org.orgId);

  const prisma = getPrisma();
  const slug = await allocateSlug(input.titleEn || input.titleFr || input.titleAr);

  const baseCreate = {
    slug,
    organizationId: org.orgId,
    titleAr: input.titleAr,
    titleFr: input.titleFr,
    titleEn: input.titleEn,
    descriptionAr: input.descriptionAr,
    descriptionFr: input.descriptionFr,
    descriptionEn: input.descriptionEn,
    problemAr: input.problemAr ?? null,
    problemFr: input.problemFr ?? null,
    problemEn: input.problemEn ?? null,
    objectiveAr: input.objectiveAr ?? null,
    objectiveFr: input.objectiveFr ?? null,
    objectiveEn: input.objectiveEn ?? null,
    coverImage: input.coverImage ?? null,
    contactName: input.contactName ?? null,
    contactPhone: input.contactPhone ?? null,
    contactEmail: input.contactEmail ?? null,
    type: input.type,
    locationType: input.locationType,
    categoryId: input.categoryId ?? null,
    campaignId: input.campaignId ?? null,
    countryId: input.countryId ?? null,
    wilayaId: input.wilayaId ?? null,
    cityId: input.cityId ?? null,
    address: input.address ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    applicationDeadline: input.applicationDeadline ?? null,
    capacity: input.capacity ?? null,
    minimumAge: input.minimumAge ?? null,
    maximumAge: input.maximumAge ?? null,
    estimatedHours: input.estimatedHours ?? null,
    sourceId: input.sourceId ?? null,
    sourceUrl: input.sourceUrl ?? null,
    status: 'DRAFT' as const,
  };

  const requiredSkills = new Set(input.requiredSkillIds);
  const skillRows = [
    ...input.requiredSkillIds.map((skillId) => ({ skillId, required: true })),
    ...input.skillIds
      .filter((skillId) => !requiredSkills.has(skillId))
      .map((skillId) => ({ skillId, required: false })),
  ];
  const requiredLanguages = new Set(input.requiredLanguageIds);
  const languageRows = [
    ...input.requiredLanguageIds.map((languageId) => ({ languageId, required: true })),
    ...input.languageIds
      .filter((languageId) => !requiredLanguages.has(languageId))
      .map((languageId) => ({ languageId, required: false })),
  ];

  try {
    const created = await prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.create({
        data: {
          ...baseCreate,
          skills: { createMany: { data: skillRows.map((row) => ({ ...row })) } },
          languages: { createMany: { data: languageRows.map((row) => ({ ...row })) } },
          benefits: {
            createMany: {
              data: input.benefits.map((benefit) => ({
                benefitType: benefit.benefitType,
                value: benefit.value,
                note: benefit.note ?? null,
              })),
            },
          },
          requirements: {
            createMany: {
              data: input.requirements.map((requirement, index) => ({
                type: requirement.type,
                labelAr: requirement.labelAr,
                labelFr: requirement.labelFr,
                labelEn: requirement.labelEn,
                description: requirement.description ?? null,
                required: requirement.required,
                sortOrder: index,
              })),
            },
          },
          questions: {
            createMany: {
              data: input.questions.map((question, index) => ({
                promptAr: question.promptAr,
                promptFr: question.promptFr,
                promptEn: question.promptEn,
                type: question.type,
                required: question.required,
                sortOrder: index,
                ...(question.options
                  ? { options: question.options as unknown as Prisma.InputJsonValue }
                  : {}),
              })),
            },
          },
        },
      });
      return opportunity;
    });

    const { searchVector: _searchVector, ...opportunity } = created;
    await audit({
      actorUserId: org.user.userId,
      organizationId: org.orgId,
      action: 'opportunity.create',
      entityType: 'opportunity',
      entityId: created.id,
      after: { slug: created.slug, status: created.status },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { opportunity };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('An opportunity with this slug already exists.');
    }
    if (isForeignKeyViolation(error)) {
      throw AppError.validation('One or more referenced records do not exist.');
    }
    throw error;
  }
}

/** Enforces complete localized triplets when any localized field is touched. */
function assertLocalizedTriplets(input: z.infer<typeof updateOpportunitySchema>): void {
  const groups: Array<[string, readonly string[]]> = [
    ['titles', ['titleAr', 'titleFr', 'titleEn']],
    ['descriptions', ['descriptionAr', 'descriptionFr', 'descriptionEn']],
  ];
  const asRecord = input as Record<string, unknown>;
  for (const [label, keys] of groups) {
    const present = keys.filter((key) => asRecord[key] !== undefined);
    if (present.length > 0 && present.length < keys.length) {
      throw AppError.validation(
        `Provide all three localized ${label} (ar, fr, en) together.`,
        present.map((key) => ({
          path: key,
          code: 'incomplete_localization',
          message: `All three localized ${label} are required together.`,
        })),
      );
    }
  }
}

const SCALAR_UPDATE_KEYS = [
  'titleAr',
  'titleFr',
  'titleEn',
  'descriptionAr',
  'descriptionFr',
  'descriptionEn',
  'problemAr',
  'problemFr',
  'problemEn',
  'objectiveAr',
  'objectiveFr',
  'objectiveEn',
  'coverImage',
  'contactName',
  'contactPhone',
  'contactEmail',
  'type',
  'locationType',
  'categoryId',
  'campaignId',
  'countryId',
  'wilayaId',
  'cityId',
  'address',
  'latitude',
  'longitude',
  'startDate',
  'endDate',
  'applicationDeadline',
  'capacity',
  'minimumAge',
  'maximumAge',
  'estimatedHours',
  'sourceId',
  'sourceUrl',
] as const;

async function update(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, updateOpportunitySchema);
  assertLocalizedTriplets(input);
  assertDateOrder(input);

  const prisma = getPrisma();
  const existing = await prisma.opportunity.findFirst({
    where: { id, organizationId: org.orgId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw AppError.notFound('Opportunity not found.');

  // Paired relation inputs are all-or-nothing so a partial payload cannot
  // silently wipe the other half of the pair.
  if ((input.skillIds !== undefined) !== (input.requiredSkillIds !== undefined)) {
    throw AppError.validation('skillIds and requiredSkillIds must be provided together.');
  }
  if ((input.languageIds !== undefined) !== (input.requiredLanguageIds !== undefined)) {
    throw AppError.validation('languageIds and requiredLanguageIds must be provided together.');
  }

  await assertReferences(prisma, input, org.orgId);

  // Questions are referenced by existing answers — never rewrite them once
  // applications exist (answers cascade-delete with their question).
  if (input.questions !== undefined) {
    const applications = await prisma.opportunityApplication.count({
      where: { opportunityId: id },
    });
    if (applications > 0) {
      throw AppError.businessRule(
        'Application questions cannot be changed after applications exist.',
      );
    }
  }

  const data: Record<string, unknown> = {};
  for (const key of SCALAR_UPDATE_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (value !== undefined) data[key] = value;
  }

  // Capacity edits recompute the honest open-spots flag used by the
  // `needs=VOLUNTEERS` discover filter (acceptedCount lives on the row).
  if (input.capacity !== undefined) {
    const stats = await prisma.opportunity.findFirst({
      where: { id },
      select: { acceptedCount: true },
    });
    if (stats) {
      data.hasOpenSpots = input.capacity === null || stats.acceptedCount < input.capacity;
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) {
        await tx.opportunity.update({ where: { id }, data: data as Prisma.OpportunityUpdateInput });
      }

      if (input.skillIds !== undefined) {
        await tx.opportunitySkill.deleteMany({ where: { opportunityId: id } });
        // pairing check above guarantees requiredSkillIds came with skillIds
        const required = new Set(input.requiredSkillIds ?? []);
        await tx.opportunitySkill.createMany({
          data: [
            ...(input.requiredSkillIds ?? []).map((skillId) => ({
              opportunityId: id,
              skillId,
              required: true,
            })),
            ...input.skillIds
              .filter((skillId) => !required.has(skillId))
              .map((skillId) => ({ opportunityId: id, skillId, required: false })),
          ],
        });
      }

      if (input.languageIds !== undefined) {
        await tx.opportunityLanguage.deleteMany({ where: { opportunityId: id } });
        const required = new Set(input.requiredLanguageIds ?? []);
        await tx.opportunityLanguage.createMany({
          data: [
            ...(input.requiredLanguageIds ?? []).map((languageId) => ({
              opportunityId: id,
              languageId,
              required: true,
            })),
            ...input.languageIds
              .filter((languageId) => !required.has(languageId))
              .map((languageId) => ({ opportunityId: id, languageId, required: false })),
          ],
        });
      }

      if (input.benefits !== undefined) {
        await tx.opportunityBenefit.deleteMany({ where: { opportunityId: id } });
        await tx.opportunityBenefit.createMany({
          data: input.benefits.map((benefit) => ({
            opportunityId: id,
            benefitType: benefit.benefitType,
            value: benefit.value,
            note: benefit.note ?? null,
          })),
        });
      }

      if (input.requirements !== undefined) {
        await tx.opportunityRequirement.deleteMany({ where: { opportunityId: id } });
        await tx.opportunityRequirement.createMany({
          data: input.requirements.map((requirement, index) => ({
            opportunityId: id,
            type: requirement.type,
            labelAr: requirement.labelAr,
            labelFr: requirement.labelFr,
            labelEn: requirement.labelEn,
            description: requirement.description ?? null,
            required: requirement.required,
            sortOrder: index,
          })),
        });
      }

      if (input.questions !== undefined) {
        await tx.opportunityQuestion.deleteMany({ where: { opportunityId: id } });
        await tx.opportunityQuestion.createMany({
          data: input.questions.map((question, index) => ({
            opportunityId: id,
            promptAr: question.promptAr,
            promptFr: question.promptFr,
            promptEn: question.promptEn,
            type: question.type,
            required: question.required,
            sortOrder: index,
            ...(question.options
              ? { options: question.options as unknown as Prisma.InputJsonValue }
              : {}),
          })),
        });
      }

      return tx.opportunity.findUnique({ where: { id }, select: DETAIL_SELECT });
    });

    // DETAIL_SELECT deliberately excludes searchVector (kept in sync by trigger)
    const opportunity = updated;
    if (!opportunity) throw AppError.notFound('Opportunity not found.');
    await audit({
      actorUserId: org.user.userId,
      organizationId: org.orgId,
      action: 'opportunity.update',
      entityType: 'opportunity',
      entityId: id,
      after: { fields: Object.keys(data) },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { opportunity };
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw AppError.validation('One or more referenced records do not exist.');
    }
    throw error;
  }
}

async function transition(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, transitionOpportunitySchema);
  const org = await requireOrgMembership(ctx, ACTION_PERMISSION[input.action]);

  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, organizationId: org.orgId, deletedAt: null },
    select: { id: true, status: true, publishedAt: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  const target = ACTION_TARGET[input.action];
  if (input.action === 'REJECT' && !input.reason?.trim()) {
    throw AppError.validation('A reason is required to reject an opportunity.', [
      { path: 'reason', code: 'required', message: 'Provide a reason.' },
    ]);
  }
  assertTransition(OPPORTUNITY_TRANSITIONS, opportunity.status, target, 'opportunity');

  if (target === 'PUBLISHED') {
    const organization = await prisma.organization.findUnique({
      where: { id: org.orgId },
      select: { verificationStatus: true, status: true },
    });
    if (organization?.status === 'SUSPENDED') {
      throw AppError.businessRule('Suspended organizations cannot publish opportunities.');
    }
    if (organization?.verificationStatus !== 'VERIFIED') {
      throw AppError.businessRule(
        'Your organization must be verified before publishing opportunities.',
      );
    }
  }

  const updated = await prisma.opportunity.update({
    where: { id },
    data: {
      status: target,
      ...(target === 'PUBLISHED' && !opportunity.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });

  // First publish → NEW_MATCHING_OPPORTUNITY fan-out (P5), bounded +
  // best-effort: a notification failure never fails the transition.
  if (target === 'PUBLISHED' && !opportunity.publishedAt) announceMatching(id);

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'opportunity.transition',
    entityType: 'opportunity',
    entityId: id,
    before: { status: opportunity.status },
    after: { status: target, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const { searchVector: _searchVector, ...rest } = updated;
  return { opportunity: rest };
}

async function bulkTransition(ctx: RequestContext): Promise<unknown> {
  const input = await body(ctx, bulkTransitionSchema);
  const org = await requireOrgMembership(ctx, ACTION_PERMISSION[input.action]);

  const prisma = getPrisma();
  const target = ACTION_TARGET[input.action];
  if (input.action === 'REJECT' && !input.reason?.trim()) {
    throw AppError.validation('A reason is required to reject opportunities.', [
      { path: 'reason', code: 'required', message: 'Provide a reason.' },
    ]);
  }

  const results: Array<{ id: string; ok: boolean; from?: string; to?: string; error?: string }> =
    [];

  for (const id of input.opportunityIds) {
    try {
      const opportunity = await prisma.opportunity.findFirst({
        where: { id, organizationId: org.orgId, deletedAt: null },
        select: { id: true, status: true, publishedAt: true },
      });
      if (!opportunity) {
        results.push({ id, ok: false, error: 'NOT_FOUND' });
        continue;
      }
      assertTransition(OPPORTUNITY_TRANSITIONS, opportunity.status, target, 'opportunity');

      if (target === 'PUBLISHED') {
        const organization = await prisma.organization.findUnique({
          where: { id: org.orgId },
          select: { verificationStatus: true, status: true },
        });
        if (
          organization?.status === 'SUSPENDED' ||
          organization?.verificationStatus !== 'VERIFIED'
        ) {
          results.push({
            id,
            ok: false,
            from: opportunity.status,
            error: 'ORGANIZATION_NOT_VERIFIED',
          });
          continue;
        }
      }

      await prisma.opportunity.update({
        where: { id },
        data: {
          status: target,
          ...(target === 'PUBLISHED' && !opportunity.publishedAt
            ? { publishedAt: new Date() }
            : {}),
        },
      });
      if (target === 'PUBLISHED' && !opportunity.publishedAt) announceMatching(id);
      await audit({
        actorUserId: org.user.userId,
        organizationId: org.orgId,
        action: 'opportunity.transition',
        entityType: 'opportunity',
        entityId: id,
        before: { status: opportunity.status },
        after: { status: target, reason: input.reason ?? null, bulk: true },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      });
      results.push({ id, ok: true, from: opportunity.status, to: target });
    } catch (error) {
      results.push({
        id,
        ok: false,
        error: error instanceof AppError ? error.message : 'INTERNAL_ERROR',
      });
    }
  }

  const succeeded = results.filter((row) => row.ok).length;
  return { results, succeeded, failed: results.length - succeeded };
}

// ── Platform administration (moderation view across all tenants) ──

async function platformList(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'opportunity.read:platform');
  const f = query(ctx, adminOpportunitiesQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.OpportunityWhereInput = { deletedAt: null };
  if (f.status) where.status = f.status;
  if (f.organizationId) where.organizationId = f.organizationId;
  if (f.q) {
    where.OR = [
      { slug: { contains: f.q, mode: 'insensitive' } },
      { titleAr: { contains: f.q, mode: 'insensitive' } },
      { titleFr: { contains: f.q, mode: 'insensitive' } },
      { titleEn: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.opportunity.count({ where }),
    prisma.opportunity.findMany({
      where,
      select: {
        id: true,
        slug: true,
        titleAr: true,
        titleFr: true,
        titleEn: true,
        type: true,
        status: true,
        applicationDeadline: true,
        publishedAt: true,
        viewCount: true,
        applicationCount: true,
        createdAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            verificationStatus: true,
            trustLevel: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => ({
    ...row,
    organization: {
      ...row.organization,
      badge: organizationBadge(row.organization.trustLevel, row.organization.verificationStatus),
    },
  }));
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/**
 * Platform moderation action. Publication still requires the organization to
 * be VERIFIED and active — the same rule as the tenant flow, so an
 * unverified or suspended organization never reaches PUBLISHED whoever
 * publishes it (the letter's "no publishing for unverified/suspended orgs").
 * Everything else (state machine, reason, audit trail) is shared with the
 * tenant flow.
 */
async function platformAction(ctx: RequestContext): Promise<unknown> {
  const actor = await requireSystemPermission(ctx, 'opportunity.moderate');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, adminOpportunityActionSchema);

  if ((input.action === 'REJECT' || input.action === 'SUSPEND') && !input.reason?.trim()) {
    throw AppError.validation(
      `A reason is required to ${input.action.toLowerCase()} an opportunity.`,
      [{ path: 'reason', code: 'required', message: 'Provide a reason.' }],
    );
  }

  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true, publishedAt: true, organizationId: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  const target = ADMIN_ACTION_TARGET[input.action];
  assertTransition(OPPORTUNITY_TRANSITIONS, opportunity.status, target, 'opportunity');

  if (target === 'PUBLISHED') {
    const organization = await prisma.organization.findUnique({
      where: { id: opportunity.organizationId },
      select: { verificationStatus: true, status: true },
    });
    if (organization?.status === 'SUSPENDED') {
      throw AppError.businessRule('Suspended organizations cannot publish opportunities.');
    }
    if (organization?.verificationStatus !== 'VERIFIED') {
      throw AppError.businessRule(
        'Your organization must be verified before publishing opportunities.',
      );
    }
  }

  const updated = await prisma.opportunity.update({
    where: { id },
    data: {
      status: target,
      ...(target === 'PUBLISHED' && !opportunity.publishedAt ? { publishedAt: new Date() } : {}),
    },
  });
  if (target === 'PUBLISHED' && !opportunity.publishedAt) announceMatching(id);

  await prisma.adminAction.create({
    data: {
      adminUserId: actor.userId,
      action: input.action.toLowerCase(),
      targetType: 'opportunity',
      targetId: id,
      reason: input.reason ?? null,
      requestId: ctx.requestId,
    },
  });
  await audit({
    actorUserId: actor.userId,
    action: `opportunity.admin.${input.action.toLowerCase()}`,
    entityType: 'opportunity',
    entityId: id,
    before: { status: opportunity.status },
    after: { status: target, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { opportunity: updated };
}

async function remove(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);

  const prisma = getPrisma();
  const opportunity = await prisma.opportunity.findFirst({
    where: { id, organizationId: org.orgId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  if (!['DRAFT', 'REJECTED', 'ARCHIVED'].includes(opportunity.status)) {
    throw AppError.businessRule(
      'Only draft, rejected or archived opportunities can be deleted — archive it instead.',
    );
  }

  await prisma.opportunity.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'opportunity.delete',
    entityType: 'opportunity',
    entityId: id,
    before: { status: opportunity.status },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { ok: true };
}

// ── Route table ─────────────────────────────────────────────────

export const opportunityRoutes: AppRoute[] = [
  // public
  {
    method: 'GET',
    path: '/opportunities',
    handler: discover,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Discover opportunities (FTS + filters, paginated)',
  },
  {
    method: 'GET',
    path: '/opportunities/:slug',
    handler: detail,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Opportunity detail by slug',
  },
  {
    method: 'POST',
    path: '/opportunities/:slug/view',
    handler: trackView,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Count a detail view',
  },
  // organization-scoped (literal segments registered before :id patterns)
  {
    method: 'GET',
    path: '/orgs/:orgId/opportunities',
    handler: orgList,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "List the organization's opportunities",
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/opportunities',
    handler: create,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Create an opportunity (DRAFT)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/opportunities/bulk-transition',
    handler: bulkTransition,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Apply one transition to many opportunities',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/opportunities/:id',
    handler: orgDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Opportunity detail (org view)',
  },
  {
    method: 'PATCH',
    path: '/orgs/:orgId/opportunities/:id',
    handler: update,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Update an opportunity',
  },
  {
    method: 'DELETE',
    path: '/orgs/:orgId/opportunities/:id',
    handler: remove,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Soft-delete a draft/rejected/archived opportunity',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/opportunities/:id/transition',
    handler: transition,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Status transition (state machine)',
  },
  // platform administration (literal list before the :id action pattern)
  {
    method: 'GET',
    path: '/admin/opportunities',
    handler: platformList,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform opportunity list across all tenants (paginated, filterable)',
  },
  {
    method: 'POST',
    path: '/admin/opportunities/:id/action',
    handler: platformAction,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Publish/reject/suspend/restore (state machine, reason, audit)',
  },
];
