// Platform administration module (spec §108–§111).
//
// Every privileged mutation requires a reason where it is destructive, runs
// through guards (never hand-rolled checks), records an AdminAction row and an
// AuditLog entry, and notifies the affected user with localized copy. Data
// exports read real rows only, are capped, and are themselves audited.

import { getPrisma, type Prisma } from '@bladna/database';
import { assertTransition, organizationBadge, type TransitionMap } from '@bladna/domain';
import { AppError, SYSTEM_ROLES, type LocaleCode } from '@bladna/types';
import { buildPageMeta, normalizePageParams } from '@bladna/utils';
import {
  adminDataExportSchema,
  adminOrganizationActionSchema,
  adminOrganizationsQuerySchema,
  adminUserActionSchema,
  adminUsersQuerySchema,
  auditQuerySchema,
  featureFlagSchema,
  idParamsSchema,
  paginationQuerySchema,
  settingSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { requireSystemPermission } from '../guards';
import { body, pathParams, query, type RequestContext } from '../http';
import { clearFlagCache, getFeatureFlags } from '../infra/flags';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import { EXPORT_LIMIT, csvResponse, toCsv } from './impact';
import type { AppRoute } from '../router';

type OrganizationStatusLiteral = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';

/**
 * Organization lifecycle (spec §107) — shared with moderation/risk so a
 * suspension can never be applied outside the state machine.
 */
export const ORGANIZATION_STATUS_TRANSITIONS: TransitionMap<OrganizationStatusLiteral> = {
  PENDING_VERIFICATION: ['ACTIVE', 'SUSPENDED'],
  ACTIVE: ['SUSPENDED', 'ARCHIVED'],
  SUSPENDED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: ['ACTIVE'],
};

type OrgAction = 'SUSPEND' | 'RESTORE';

const ORG_ACTION_TARGET: Record<OrgAction, OrganizationStatusLiteral> = {
  SUSPEND: 'SUSPENDED',
  RESTORE: 'ACTIVE',
};

const settingsListSchema = paginationQuerySchema.extend({
  key: z.string().trim().max(120).optional(),
});

const settingKeyParamsSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-zA-Z0-9._:-]+$/, 'INVALID_KEY'),
});

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  preferredLanguage: true,
  roles: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  suspendedUntil: true,
  suspendReason: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  _count: { select: { sessions: true, memberships: true } },
} as const satisfies Prisma.UserSelect;

type SecurityAction = 'SUSPEND' | 'BAN' | 'FORCE_LOGOUT';

/** Trilingual SECURITY_ALERT copy — reason text never goes to the target. */
const SECURITY_COPY: Record<LocaleCode, Record<SecurityAction, { title: string; body: string }>> = {
  ar: {
    SUSPEND: {
      title: 'تعليق الحساب',
      body: 'تم تعليق حسابك على منصة بلادنا. تواصل مع الدعم إذا كنت تعتقد أن هذا قرار خاطئ.',
    },
    BAN: {
      title: 'حظر الحساب',
      body: 'تم حظر حسابك على منصة بلادنا. تواصل مع الدعم إذا كنت تعتقد أن هذا قرار خاطئ.',
    },
    FORCE_LOGOUT: {
      title: 'تسجيل خروج إجباري',
      body: 'تم تسجيل خروج جميع جلساتك على منصة بلادنا. سجّل الدخول مرة أخرى للمتابعة.',
    },
  },
  fr: {
    SUSPEND: {
      title: 'Compte suspendu',
      body: 'Votre compte a été suspendu sur la plateforme Bladna. Contactez le support si vous pensez qu’il s’agit d’une erreur.',
    },
    BAN: {
      title: 'Compte banni',
      body: 'Votre compte a été banni sur la plateforme Bladna. Contactez le support si vous pensez qu’il s’agit d’une erreur.',
    },
    FORCE_LOGOUT: {
      title: 'Déconnexion forcée',
      body: 'Toutes vos sessions ont été déconnectées de la plateforme Bladna. Reconnectez-vous pour continuer.',
    },
  },
  en: {
    SUSPEND: {
      title: 'Account suspended',
      body: 'Your account has been suspended on the Bladna platform. Contact support if you believe this is a mistake.',
    },
    BAN: {
      title: 'Account banned',
      body: 'Your account has been banned on the Bladna platform. Contact support if you believe this is a mistake.',
    },
    FORCE_LOGOUT: {
      title: 'Forced sign-out',
      body: 'All of your sessions have been signed out of the Bladna platform. Sign in again to continue.',
    },
  },
};

