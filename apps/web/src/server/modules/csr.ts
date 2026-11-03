// CSR programs module (spec §66).
//
// Sponsor-owned programs with the local PROGRAM_TRANSITIONS state machine.
// The public surface only ever sees ACTIVE/COMPLETED programs; DRAFT, PAUSED
// and ARCHIVED rows live in the sponsor workspace.

import { getPrisma, type Prisma } from '@bladna/database';
import { assertTransition, type TransitionMap } from '@bladna/domain';
import { AppError } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  createCsrProgramSchema,
  idParamsSchema,
  paginationQuerySchema,
  programActionSchema,
  updateCsrProgramSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { requireSponsorPermission } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { audit } from '../services/audit';
import type { AppRoute } from '../router';

type ProgramStatusLiteral = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

/**
 * CSR program lifecycle (spec §107): drafted, activated, paused, completed,
 * and archived once finished. ARCHIVED is terminal.
 */
export const PROGRAM_TRANSITIONS: TransitionMap<ProgramStatusLiteral> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'ARCHIVED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'ARCHIVED'],
  COMPLETED: ['ARCHIVED'],
  ARCHIVED: [],
};

type ProgramAction = z.infer<typeof programActionSchema>['action'];

const PROGRAM_ACTION_TARGET: Record<ProgramAction, ProgramStatusLiteral> = {
  ACTIVATE: 'ACTIVE',
  PAUSE: 'PAUSED',
  COMPLETE: 'COMPLETED',
  ARCHIVE: 'ARCHIVED',
};

const sponsorParamsSchema = z.object({ sponsorId: z.string().uuid() });
const programParamsSchema = z.object({
  sponsorId: z.string().uuid(),
  programId: z.string().uuid(),
});

const programListSchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED']).optional(),
});

/** Statuses the anonymous public surface may ever see. */
const PUBLIC_PROGRAM_STATUSES: ProgramStatusLiteral[] = ['ACTIVE', 'COMPLETED'];

const PROGRAM_PUBLIC_SELECT = {
  id: true,
  title: true,
  description: true,
  budget: true,
  currency: true,
  startDate: true,
  endDate: true,
  status: true,
  volunteerTarget: true,
  hourTarget: true,
  beneficiaryTarget: true,
  impactTarget: true,
  createdAt: true,
  sponsor: { select: { id: true, commercialName: true, slug: true, logo: true } },
} as const satisfies Prisma.CSRProgramSelect;

const PROGRAM_WORKSPACE_SELECT = {
  ...PROGRAM_PUBLIC_SELECT,
  sponsorId: true,
  updatedAt: true,
} as const satisfies Prisma.CSRProgramSelect;

async function loadWorkspaceProgram(sponsorId: string, programId: string) {
  const program = await getPrisma().cSRProgram.findFirst({
    where: { id: programId, sponsorId },
    select: { id: true, status: true, title: true },
  });
  if (!program) throw AppError.notFound('CSR program not found.');
  return program;
}

// ── Public surface ─────────────────────────────────────────────

