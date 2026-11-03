// Economic institution profile, CSR focus vocabulary and partner-match reads
// (P34 — design §5). Organization stays the identity anchor: the profile is
// 1:1 with it, and `activate` derives the legacy-compatible Sponsor bridge
// (1:1, slug inherited from the organization). The matching *engine* — score
// computation and recompute — lands in M3; here we only read persisted rows.

import { getPrisma, type Prisma } from '@bladna/database';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  csrFocusAreaCreateSchema,
  csrFocusAreaPatchSchema,
  idParamsSchema,
  partnerMatchesQuerySchema,
  putFocusAreasSchema,
  updateEconomicProfileSchema,
} from '@bladna/validation';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireOrgMembership, requireSystemPermission } from '../guards';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prisma-errors';
import { requireScopedActor } from '../lib/partnership-access';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

const PROFILE_INCLUDE: Prisma.EconomicInstitutionProfileInclude = {
  focusAreas: {
    include: {
      focusArea: {
        select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true, active: true },
      },
    },
    orderBy: [{ priority: 'desc' }, { focusArea: { sortOrder: 'asc' } }],
  },
  preferredWilayas: {
    include: {
      wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
    },
    orderBy: { wilaya: { code: 'asc' } },
  },
};

interface ProfileScalars {
  sector: string | null;
  subSector: string | null;
  companySize: string | null;
  nationalScope: boolean;
  csrEnabled: boolean;
  esgEnabled: boolean;
  csrContactName: string | null;
  csrContactEmail: string | null;
  csrContactPhone: string | null;
  annualCSRBudget: unknown;
  minProjectBudget: unknown;
  maxProjectBudget: unknown;
  currency: string;
  preferredSupportTypes: readonly string[];
  preferredBeneficiaryGroups: readonly string[];
}

/** JSON-safe audit snapshot (Decimal → number, never the whole Prisma row). */
function profileSnapshot(profile: ProfileScalars | null): Record<string, unknown> | null {
  if (!profile) return null;
  return {
    sector: profile.sector,
    subSector: profile.subSector,
    companySize: profile.companySize,
    nationalScope: profile.nationalScope,
    csrEnabled: profile.csrEnabled,
    esgEnabled: profile.esgEnabled,
    csrContactName: profile.csrContactName,
    csrContactEmail: profile.csrContactEmail,
    csrContactPhone: profile.csrContactPhone,
    annualCSRBudget: profile.annualCSRBudget == null ? null : Number(profile.annualCSRBudget),
    minProjectBudget: profile.minProjectBudget == null ? null : Number(profile.minProjectBudget),
    maxProjectBudget: profile.maxProjectBudget == null ? null : Number(profile.maxProjectBudget),
    currency: profile.currency,
    preferredSupportTypes: [...profile.preferredSupportTypes],
    preferredBeneficiaryGroups: [...profile.preferredBeneficiaryGroups],
  };
}

/** Profile rows are created on demand by PATCH/PUT — activation only adds the bridge. */
async function ensureProfile(organizationId: string) {
  const prisma = getPrisma();
  const existing = await prisma.economicInstitutionProfile.findUnique({
    where: { organizationId },
    include: PROFILE_INCLUDE,
  });
  if (existing) return existing;
  return prisma.economicInstitutionProfile.create({
    data: { organizationId },
    include: PROFILE_INCLUDE,
  });
}

// ── Profile (org members read; economic.profile.manage writes) ────

async function getEconomicProfile(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const profile = await getPrisma().economicInstitutionProfile.findUnique({
    where: { organizationId: org.orgId },
    include: PROFILE_INCLUDE,
  });
  return { profile };
}