// ── Users ──────────────────────────────────────────────────────

async function listUsers(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'user.read');
  const f = query(ctx, adminUsersQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.UserWhereInput = {};
  if (f.status) where.status = f.status;
  if (f.role) where.roles = { has: f.role as (typeof SYSTEM_ROLES)[number] };
  if (f.q) {
    where.OR = [
      { email: { contains: f.q, mode: 'insensitive' } },
      { firstName: { contains: f.q, mode: 'insensitive' } },
      { lastName: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: ADMIN_USER_SELECT,
      orderBy: f.sort === 'email' ? { email: 'asc' } : { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function getUser(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'user.read');
  const { id } = pathParams(ctx, idParamsSchema);
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...ADMIN_USER_SELECT,
      memberships: {
        select: {
          role: true,
          status: true,
          organization: { select: { id: true, name: true, slug: true, status: true } },
        },
      },
      sponsorMemberships: { select: { id: true, role: true, sponsorId: true } },
    },
  });
  if (!user || user.deletedAt) throw AppError.notFound('User not found.');
  return { user };
}

async function notifySecurity(
  userId: string,
  action: SecurityAction,
  preferredLanguage: string,
): Promise<void> {
  const locale = (preferredLanguage as string).toLowerCase() as LocaleCode;
  const copy = SECURITY_COPY[locale] ?? SECURITY_COPY.en;
  try {
    await notify({
      userId,
      type: 'SECURITY_ALERT',
      title: copy[action].title,
      body: copy[action].body,
      data: { action },
    });
  } catch (error) {
    console.warn('[admin] SECURITY_ALERT notification failed', {
      userId,
      action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function userAction(ctx: RequestContext): Promise<unknown> {
  const reader = await requireSystemPermission(ctx, 'user.read');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, adminUserActionSchema);

  const permission =
    input.action === 'CHANGE_ROLE' ? ('user.role.manage' as const) : ('user.suspend' as const);
  const actor = await requireSystemPermission(ctx, permission);

  if (id === reader.userId) {
    throw AppError.forbidden('You cannot perform this action on your own account.');
  }

  if ((input.action === 'SUSPEND' || input.action === 'BAN') && !input.reason?.trim()) {
    throw AppError.validation('A reason is required for this action.', [
      { path: 'reason', code: 'required', message: 'Provide a reason.' },
    ]);
  }

  let roles: (typeof SYSTEM_ROLES)[number][] | undefined;
  if (input.action === 'CHANGE_ROLE') {
    if (!input.roles || input.roles.length === 0) {
      throw AppError.validation('roles is required for CHANGE_ROLE.', [
        { path: 'roles', code: 'required', message: 'Provide at least one role.' },
      ]);
    }
    roles = [];
    for (const role of input.roles) {
      if (!(SYSTEM_ROLES as readonly string[]).includes(role)) {
        throw AppError.validation(`Unknown role: ${role}`, [
          { path: 'roles', code: 'invalid_role', message: `${role} is not a system role.` },
        ]);
      }
      roles.push(role as (typeof SYSTEM_ROLES)[number]);
    }
  }

  const prisma = getPrisma();
  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      status: true,
      roles: true,
      preferredLanguage: true,
      deletedAt: true,
    },
  });
  if (!target || target.deletedAt) throw AppError.notFound('User not found.');

  let revokedSessions = 0;

  switch (input.action) {
    case 'SUSPEND': {
      await prisma.user.update({
        where: { id },
        data: {
          status: 'SUSPENDED',
          suspendReason: input.reason ?? null,
          suspendedUntil: input.suspendedUntil ?? null,
        },
      });
      break;
    }
    case 'REINSTATE': {
      await prisma.user.update({
        where: { id },
        data: { status: 'ACTIVE', suspendReason: null, suspendedUntil: null },
      });
      break;
    }
    case 'BAN': {
      await prisma.user.update({
        where: { id },
        data: { status: 'BANNED', suspendReason: input.reason ?? null, suspendedUntil: null },
      });
      break;
    }
    case 'CHANGE_ROLE': {
      await prisma.user.update({ where: { id }, data: { roles: roles ?? [] } });
      break;
    }
    case 'FORCE_LOGOUT': {
      const result = await prisma.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'force_logout' },
      });
      revokedSessions = result.count;
      break;
    }
  }

  await prisma.adminAction.create({
    data: {
      adminUserId: actor.userId,
      action: input.action.toLowerCase(),
      targetType: 'user',
      targetId: id,
      reason: input.reason ?? null,
      requestId: ctx.requestId,
    },
  });
  await audit({
    actorUserId: actor.userId,
    action: `user.${input.action.toLowerCase()}`,
    entityType: 'user',
    entityId: id,
    before: { status: target.status, roles: target.roles },
    after: {
      action: input.action,
      status:
        input.action === 'SUSPEND'
          ? 'SUSPENDED'
          : input.action === 'BAN'
            ? 'BANNED'
            : input.action === 'REINSTATE'
              ? 'ACTIVE'
              : undefined,
      roles: roles ?? undefined,
      revokedSessions,
      reason: input.reason ?? null,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  if (input.action === 'SUSPEND' || input.action === 'BAN' || input.action === 'FORCE_LOGOUT') {
    await notifySecurity(id, input.action, target.preferredLanguage);
  }

  return {
    user: await prisma.user.findUnique({ where: { id }, select: ADMIN_USER_SELECT }),
    revokedSessions,
  };
}

// ── Organizations (suspend/restore only; verification lives elsewhere) ──

async function listOrganizations(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'organization.read:platform');
  const f = query(ctx, adminOrganizationsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.OrganizationWhereInput = { deletedAt: null };
  if (f.status) where.status = f.status;
  if (f.verificationStatus) where.verificationStatus = f.verificationStatus;
  if (f.organizationType) where.organizationType = f.organizationType;
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: 'insensitive' } },
      { legalName: { contains: f.q, mode: 'insensitive' } },
      { officialEmail: { contains: f.q, mode: 'insensitive' } },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      select: {
        id: true,
        name: true,
        legalName: true,
        slug: true,
        logo: true,
        organizationType: true,
        status: true,
        verificationStatus: true,
        trustLevel: true,
        verifiedAt: true,
        suspendedAt: true,
        suspendReason: true,
        createdAt: true,
        _count: { select: { members: true, opportunities: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => ({
    ...row,
    badge: organizationBadge(row.trustLevel, row.verificationStatus),
  }));
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function organizationAction(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'organization.read:platform');
  const { id } = pathParams(ctx, idParamsSchema);
  const input = await body(ctx, adminOrganizationActionSchema);

  if (input.action === 'VERIFY' || input.action === 'REJECT' || input.action === 'REQUEST_INFO') {
    throw AppError.forbidden(
      'Organization verification is handled at /admin/verifications — use the verification decision endpoints.',
    );
  }
  const actor = await requireSystemPermission(ctx, 'organization.suspend');

  if (input.action === 'SUSPEND' && !input.reason?.trim()) {
    throw AppError.validation('A reason is required to suspend an organization.', [
      { path: 'reason', code: 'required', message: 'Provide a reason.' },
    ]);
  }

  const prisma = getPrisma();
  const organization = await prisma.organization.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, status: true, suspendedAt: true, suspendReason: true },
  });
  if (!organization) throw AppError.notFound('Organization not found.');

  const target = ORG_ACTION_TARGET[input.action as OrgAction];
  assertTransition(ORGANIZATION_STATUS_TRANSITIONS, organization.status, target, 'organization');

  const updated = await prisma.organization.update({
    where: { id },
    data:
      target === 'SUSPENDED'
        ? { status: 'SUSPENDED', suspendedAt: new Date(), suspendReason: input.reason ?? null }
        : { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
  });

  await prisma.adminAction.create({
    data: {
      adminUserId: actor.userId,
      action: input.action.toLowerCase(),
      targetType: 'organization',
      targetId: id,
      reason: input.reason ?? null,
      requestId: ctx.requestId,
    },
  });
  await audit({
    actorUserId: actor.userId,
    action: `organization.${input.action.toLowerCase()}`,
    entityType: 'organization',
    entityId: id,
    before: { status: organization.status },
    after: { status: target, reason: input.reason ?? null, trustLevel: input.level ?? null },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { organization: updated };
}

// ── Audit ──────────────────────────────────────────────────────

async function listAudit(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'audit.read');
  const f = query(ctx, auditQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.AuditLogWhereInput = {};
  if (f.action) where.action = { contains: f.action };
  if (f.entityType) where.entityType = { contains: f.entityType };
  if (f.entityId) where.entityId = f.entityId;
  if (f.actorUserId) where.actorUserId = f.actorUserId;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: f.from } : {}),
      ...(f.to ? { lte: f.to } : {}),
    };
  }

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        actorUserId: true,
        actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        action: true,
        entityType: true,
        entityId: true,
        organizationId: true,
        metadata: true,
        ipAddress: true,
        userAgent: true,
        requestId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Settings ───────────────────────────────────────────────────