async function publicList(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, programListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.CSRProgramWhereInput = {};
  if (f.status && !PUBLIC_PROGRAM_STATUSES.includes(f.status)) {
    // Asking for an unpublished status yields an empty page instead of
    // confirming DRAFT/PAUSED/ARCHIVED programs.
    where.status = { in: [] };
  } else {
    where.status = f.status ? f.status : { in: PUBLIC_PROGRAM_STATUSES };
  }
  if (f.q) {
    where.OR = [
      { title: { contains: f.q, mode: 'insensitive' } },
      { description: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.cSRProgram.count({ where }),
    prisma.cSRProgram.findMany({
      where,
      select: PROGRAM_PUBLIC_SELECT,
      orderBy: { startDate: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function publicDetail(ctx: RequestContext): Promise<unknown> {
  const { id } = pathParams(ctx, idParamsSchema);
  const program = await getPrisma().cSRProgram.findFirst({
    where: { id, status: { in: PUBLIC_PROGRAM_STATUSES } },
    select: PROGRAM_PUBLIC_SELECT,
  });
  if (!program) throw AppError.notFound('CSR program not found.');
  return { program };
}

// ── Sponsor workspace ──────────────────────────────────────────

async function workspaceList(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  await requireSponsorPermission(ctx, 'sponsor.read');
  const f = query(ctx, programListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.CSRProgramWhereInput = { sponsorId };
  if (f.status) where.status = f.status;
  if (f.q) {
    where.OR = [
      { title: { contains: f.q, mode: 'insensitive' } },
      { description: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.cSRProgram.count({ where }),
    prisma.cSRProgram.findMany({
      where,
      select: PROGRAM_WORKSPACE_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function workspaceDetail(ctx: RequestContext): Promise<unknown> {
  const { sponsorId, programId } = pathParams(ctx, programParamsSchema);
  await requireSponsorPermission(ctx, 'sponsor.read');
  await loadWorkspaceProgram(sponsorId, programId);
  const program = await getPrisma().cSRProgram.findUnique({
    where: { id: programId },
    select: PROGRAM_WORKSPACE_SELECT,
  });
  if (!program) throw AppError.notFound('CSR program not found.');
  return { program };
}

async function workspaceCreate(ctx: RequestContext): Promise<unknown> {
  const { sponsorId } = pathParams(ctx, sponsorParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'csr.create');
  const input = await body(ctx, createCsrProgramSchema);

  const program = await getPrisma().cSRProgram.create({
    data: {
      sponsorId,
      title: input.title,
      description: input.description ?? null,
      budget: input.budget,
      currency: input.currency,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'DRAFT' as const,
      volunteerTarget: input.volunteerTarget ?? null,
      hourTarget: input.hourTarget ?? null,
      beneficiaryTarget: input.beneficiaryTarget ?? null,
      impactTarget: input.impactTarget ?? null,
    },
    select: PROGRAM_WORKSPACE_SELECT,
  });
  await audit({
    actorUserId: user.userId,
    action: 'csr.program_create',
    entityType: 'csrProgram',
    entityId: program.id,
    after: { sponsorId, status: program.status, title: input.title },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { program };
}

async function workspaceUpdate(ctx: RequestContext): Promise<unknown> {
  const { sponsorId, programId } = pathParams(ctx, programParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'csr.manage');
  const input = await body(ctx, updateCsrProgramSchema);
  const existing = await loadWorkspaceProgram(sponsorId, programId);
  const prisma = getPrisma();

  if (input.startDate && input.endDate && input.endDate.getTime() < input.startDate.getTime()) {
    throw AppError.validation('endDate must not be before startDate.', [
      { path: 'endDate', code: 'invalid_order', message: 'endDate must not be before startDate.' },
    ]);
  }

  const data: Prisma.CSRProgramUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.budget !== undefined) data.budget = input.budget;
  if (input.currency !== undefined) data.currency = input.currency;
  if (input.startDate !== undefined) data.startDate = input.startDate;
  if (input.endDate !== undefined) data.endDate = input.endDate;
  if (input.volunteerTarget !== undefined) data.volunteerTarget = input.volunteerTarget;
  if (input.hourTarget !== undefined) data.hourTarget = input.hourTarget;
  if (input.beneficiaryTarget !== undefined) data.beneficiaryTarget = input.beneficiaryTarget;
  if (input.impactTarget !== undefined) data.impactTarget = input.impactTarget;

  const program = await prisma.cSRProgram.update({ where: { id: programId }, data });
  await audit({
    actorUserId: user.userId,
    action: 'csr.program_update',
    entityType: 'csrProgram',
    entityId: programId,
    before: { status: existing.status },
    after: { fields: Object.keys(data) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { program };
}

async function workspaceTransition(ctx: RequestContext): Promise<unknown> {
  const { sponsorId, programId } = pathParams(ctx, programParamsSchema);
  const { user } = await requireSponsorPermission(ctx, 'csr.manage');
  const input = await body(ctx, programActionSchema);
  const existing = await loadWorkspaceProgram(sponsorId, programId);

  const target = PROGRAM_ACTION_TARGET[input.action];
  assertTransition(PROGRAM_TRANSITIONS, existing.status, target, 'CSR program');

  const program = await getPrisma().cSRProgram.update({
    where: { id: programId },
    data: { status: target },
    select: PROGRAM_WORKSPACE_SELECT,
  });
  await audit({
    actorUserId: user.userId,
    action: 'csr.program_transition',
    entityType: 'csrProgram',
    entityId: programId,
    before: { status: existing.status },
    after: { status: target, reason: input.reason ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { program };
}

// ── Route table ─────────────────────────────────────────────────

export const csrRoutes: AppRoute[] = [
  // public (ACTIVE/COMPLETED only)
  {
    method: 'GET',
    path: '/csr/programs',
    handler: publicList,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'List public CSR programs (ACTIVE/COMPLETED)',
  },
  {
    method: 'GET',
    path: '/csr/programs/:id',
    handler: publicDetail,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Public CSR program detail',
  },
  // sponsor workspace
  {
    method: 'GET',
    path: '/sponsors/:sponsorId/programs',
    handler: workspaceList,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'List CSR programs (workspace, paginated)',
  },
  {
    method: 'POST',
    path: '/sponsors/:sponsorId/programs',
    handler: workspaceCreate,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'Create a CSR program (DRAFT)',
  },
  {
    method: 'GET',
    path: '/sponsors/:sponsorId/programs/:programId',
    handler: workspaceDetail,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'CSR program detail (workspace)',
  },
  {
    method: 'PATCH',
    path: '/sponsors/:sponsorId/programs/:programId',
    handler: workspaceUpdate,
    options: { rateLimit: 'authenticated' },
    auth: 'sponsor',
    summary: 'Update a CSR program',
  },
  {
    method: 'POST',
    path: '/sponsors/:sponsorId/programs/:programId/transition',
    handler: workspaceTransition,
    options: { rateLimit: 'auth' },
    auth: 'sponsor',
    summary: 'CSR program status transition (state machine)',
  },
];