async function patchEconomicProfile(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'economic.profile.manage');
  const input = await body(ctx, updateEconomicProfileSchema);
  const prisma = getPrisma();

  const existing = await prisma.economicInstitutionProfile.findUnique({
    where: { organizationId: org.orgId },
  });
  const { preferredWilayas, ...scalarPatch } = input;

  const profile = await prisma.economicInstitutionProfile.upsert({
    where: { organizationId: org.orgId },
    create: {
      organizationId: org.orgId,
      ...scalarPatch,
      ...(preferredWilayas
        ? { preferredWilayas: { create: preferredWilayas.map((wilayaId) => ({ wilayaId })) } }
        : {}),
    },
    update: {
      ...scalarPatch,
      ...(preferredWilayas
        ? {
            preferredWilayas: {
              deleteMany: {},
              create: preferredWilayas.map((wilayaId) => ({ wilayaId })),
            },
          }
        : {}),
    },
    include: PROFILE_INCLUDE,
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'ECONOMIC_PROFILE_UPDATED',
    entityType: 'economicInstitutionProfile',
    entityId: profile.id,
    before: profileSnapshot(existing),
    after: profileSnapshot(profile),
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { profile };
}

/**
 * Activate the economic-institution surface: ensure the profile row, then
 * derive the 1:1 `Sponsor` bridge (slug/legal names inherited from the
 * organization — identity is never duplicated). OWNER/ADMIN only (design §5).
 */
async function activateEconomicProfile(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'economic.profile.manage');
  if (org.membershipId !== '' && org.role !== 'OWNER' && org.role !== 'ADMIN') {
    throw AppError.forbidden('Only the owner or an admin can activate the economic profile.');
  }
  const prisma = getPrisma();
  const profile = await ensureProfile(org.orgId);

  const organization = await prisma.organization.findUnique({
    where: { id: org.orgId },
    select: {
      id: true,
      name: true,
      legalName: true,
      slug: true,
      description: true,
      website: true,
      officialEmail: true,
      phone: true,
    },
  });
  if (!organization) throw AppError.notFound('Organization not found.');

  let sponsor = await prisma.sponsor.findUnique({ where: { organizationId: org.orgId } });
  let bridgeCreated = false;
  if (!sponsor) {
    try {
      sponsor = await prisma.sponsor.create({
        data: {
          legalName: organization.legalName ?? organization.name,
          commercialName: organization.name,
          slug: organization.slug,
          description: organization.description,
          website: organization.website,
          contactEmail: organization.officialEmail,
          contactPhone: organization.phone,
          organizationId: organization.id,
          status: 'ACTIVE',
        },
      });
    } catch (error) {
      // A legacy sponsor may already occupy the organization's slug text:
      // fall back to an org-unique suffix instead of failing activation.
      if (!isUniqueViolation(error)) throw error;
      sponsor = await prisma.sponsor.create({
        data: {
          legalName: organization.legalName ?? organization.name,
          commercialName: organization.name,
          slug: `${organization.slug}-${organization.id.slice(0, 8)}`,
          description: organization.description,
          website: organization.website,
          contactEmail: organization.officialEmail,
          contactPhone: organization.phone,
          organizationId: organization.id,
          status: 'ACTIVE',
        },
      });
    }
    bridgeCreated = true;
  }

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'ECONOMIC_PROFILE_ACTIVATED',
    entityType: 'economicInstitutionProfile',
    entityId: profile.id,
    after: { sponsorId: sponsor.id, bridgeCreated },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return {
    profile,
    sponsor: {
      id: sponsor.id,
      slug: sponsor.slug,
      status: sponsor.status,
      verificationStatus: sponsor.verificationStatus,
    },
    bridgeCreated,
  };
}

