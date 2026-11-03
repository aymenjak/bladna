// Impact module (spec §63).
//
// Real impact data only: platform aggregates are computed from persisted rows,
// metric writes are tenant-scoped (organizations own campaign metrics, sponsors
// own CSR-program metrics), and reports export the same rows as JSON or CSV —
// `pdf` is a documented notImplemented capability, never a stub.

import { getPrisma, type Prisma } from '@bladna/database';
import { EVIDENCE_TRANSITIONS, assertTransition } from '@bladna/domain';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  createImpactMetricSchema,
  impactReportQuerySchema,
  metricIdParamsSchema,
  paginationQuerySchema,
  uploadEvidenceSchema,
  uuidSchema,
  verifyEvidenceSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { RawResponse, body, pathParams, query, type RequestContext } from '../http';
import { requireOrgMembership, requireSponsorPermission, requireSystemPermission } from '../guards';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

/** Row cap for CSV impact exports (mirrors the platform export ceiling). */
export const EXPORT_LIMIT = 10_000;

const METRIC_SELECT = {
  id: true,
  campaignId: true,
  csrProgramId: true,
  metricType: true,
  name: true,
  target: true,
  actual: true,
  unit: true,
  source: true,
  verified: true,
  verifiedById: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.ImpactMetricSelect;

const IMPACT_COLUMNS = [
  'id',
  'metricType',
  'name',
  'target',
  'actual',
  'unit',
  'source',
  'verified',
  'campaignId',
  'csrProgramId',
  'createdAt',
] as const;

const metricsQuerySchema = paginationQuerySchema.extend({
  campaignId: uuidSchema.optional(),
  csrProgramId: uuidSchema.optional(),
  /** Initiative-level metrics (spec §14) — mirrors the campaign/program filters. */
  opportunityId: uuidSchema.optional(),
});

const reportQuerySchema = impactReportQuerySchema.extend(paginationQuerySchema.shape);

const idParamsSchema = z.object({ id: uuidSchema });
const programParamsSchema = z.object({ programId: uuidSchema });

/** Narrow, caller-validated metric scope — CSV/JSON reads share it. */
type MetricScope =
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'campaigns'; campaignIds: string[] }
  | { kind: 'program'; csrProgramId: string }
  | { kind: 'programs'; programIds: string[] };

interface DateRange {
  from?: Date;
  to?: Date;
}

function buildMetricWhere(scope: MetricScope, range: DateRange): Prisma.ImpactMetricWhereInput {
  const where: Prisma.ImpactMetricWhereInput = {};
  if (scope.kind === 'campaign') where.campaignId = scope.campaignId;
  if (scope.kind === 'campaigns') where.campaignId = { in: scope.campaignIds };
  if (scope.kind === 'program') where.csrProgramId = scope.csrProgramId;
  if (scope.kind === 'programs') where.csrProgramId = { in: scope.programIds };
  if (range.from || range.to) {
    where.createdAt = {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    };
  }
  return where;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(
  columns: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column])).join(','));
  return lines.join('\r\n');
}

export function csvResponse(
  fileName: string,
  csv: string,
  count: number,
  truncated: boolean,
): RawResponse {
  return new RawResponse(
    new Response(`${csv}\r\n`, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${fileName}"`,
        'x-content-type-options': 'nosniff',
        'x-export-count': String(count),
        'x-export-truncated': String(truncated),
      },
    }),
  );
}

type MetricRow = Prisma.ImpactMetricGetPayload<{ select: typeof METRIC_SELECT }>;

function toExportRows(rows: ReadonlyArray<MetricRow>): Array<Record<string, string>> {
  return rows.map((row) => ({
    id: row.id,
    metricType: row.metricType,
    name: row.name,
    target: row.target ? row.target.toString() : '',
    actual: row.actual.toString(),
    unit: row.unit,
    source: row.source,
    verified: String(row.verified),
    campaignId: row.campaignId ?? '',
    csrProgramId: row.csrProgramId ?? '',
    createdAt: row.createdAt.toISOString(),
  }));
}

interface SummaryGroup {
  metricType: string;
  total: number;
  count: number;
  verifiedCount: number;
}

function groupSummary(
  rows: ReadonlyArray<Pick<MetricRow, 'metricType' | 'actual' | 'verified'>>,
): SummaryGroup[] {
  const groups = new Map<string, SummaryGroup>();
  for (const row of rows) {
    const group = groups.get(row.metricType) ?? {
      metricType: row.metricType,
      total: 0,
      count: 0,
      verifiedCount: 0,
    };
    group.total += row.actual.toNumber();
    group.count += 1;
    if (row.verified) group.verifiedCount += 1;
    groups.set(row.metricType, group);
  }
  return [...groups.values()].sort((a, b) => a.metricType.localeCompare(b.metricType));
}