async function listSettings(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'admin.settings.manage');
  const f = query(ctx, settingsListSchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.SettingWhereInput = f.key ? { key: { contains: f.key } } : {};
  const [total, items] = await Promise.all([
    prisma.setting.count({ where }),
    prisma.setting.findMany({
      where,
      select: {
        key: true,
        scope: true,
        value: true,
        updatedBy: true,
        updatedAt: true,
        createdAt: true,
      },
      orderBy: { key: 'asc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function putSetting(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'admin.settings.manage');
  const input = await body(ctx, settingSchema);
  const prisma = getPrisma();

  const existing = await prisma.setting.findUnique({
    where: { key: input.key },
    select: { key: true, scope: true, value: true },
  });

  const setting = await prisma.setting.upsert({
    where: { key: input.key },
    create: {
      key: input.key,
      scope: input.scope,
      value: input.value as Prisma.InputJsonValue,
      updatedBy: user.userId,
    },
    update: {
      scope: input.scope,
      value: input.value as Prisma.InputJsonValue,
      updatedBy: user.userId,
    },
    select: { key: true, scope: true, value: true, updatedBy: true, updatedAt: true },
  });

  await audit({
    actorUserId: user.userId,
    action: 'admin.setting_set',
    entityType: 'setting',
    entityId: input.key,
    before: existing ? { scope: existing.scope, value: existing.value } : undefined,
    after: { scope: setting.scope, value: setting.value },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { setting };
}

async function deleteSetting(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'admin.settings.manage');
  const { key } = pathParams(ctx, settingKeyParamsSchema);
  const prisma = getPrisma();

  const existing = await prisma.setting.findUnique({
    where: { key },
    select: { key: true, scope: true, value: true },
  });
  if (!existing) throw AppError.notFound('Setting not found.');

  await prisma.setting.delete({ where: { key } });
  await audit({
    actorUserId: user.userId,
    action: 'admin.setting_delete',
    entityType: 'setting',
    entityId: key,
    before: { scope: existing.scope, value: existing.value },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { deleted: true };
}

// ── Feature flags ──────────────────────────────────────────────

async function listFlags(ctx: RequestContext): Promise<unknown> {
  await requireSystemPermission(ctx, 'featureflag.manage');
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const [total, items] = await Promise.all([
    prisma.featureFlag.count(),
    prisma.featureFlag.findMany({
      select: { key: true, description: true, enabled: true, rollout: true, updatedAt: true },
      orderBy: { key: 'asc' },
      skip,
      take,
    }),
  ]);
  // Effective resolution (env overrides included) is exposed alongside rows.
  const effective = await getFeatureFlags(true);
  return { items, effective, meta: buildPageMeta(total, { page, limit }) };
}

async function putFlag(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'featureflag.manage');
  const input = await body(ctx, featureFlagSchema);
  const prisma = getPrisma();

  const existing = await prisma.featureFlag.findUnique({
    where: { key: input.key },
    select: { key: true, enabled: true, description: true },
  });

  const flag = await prisma.featureFlag.upsert({
    where: { key: input.key },
    create: { key: input.key, enabled: input.enabled, description: input.description ?? null },
    update: { enabled: input.enabled, description: input.description ?? null },
    select: { key: true, description: true, enabled: true, updatedAt: true },
  });
  clearFlagCache();

  await audit({
    actorUserId: user.userId,
    action: 'admin.flag_set',
    entityType: 'featureFlag',
    entityId: input.key,
    before: existing ? { enabled: existing.enabled, description: existing.description } : undefined,
    after: { enabled: flag.enabled, description: flag.description },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { flag };
}

async function deleteFlag(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'featureflag.manage');
  const { key } = pathParams(ctx, settingKeyParamsSchema);
  const prisma = getPrisma();

  const existing = await prisma.featureFlag.findUnique({
    where: { key },
    select: { key: true, enabled: true, description: true },
  });
  if (!existing) throw AppError.notFound('Feature flag not found.');

  await prisma.featureFlag.delete({ where: { key } });
  clearFlagCache();

  await audit({
    actorUserId: user.userId,
    action: 'admin.flag_delete',
    entityType: 'featureFlag',
    entityId: key,
    before: { enabled: existing.enabled, description: existing.description },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { deleted: true };
}

// ── Data export ────────────────────────────────────────────────

type ExportKind = 'VOLUNTEERS' | 'ORGANIZATIONS' | 'CAMPAIGNS' | 'FINANCIAL';

const EXPORT_COLUMNS: Record<ExportKind, readonly string[]> = {
  VOLUNTEERS: [
    'id',
    'volunteerId',
    'email',
    'firstName',
    'lastName',
    'accountStatus',
    'verificationStatus',
    'publicProfile',
    'joinedAt',
    'createdAt',
  ],
  ORGANIZATIONS: [
    'id',
    'name',
    'slug',
    'organizationType',
    'status',
    'verificationStatus',
    'trustLevel',
    'officialEmail',
    'createdAt',
  ],
  CAMPAIGNS: [
    'id',
    'name',
    'slug',
    'status',
    'organizationId',
    'startDate',
    'endDate',
    'createdAt',
  ],
  FINANCIAL: [
    'id',
    'organizationId',
    'invoiceNumber',
    'amountDzd',
    'currency',
    'status',
    'method',
    'provider',
    'reference',
    'createdAt',
  ],
};

interface ExportWindow {
  from?: Date;
  to?: Date;
}

function createdAtWindow(window: ExportWindow): Prisma.DateTimeFilter {
  return {
    ...(window.from ? { gte: window.from } : {}),
    ...(window.to ? { lte: window.to } : {}),
  };
}

async function exportRows(
  kind: ExportKind,
  window: ExportWindow,
): Promise<Array<Record<string, unknown>>> {
  const prisma = getPrisma();
  const range = createdAtWindow(window);

  if (kind === 'VOLUNTEERS') {
    const rows = await prisma.volunteerProfile.findMany({
      where: { createdAt: range },
      select: {
        id: true,
        volunteerId: true,
        verificationStatus: true,
        publicProfile: true,
        createdAt: true,
        user: {
          select: { email: true, firstName: true, lastName: true, status: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: EXPORT_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      volunteerId: row.volunteerId,
      email: row.user.email,
      firstName: row.user.firstName,
      lastName: row.user.lastName,
      accountStatus: row.user.status,
      verificationStatus: row.verificationStatus,
      publicProfile: String(row.publicProfile),
      joinedAt: row.user.createdAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  if (kind === 'ORGANIZATIONS') {
    const rows = await prisma.organization.findMany({
      where: { createdAt: range },
      select: {
        id: true,
        name: true,
        slug: true,
        organizationType: true,
        status: true,
        verificationStatus: true,
        trustLevel: true,
        officialEmail: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: EXPORT_LIMIT,
    });
    return rows.map((row) => ({
      ...row,
      officialEmail: row.officialEmail ?? '',
      createdAt: row.createdAt.toISOString(),
    }));
  }

  if (kind === 'CAMPAIGNS') {
    const rows = await prisma.campaign.findMany({
      where: { createdAt: range },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        organizationId: true,
        startDate: true,
        endDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: EXPORT_LIMIT,
    });
    return rows.map((row) => ({
      ...row,
      startDate: row.startDate.toISOString(),
      endDate: row.endDate.toISOString(),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  const rows = await prisma.payment.findMany({
    where: { createdAt: range },
    select: {
      id: true,
      organizationId: true,
      amountDzd: true,
      currency: true,
      status: true,
      method: true,
      provider: true,
      reference: true,
      createdAt: true,
      invoice: { select: { number: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: EXPORT_LIMIT,
  });
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    invoiceNumber: row.invoice?.number ?? '',
    amountDzd: row.amountDzd,
    currency: row.currency,
    status: row.status,
    method: row.method,
    provider: row.provider,
    reference: row.reference ?? '',
    createdAt: row.createdAt.toISOString(),
  }));
}

async function countExportRows(kind: ExportKind, window: ExportWindow): Promise<number> {
  const prisma = getPrisma();
  const range = createdAtWindow(window);
  if (kind === 'VOLUNTEERS') return prisma.volunteerProfile.count({ where: { createdAt: range } });
  if (kind === 'ORGANIZATIONS') return prisma.organization.count({ where: { createdAt: range } });
  if (kind === 'CAMPAIGNS') return prisma.campaign.count({ where: { createdAt: range } });
  return prisma.payment.count({ where: { createdAt: range } });
}

async function dataExport(ctx: RequestContext): Promise<unknown> {
  const user = await requireSystemPermission(ctx, 'data.export');
  const input = await body(ctx, adminDataExportSchema);
  const window: ExportWindow = { from: input.from, to: input.to };

  const total = await countExportRows(input.kind, window);
  const rows = await exportRows(input.kind, window);
  const truncated = total > EXPORT_LIMIT;
  const columns = EXPORT_COLUMNS[input.kind];
  const generatedAt = new Date();

  // The export itself is audited before the bytes leave the server.
  await audit({
    actorUserId: user.userId,
    action: 'data.export',
    entityType: 'export',
    entityId: input.kind,
    after: {
      kind: input.kind,
      format: input.format,
      count: rows.length,
      truncated,
      from: input.from ?? null,
      to: input.to ?? null,
    },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  if (input.format === 'csv') {
    const csv = toCsv(columns, rows);
    return csvResponse(
      `bladna-${input.kind.toLowerCase()}-${generatedAt.toISOString().slice(0, 10)}.csv`,
      csv,
      rows.length,
      truncated,
    );
  }

  return {
    export: {
      kind: input.kind,
      generatedAt: generatedAt.toISOString(),
      truncated,
      count: rows.length,
      rows,
    },
  };
}

// ── Route table ─────────────────────────────────────────────────

export const adminRoutes: AppRoute[] = [
  // users
  {
    method: 'GET',
    path: '/admin/users',
    handler: listUsers,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform user list (paginated, no secrets exposed)',
  },
  {
    method: 'POST',
    path: '/admin/users/:id/action',
    handler: userAction,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Suspend/ban/reinstate/role change/force logout (reason + audit)',
  },
  {
    method: 'GET',
    path: '/admin/users/:id',
    handler: getUser,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform user detail',
  },
  // organizations (suspend/restore only)
  {
    method: 'GET',
    path: '/admin/organizations',
    handler: listOrganizations,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform organization list (paginated, filterable)',
  },
  {
    method: 'POST',
    path: '/admin/organizations/:id/action',
    handler: organizationAction,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Suspend/restore an organization (verification lives at /admin/verifications)',
  },
  // audit
  {
    method: 'GET',
    path: '/admin/audit',
    handler: listAudit,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Audit log (paginated, filterable)',
  },
  // settings
  {
    method: 'GET',
    path: '/admin/settings',
    handler: listSettings,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Platform settings (paginated)',
  },
  {
    method: 'PUT',
    path: '/admin/settings',
    handler: putSetting,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Create or update a setting (audited with before-snapshot)',
  },
  {
    method: 'DELETE',
    path: '/admin/settings/:key',
    handler: deleteSetting,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Delete a setting (audited)',
  },
  // feature flags
  {
    method: 'GET',
    path: '/admin/flags',
    handler: listFlags,
    options: { rateLimit: 'authenticated' },
    auth: 'admin',
    summary: 'Feature flag rows + effective resolution',
  },
  {
    method: 'PUT',
    path: '/admin/flags',
    handler: putFlag,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Create or update a feature flag (audited)',
  },
  {
    method: 'DELETE',
    path: '/admin/flags/:key',
    handler: deleteFlag,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Delete a feature flag (audited)',
  },
  // export
  {
    method: 'POST',
    path: '/admin/exports',
    handler: dataExport,
    options: { rateLimit: 'auth' },
    auth: 'admin',
    summary: 'Export real rows as CSV/JSON (capped and audited)',
  },
];