/** Full replacement of the profile's focus set (priorities kept). */
async function putFocusAreas(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'economic.profile.manage');
  const input = await body(ctx, putFocusAreasSchema);
  const prisma = getPrisma();
  const profile = await ensureProfile(org.orgId);

  const focusAreaIds = [...new Set(input.areas.map((area) => area.focusAreaId))];
  if (focusAreaIds.length > 0) {
    const found = await prisma.cSRFocusArea.count({ where: { id: { in: focusAreaIds } } });
    if (found !== focusAreaIds.length) {
      throw AppError.validation('One or more focus areas do not exist.');
    }
  }

  await prisma.$transaction([
    prisma.economicProfileFocusArea.deleteMany({ where: { profileId: profile.id } }),
    ...(input.areas.length > 0
      ? [
          prisma.economicProfileFocusArea.createMany({
            data: input.areas.map((area) => ({
              profileId: profile.id,
              focusAreaId: area.focusAreaId,
              priority: area.priority,
            })),
          }),
        ]
      : []),
  ]);

  const focusAreas = await prisma.economicProfileFocusArea.findMany({
    where: { profileId: profile.id },
    include: {
      focusArea: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
    },
    orderBy: [{ priority: 'desc' }, { focusArea: { sortOrder: 'asc' } }],
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'ECONOMIC_FOCUS_AREAS_UPDATED',
    entityType: 'economicInstitutionProfile',
    entityId: profile.id,
    after: { focusAreaIds },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { focusAreas };
}

// ── CSR focus vocabulary (public read, platform write) ─────────────

async function listCsrFocusAreas(): Promise<unknown> {
  const focusAreas = await getPrisma().cSRFocusArea.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  return { focusAreas };
}

async function adminListFocusAreas(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'content.manage');
  const focusAreas = await getPrisma().cSRFocusArea.findMany({
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
  return { focusAreas };
}

async function adminCreateFocusArea(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const input = await body(ctx, csrFocusAreaCreateSchema);
  try {
    const focusArea = await getPrisma().cSRFocusArea.create({ data: input });
    await audit({
      actorUserId: user.userId,
      action: 'CSR_FOCUS_AREA_CREATED',
      entityType: 'csrFocusArea',
      entityId: focusArea.id,
      after: { code: focusArea.code, sortOrder: focusArea.sortOrder },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return { focusArea };
  } catch (error) {
    if (isUniqueViolation(error)) throw AppError.conflict('A focus area with this code exists.');
    throw error;
  }
}

async function adminUpdateFocusArea(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, csrFocusAreaPatchSchema);
  const prisma = getPrisma();
  const existing = await prisma.cSRFocusArea.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Focus area not found.');

  const focusArea = await prisma.cSRFocusArea.update({ where: { id }, data: input });
  await audit({
    actorUserId: user.userId,
    action: 'CSR_FOCUS_AREA_UPDATED',
    entityType: 'csrFocusArea',
    entityId: id,
    before: { code: existing.code, active: existing.active, sortOrder: existing.sortOrder },
    after: { code: focusArea.code, active: focusArea.active, sortOrder: focusArea.sortOrder },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { focusArea };
}

async function adminDeleteFocusArea(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'content.manage');
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();
  const existing = await prisma.cSRFocusArea.findUnique({ where: { id } });
  if (!existing) throw AppError.notFound('Focus area not found.');

  try {
    await prisma.cSRFocusArea.delete({ where: { id } });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw AppError.conflict('This focus area is in use — deactivate it instead.');
    }
    throw error;
  }
  await audit({
    actorUserId: user.userId,
    action: 'CSR_FOCUS_AREA_DELETED',
    entityType: 'csrFocusArea',
    entityId: id,
    before: { code: existing.code, nameAr: existing.nameAr },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { deleted: true };
}

// ── Partner-match reads (engine & recompute = M3) ─────────────────

const MATCH_SELECT: Prisma.PartnerMatchSelect = {
  id: true,
  score: true,
  breakdown: true,
  engineVersion: true,
  computedAt: true,
  opportunityId: true,
  economicOrganizationId: true,
  opportunity: {
    select: {
      id: true,
      slug: true,
      titleAr: true,
      titleFr: true,
      titleEn: true,
      type: true,
      status: true,
      wilayaId: true,
    },
  },
};

/** The firm's matched initiatives (economic side of each match). */
async function orgPartnerMatches(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'partner.match.read');
  const f = query(ctx, partnerMatchesQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.PartnerMatchWhereInput = {
    economicOrganizationId: org.orgId,
    ...(f.minScore !== undefined ? { score: { gte: f.minScore } } : {}),
    ...(f.wilayaId ? { opportunity: { wilayaId: f.wilayaId } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.partnerMatch.count({ where }),
    prisma.partnerMatch.findMany({
      where,
      select: MATCH_SELECT,
      orderBy: [{ score: 'desc' }, { computedAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** The initiative's matched companies (youth side of each match). */
async function opportunityPartnerMatches(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const f = query(ctx, partnerMatchesQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const opportunity = await prisma.opportunity.findUnique({
    where: { id },
    select: { id: true, organizationId: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');
  await requireOrgMembership(ctx, 'partner.match.read', { orgId: opportunity.organizationId });

  const where: Prisma.PartnerMatchWhereInput = {
    opportunityId: id,
    ...(f.minScore !== undefined ? { score: { gte: f.minScore } } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.partnerMatch.count({ where }),
    prisma.partnerMatch.findMany({
      where,
      select: MATCH_SELECT,
      orderBy: [{ score: 'desc' }, { computedAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

/** Full scorecard with its explainable breakdown — visible to both parties. */
async function getPartnerMatch(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const match = await getPrisma().partnerMatch.findUnique({
    where: { id },
    select: {
      ...MATCH_SELECT,
      opportunity: {
        select: {
          id: true,
          organizationId: true,
          slug: true,
          titleAr: true,
          titleFr: true,
          titleEn: true,
        },
      },
      economicOrganization: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!match) throw AppError.notFound('Partner match not found.');

  await requireScopedActor(ctx, [
    { orgId: match.opportunity.organizationId, permission: 'partner.match.read', side: 'youth' },
    { orgId: match.economicOrganizationId, permission: 'partner.match.read', side: 'economic' },
  ]);
  return { match };
}

// ── Route table ───────────────────────────────────────────────────

export const economicRoutes: AppRoute[] = [
  // economic institution profile
  {
    method: 'GET',
    path: '/orgs/:orgId/economic-profile',
    handler: getEconomicProfile,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Economic participation profile of a tenant (org members)',
  },
  {
    method: 'PATCH',
    path: '/orgs/:orgId/economic-profile',
    handler: patchEconomicProfile,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Upsert economic profile fields (sector, budgets, preferences)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/economic-profile/activate',
    handler: activateEconomicProfile,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Activate: ensure profile + derive the 1:1 Sponsor bridge (OWNER/ADMIN)',
  },
  {
    method: 'PUT',
    path: '/orgs/:orgId/economic-profile/focus-areas',
    handler: putFocusAreas,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Replace the profile focus set with priorities (OWNER/MANAGER)',
  },
  // CSR focus vocabulary
  {
    method: 'GET',
    path: '/csr-focus-areas',
    handler: listCsrFocusAreas,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Active CSR focus areas (seeded trilingual reference set)',
  },
  {
    method: 'GET',
    path: '/admin/csr-focus-areas',
    handler: adminListFocusAreas,
    options: { rateLimit: 'admin' },
    auth: 'admin',
    summary: 'All CSR focus areas incl. inactive (platform)',
  },
  {
    method: 'POST',
    path: '/admin/csr-focus-areas',
    handler: adminCreateFocusArea,
    options: { rateLimit: 'admin' },
    auth: 'admin',
    summary: 'Create a CSR focus area (unique code)',
  },
  {
    method: 'PATCH',
    path: '/admin/csr-focus-areas/:id',
    handler: adminUpdateFocusArea,
    options: { rateLimit: 'admin' },
    auth: 'admin',
    summary: 'Update a CSR focus area (code immutable)',
  },
  {
    method: 'DELETE',
    path: '/admin/csr-focus-areas/:id',
    handler: adminDeleteFocusArea,
    options: { rateLimit: 'admin' },
    auth: 'admin',
    summary: 'Delete an unused CSR focus area (in use ⇒ deactivate instead)',
  },
  // partner matches (reads)
  {
    method: 'GET',
    path: '/orgs/:orgId/partner-matches',
    handler: orgPartnerMatches,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: "The economic institution's matched initiatives (score desc)",
  },
  {
    method: 'GET',
    path: '/opportunities/:id/partner-matches',
    handler: opportunityPartnerMatches,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: "The initiative's matched economic institutions (score desc)",
  },
  {
    method: 'GET',
    path: '/partner-matches/:id',
    handler: getPartnerMatch,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'One scorecard with its explainable breakdown (both parties)',
  },
];