function assertFormat(format: 'json' | 'csv' | 'pdf'): void {
  if (format === 'pdf') {
    throw AppError.notImplemented(
      'PDF impact reports are not available in this build — use format=json or format=csv.',
    );
  }
}

/** Shared CSV export path: capped, tenant-scoped, audited by the caller. */
async function exportMetricsCsv(
  scope: MetricScope,
  range: DateRange,
  fileName: string,
): Promise<RawResponse> {
  const where = buildMetricWhere(scope, range);
  const prisma = getPrisma();
  const total = await prisma.impactMetric.count({ where });
  const rows = await prisma.impactMetric.findMany({
    where,
    select: METRIC_SELECT,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: EXPORT_LIMIT,
  });
  const truncated = total > EXPORT_LIMIT;
  return csvResponse(fileName, toCsv(IMPACT_COLUMNS, toExportRows(rows)), rows.length, truncated);
}

// ── Platform aggregates ─────────────────────────────────────────

export async function totals(): Promise<unknown> {
  const prisma = getPrisma();
  const [
    activeCampaigns,
    participants,
    verifiedHours,
    certificates,
    opportunities,
    organizations,
    sponsors,
    volunteers,
    verifiedMetrics,
    reportedMetrics,
  ] = await Promise.all([
    prisma.campaign.count({ where: { status: 'ACTIVE' } }),
    prisma.campaignParticipant.count({
      where: { status: { in: ['REGISTERED', 'ACTIVE', 'COMPLETED'] } },
    }),
    prisma.volunteerHour.aggregate({ where: { status: 'VERIFIED' }, _sum: { hours: true } }),
    prisma.volunteerCertificate.count({ where: { status: 'VALID' } }),
    prisma.opportunity.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
    prisma.organization.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    prisma.sponsor.count({ where: { status: 'ACTIVE', deletedAt: null } }),
    prisma.volunteerProfile.count({ where: { user: { deletedAt: null } } }),
    prisma.impactMetric.count({ where: { verified: true } }),
    prisma.impactMetric.count(),
  ]);

  return {
    totals: {
      activeCampaigns,
      campaignParticipants: participants,
      verifiedHours: verifiedHours._sum.hours ? verifiedHours._sum.hours.toNumber() : 0,
      validCertificates: certificates,
      publishedOpportunities: opportunities,
      activeOrganizations: organizations,
      activeSponsors: sponsors,
      registeredVolunteers: volunteers,
      verifiedMetrics,
      reportedMetrics,
    },
    generatedAt: new Date().toISOString(),
  };
}

async function listMetrics(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, metricsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.ImpactMetricWhereInput = {};
  if (f.campaignId) where.campaignId = f.campaignId;
  if (f.csrProgramId) where.csrProgramId = f.csrProgramId;
  if (f.opportunityId) where.opportunityId = f.opportunityId;

  const [total, items] = await Promise.all([
    prisma.impactMetric.count({ where }),
    prisma.impactMetric.findMany({
      where,
      select: METRIC_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Reports ─────────────────────────────────────────────────────

async function organizationReport(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'analytics.read');
  const f = query(ctx, reportQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  if (f.csrProgramId) {
    throw AppError.validation('csrProgramId is not valid for an organization report.', [
      { path: 'csrProgramId', code: 'not_allowed', message: 'CSR programs belong to sponsors.' },
    ]);
  }

  let scope: MetricScope;
  if (f.campaignId) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: f.campaignId, organizationId: org.orgId },
      select: { id: true, name: true, status: true },
    });
    if (!campaign) throw AppError.notFound('Campaign not found.');
    scope = { kind: 'campaign', campaignId: campaign.id };
  } else {
    const campaignIds = await prisma.campaign
      .findMany({ where: { organizationId: org.orgId }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id));
    scope = { kind: 'campaigns', campaignIds };
  }

  const range: DateRange = { from: f.from, to: f.to };
  assertFormat(f.format);

  if (f.format === 'csv') {
    const response = await exportMetricsCsv(scope, range, `bladna-impact-${org.orgId}.csv`);
    await audit({
      actorUserId: org.user.userId,
      organizationId: org.orgId,
      action: 'impact.report_export',
      entityType: 'organization',
      entityId: org.orgId,
      after: { format: 'csv', scope: scope.kind, from: f.from ?? null, to: f.to ?? null },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return response;
  }

  const where = buildMetricWhere(scope, range);
  const [allMetricRows, participants, verifiedHours, campaignsByStatus, total, items] =
    await Promise.all([
      prisma.impactMetric.findMany({
        where,
        select: { metricType: true, actual: true, verified: true },
      }),
      prisma.campaignParticipant.count({ where: { campaign: { organizationId: org.orgId } } }),
      prisma.volunteerHour.aggregate({
        where: { organizationId: org.orgId, status: 'VERIFIED' },
        _sum: { hours: true },
      }),
      prisma.campaign.groupBy({
        by: ['status'],
        where: { organizationId: org.orgId },
        _count: true,
      }),
      prisma.impactMetric.count({ where }),
      prisma.impactMetric.findMany({
        where,
        select: METRIC_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);

  return {
    report: {
      scope: 'organization',
      organizationId: org.orgId,
      from: f.from ?? null,
      to: f.to ?? null,
      summary: groupSummary(allMetricRows),
      totals: {
        participants,
        verifiedHours: verifiedHours._sum.hours ? verifiedHours._sum.hours.toNumber() : 0,
      },
      campaignsByStatus: campaignsByStatus.map((row) => ({
        status: row.status,
        count: row._count,
      })),
    },
    items,
    meta: buildPageMeta(total, { page, limit }),
  };
}

async function sponsorReport(ctx: RequestContext): Promise<unknown> {
  const sponsor = await requireSponsorPermission(ctx, 'impact.read');
  const f = query(ctx, reportQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  if (f.campaignId) {
    throw AppError.validation('campaignId is not valid for a sponsor report.', [
      {
        path: 'campaignId',
        code: 'not_allowed',
        message: 'Campaign metrics belong to organizations.',
      },
    ]);
  }

  let scope: MetricScope;
  if (f.csrProgramId) {
    const program = await prisma.cSRProgram.findFirst({
      where: { id: f.csrProgramId, sponsorId: sponsor.sponsorId },
      select: { id: true },
    });
    if (!program) throw AppError.notFound('CSR program not found.');
    scope = { kind: 'program', csrProgramId: program.id };
  } else {
    const programIds = await prisma.cSRProgram
      .findMany({ where: { sponsorId: sponsor.sponsorId }, select: { id: true } })
      .then((rows) => rows.map((row) => row.id));
    scope = { kind: 'programs', programIds };
  }

  const range: DateRange = { from: f.from, to: f.to };
  assertFormat(f.format);

  if (f.format === 'csv') {
    const response = await exportMetricsCsv(scope, range, `bladna-impact-${sponsor.sponsorId}.csv`);
    await audit({
      actorUserId: sponsor.user.userId,
      action: 'impact.report_export',
      entityType: 'sponsor',
      entityId: sponsor.sponsorId,
      after: { format: 'csv', scope: scope.kind, from: f.from ?? null, to: f.to ?? null },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return response;
  }

  const where = buildMetricWhere(scope, range);
  const [allMetricRows, sponsorships, programsByStatus, total, items] = await Promise.all([
    prisma.impactMetric.findMany({
      where,
      select: { metricType: true, actual: true, verified: true },
    }),
    prisma.sponsorship.aggregate({
      where: { sponsorId: sponsor.sponsorId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.cSRProgram.groupBy({
      by: ['status'],
      where: { sponsorId: sponsor.sponsorId },
      _count: true,
    }),
    prisma.impactMetric.count({ where }),
    prisma.impactMetric.findMany({
      where,
      select: METRIC_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    }),
  ]);

  return {
    report: {
      scope: 'sponsor',
      sponsorId: sponsor.sponsorId,
      from: f.from ?? null,
      to: f.to ?? null,
      summary: groupSummary(allMetricRows),
      totals: {
        sponsorshipCount: sponsorships._count,
        sponsoredAmount: sponsorships._sum.amount ? sponsorships._sum.amount.toNumber() : 0,
      },
      programsByStatus: programsByStatus.map((row) => ({ status: row.status, count: row._count })),
    },
    items,
    meta: buildPageMeta(total, { page, limit }),
  };
}

// ── Metric writes (tenant-scoped) ───────────────────────────────

async function createCampaignMetric(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'campaign.update');
  const { id: campaignId } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createImpactMetricSchema);
  const prisma = getPrisma();

  if (input.csrProgramId) {
    throw AppError.validation('csrProgramId is not allowed on an organization metric.', [
      {
        path: 'csrProgramId',
        code: 'not_allowed',
        message: 'CSR metrics are created by sponsors.',
      },
    ]);
  }
  if (input.campaignId && input.campaignId !== campaignId) {
    throw AppError.validation('campaignId does not match the path.', [
      {
        path: 'campaignId',
        code: 'mismatch',
        message: 'campaignId must match the campaign in the path.',
      },
    ]);
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: org.orgId },
    select: { id: true },
  });
  if (!campaign) throw AppError.notFound('Campaign not found.');

  const metric = await prisma.impactMetric.create({
    data: {
      campaignId,
      csrProgramId: null,
      metricType: input.metricType,
      name: input.name,
      target: input.target ?? null,
      actual: input.actual,
      unit: input.unit,
      source: input.source,
      verified: false,
    },
  });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'impact.metric_create',
    entityType: 'impactMetric',
    entityId: metric.id,
    after: { campaignId, metricType: input.metricType, actual: input.actual },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { metric };
}

async function createProgramMetric(ctx: RequestContext): Promise<unknown> {
  const sponsor = await requireSponsorPermission(ctx, 'csr.manage');
  const { programId } = pathParams(ctx, programParamsSchema);
  const input = await body(ctx, createImpactMetricSchema);
  const prisma = getPrisma();

  if (input.campaignId) {
    throw AppError.validation('campaignId is not allowed on a sponsor metric.', [
      {
        path: 'campaignId',
        code: 'not_allowed',
        message: 'Campaign metrics are created by organizations.',
      },
    ]);
  }
  if (input.csrProgramId && input.csrProgramId !== programId) {
    throw AppError.validation('csrProgramId does not match the path.', [
      {
        path: 'csrProgramId',
        code: 'mismatch',
        message: 'csrProgramId must match the program in the path.',
      },
    ]);
  }

  const program = await prisma.cSRProgram.findFirst({
    where: { id: programId, sponsorId: sponsor.sponsorId },
    select: { id: true },
  });
  if (!program) throw AppError.notFound('CSR program not found.');

  const metric = await prisma.impactMetric.create({
    data: {
      campaignId: null,
      csrProgramId: programId,
      metricType: input.metricType,
      name: input.name,
      target: input.target ?? null,
      actual: input.actual,
      unit: input.unit,
      source: input.source,
      verified: false,
    },
  });
  await audit({
    actorUserId: sponsor.user.userId,
    action: 'impact.metric_create',
    entityType: 'impactMetric',
    entityId: metric.id,
    after: { csrProgramId: programId, metricType: input.metricType, actual: input.actual },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { metric };
}

/** Initiative-level metric (spec §14): need → support → execution → result. */
async function createOpportunityMetric(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'opportunity.update');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, createImpactMetricSchema);
  const prisma = getPrisma();

  if (input.campaignId || input.csrProgramId) {
    throw AppError.validation('campaignId/csrProgramId are not allowed on an initiative metric.', [
      {
        path: 'campaignId',
        code: 'not_allowed',
        message: 'Initiative metrics reference the initiative in the path.',
      },
    ]);
  }

  const opportunity = await prisma.opportunity.findFirst({
    where: { id, organizationId: org.orgId, deletedAt: null },
    select: { id: true },
  });
  if (!opportunity) throw AppError.notFound('Opportunity not found.');

  const metric = await prisma.impactMetric.create({
    data: {
      campaignId: null,
      csrProgramId: null,
      opportunityId: id,
      metricType: input.metricType,
      name: input.name,
      target: input.target ?? null,
      actual: input.actual,
      unit: input.unit,
      source: input.source,
      verified: false,
    },
  });
  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'impact.metric_create',
    entityType: 'impactMetric',
    entityId: metric.id,
    after: { opportunityId: id, metricType: input.metricType, actual: input.actual },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { metric };
}

// ── Impact evidence (P34 — design §5: upload by the tenant, verify by the officer) ──

type MetricAnchor = { orgId: string } | { sponsorId: string };

/** Which tenant owns a metric: campaign/initiative → organization, program → sponsor. */
async function resolveMetricAnchor(metricId: string): Promise<MetricAnchor> {
  const metric = await getPrisma().impactMetric.findUnique({
    where: { id: metricId },
    select: {
      id: true,
      campaign: { select: { organizationId: true } },
      opportunity: { select: { organizationId: true } },
      csrProgram: { select: { sponsorId: true } },
    },
  });
  if (!metric) throw AppError.notFound('Impact metric not found.');
  if (metric.campaign) return { orgId: metric.campaign.organizationId };
  if (metric.opportunity) return { orgId: metric.opportunity.organizationId };
  if (metric.csrProgram) return { sponsorId: metric.csrProgram.sponsorId };
  throw AppError.forbidden('This metric has no tenant anchor.');
}

async function listMetricEvidence(ctx: RequestContext): Promise<unknown> {
  const { metricId } = pathParams(ctx, metricIdParamsSchema);
  const anchor = await resolveMetricAnchor(metricId);
  if ('orgId' in anchor) {
    await requireOrgMembership(ctx, 'organization.read', { orgId: anchor.orgId });
  } else {
    await requireSponsorPermission(ctx, 'impact.read', { sponsorId: anchor.sponsorId });
  }
  const items = await getPrisma().impactEvidence.findMany({
    where: { metricId },
    orderBy: [{ createdAt: 'desc' }],
  });
  return { items };
}

/** Tenant uploads PENDING evidence against its own metric (officer decides). */
async function uploadMetricEvidence(ctx: RequestContext): Promise<unknown> {
  const { metricId } = pathParams(ctx, metricIdParamsSchema);
  const input = await body(ctx, uploadEvidenceSchema);
  const anchor = await resolveMetricAnchor(metricId);

  let actorUserId: string;
  let organizationId: string | null = null;
  if ('orgId' in anchor) {
    const org = await requireOrgMembership(ctx, 'partnership.evidence.manage', {
      orgId: anchor.orgId,
    });
    actorUserId = org.user.userId;
    organizationId = org.orgId;
  } else {
    const sponsor = await requireSponsorPermission(ctx, 'csr.manage', {
      sponsorId: anchor.sponsorId,
    });
    actorUserId = sponsor.user.userId;
  }

  const evidence = await getPrisma().impactEvidence.create({
    data: {
      metricId,
      type: input.type,
      documentId: input.documentId,
      note: input.note,
      uploadedById: actorUserId,
    },
  });
  await audit({
    actorUserId,
    organizationId,
    action: 'EVIDENCE_UPLOADED',
    entityType: 'impactEvidence',
    entityId: evidence.id,
    after: { metricId, type: evidence.type, status: evidence.status },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { evidence };
}

/** Verification officer only (design §6 «وحده») — terminal PENDING decision. */
async function verifyMetricEvidence(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'impact.evidence.verify');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, verifyEvidenceSchema);
  const prisma = getPrisma();

  const evidence = await prisma.impactEvidence.findUnique({
    where: { id },
    select: { id: true, status: true, metricId: true },
  });
  if (!evidence) throw AppError.notFound('Evidence not found.');

  assertTransition(
    EVIDENCE_TRANSITIONS,
    evidence.status as 'PENDING' | 'VERIFIED' | 'REJECTED',
    input.action,
    'impact evidence',
  );
  const updated = await prisma.impactEvidence.update({
    where: { id },
    data: {
      status: input.action,
      verifiedById: user.userId,
      verifiedAt: new Date(),
      ...(input.reason ? { rejectReason: input.reason } : {}),
    },
  });
  await audit({
    actorUserId: user.userId,
    action: input.action === 'VERIFIED' ? 'IMPACT_VERIFIED' : 'EVIDENCE_REJECTED',
    entityType: 'impactEvidence',
    entityId: id,
    before: { status: evidence.status },
    after: { status: updated.status, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { evidence: updated };
}

// ── Route table ─────────────────────────────────────────────────

export const impactRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/impact',
    handler: totals,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Platform impact totals (computed from persisted rows)',
  },
  {
    method: 'GET',
    path: '/impact/metrics',
    handler: listMetrics,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List impact metrics (paginated)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/impact/report',
    handler: organizationReport,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Organization impact report (json/csv, paginated)',
  },
  {
    method: 'GET',
    path: '/sponsors/:sponsorId/impact/report',
    handler: sponsorReport,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'Sponsor impact report (json/csv, paginated)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/campaigns/:campaignId/metrics',
    handler: createCampaignMetric,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Record a campaign impact metric',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/opportunities/:id/metrics',
    handler: createOpportunityMetric,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Record an initiative impact metric (self-reported, verified=false)',
  },
  {
    method: 'POST',
    path: '/sponsors/:sponsorId/programs/:programId/metrics',
    handler: createProgramMetric,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'Record a CSR program impact metric',
  },
  // impact evidence (P34)
  {
    method: 'GET',
    path: '/impact/metrics/:metricId/evidence',
    handler: listMetricEvidence,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Evidence attached to a metric (owning tenant)',
  },
  {
    method: 'POST',
    path: '/impact/metrics/:metricId/evidence',
    handler: uploadMetricEvidence,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Upload PENDING evidence for a metric (owning tenant)',
  },
  {
    method: 'POST',
    path: '/impact-evidence/:id/verify',
    handler: verifyMetricEvidence,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Verify or reject evidence (verification officer only, terminal)',
  },
];
