// Organization (tenant) module for the participant surface (spec §31–§36).
//
// Org detail/update, member management (invite → accept → role → remove),
// invitations lifecycle, and real analytics aggregates. Tenancy always comes
// from requireOrgMembership (path :orgId), never from body payloads.

import { generateOpaqueSecret, hashToken } from '@bladna/auth';
import { getPrisma, type Prisma } from '@bladna/database';
import { organizationBadge } from '@bladna/domain';
import { ORGANIZATION_TYPES, AppError, type LocaleCode } from '@bladna/types';
import {
  buildPageMeta,
  maskEmail,
  normalizePageParams,
  resolveLocale,
  slugify,
  uniqueSlug,
} from '@bladna/utils';
import {
  acceptInvitationSchema,
  createOrganizationSchema,
  dashboardQuerySchema,
  inviteMemberSchema,
  orgMemberRoleSchema,
  paginationQuerySchema,
  updateMemberSchema,
  updateOrganizationSchema,
} from '@bladna/validation';
import { z } from 'zod';
import { env } from '../env';
import { body, pathParams, query, type RequestContext } from '../http';
import { requireAuth, requireOrgMembership, requireVerifiedEmail } from '../guards';
import { sendEmail } from '../infra/email';
import { isUniqueViolation } from '../lib/prisma-errors';
import { audit } from '../services/audit';
import { notify } from '../services/notifications';
import type { AppRoute } from '../router';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ORG_SELECT = {
  id: true,
  name: true,
  legalName: true,
  slug: true,
  description: true,
  logo: true,
  coverImage: true,
  organizationType: true,
  website: true,
  officialEmail: true,
  phone: true,
  address: true,
  verificationStatus: true,
  trustLevel: true,
  status: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
  wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
  city: { select: { id: true, nameAr: true, nameFr: true, nameEn: true } },
  _count: { select: { members: true, opportunities: true } },
} as const satisfies Prisma.OrganizationSelect;

const MUTABLE_ORG_SCALARS = [
  'name',
  'legalName',
  'description',
  'website',
  'officialEmail',
  'phone',
  'address',
  'logo',
  'coverImage',
] as const satisfies readonly (keyof Prisma.OrganizationUncheckedUpdateInput)[];

const MUTABLE_ORG_SELECT = {
  name: true,
  legalName: true,
  description: true,
  website: true,
  officialEmail: true,
  phone: true,
  address: true,
  logo: true,
  coverImage: true,
} as const satisfies Prisma.OrganizationSelect;

const membersQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['INVITED', 'ACTIVE', 'SUSPENDED', 'REMOVED']).optional(),
  role: orgMemberRoleSchema.optional(),
});

const invitationsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']).optional(),
});

const memberParamsSchema = z.object({ memberId: z.string().uuid() });
const invitationParamsSchema = z.object({ invitationId: z.string().uuid() });

const INVITE_NOTICE: Record<LocaleCode, { title: string; body: string; cta: string }> = {
  ar: {
    title: 'دعوة للانضمام',
    body: 'دُعيت للانضمام إلى "{org}" على بلادنا بصفة {role}.',
    cta: 'قبول الدعوة',
  },
  fr: {
    title: 'Invitation à rejoindre',
    body: 'Vous êtes invité(e) à rejoindre « {org} » sur BLADNA en tant que {role}.',
    cta: 'Accepter l’invitation',
  },
  en: {
    title: 'Invitation to join',
    body: 'You have been invited to join "{org}" on BLADNA as {role}.',
    cta: 'Accept the invitation',
  },
};

const JOINED_NOTICE: Record<LocaleCode, { title: string; body: string }> = {
  ar: { title: 'عضو جديد', body: 'انضم {name} إلى "{org}" بصفة {role}.' },
  fr: { title: 'Nouveau membre', body: '{name} a rejoint « {org} » en tant que {role}.' },
  en: { title: 'New member', body: '{name} joined "{org}" as {role}.' },
};

function fill(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.replace(`{${key}}`, value);
  }
  return out;
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

/** An organization must always keep at least one active owner (no lockouts). */
async function assertNotLastOwner(
  organizationId: string,
  member: { id: string; role: string },
  change: { role?: string | undefined; status?: string | undefined },
): Promise<void> {
  const removesOwner =
    member.role === 'OWNER' &&
    ((change.role !== undefined && change.role !== 'OWNER') ||
      change.status === 'SUSPENDED' ||
      change.status === 'REMOVED');
  if (!removesOwner) return;
  const otherOwners = await getPrisma().organizationMember.count({
    where: { organizationId, role: 'OWNER', status: 'ACTIVE', id: { not: member.id } },
  });
  if (otherOwners === 0) {
    throw AppError.businessRule('An organization must keep at least one active owner.');
  }
}

// ── Organization detail ────────────────────────────────────────

async function getOrganization(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const organization = await getPrisma().organization.findFirst({
    where: { id: org.orgId, deletedAt: null },
    select: ORG_SELECT,
  });
  if (!organization) throw AppError.notFound('Organization not found.');
  return {
    organization: {
      ...organization,
      badge: organizationBadge(organization.trustLevel, organization.verificationStatus),
    },
  };
}

async function patchOrganization(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.update');
  const input = await body(ctx, updateOrganizationSchema);
  const prisma = getPrisma();

  const existing = await prisma.organization.findFirst({
    where: { id: org.orgId, deletedAt: null },
    select: { id: true, ...MUTABLE_ORG_SELECT, wilayaId: true, cityId: true },
  });
  if (!existing) throw AppError.notFound('Organization not found.');

  if (
    input.wilayaId &&
    !(await prisma.wilaya.findUnique({ where: { id: input.wilayaId }, select: { id: true } }))
  ) {
    throw AppError.validation('The selected wilaya does not exist.');
  }
  if (
    input.cityId &&
    !(await prisma.city.findUnique({ where: { id: input.cityId }, select: { id: true } }))
  ) {
    throw AppError.validation('The selected city does not exist.');
  }

  // Unchecked input so the FK scalars (wilayaId/cityId) are assignable; every
  // key is constrained to a scalar column that actually exists on Organization.
  const data: Prisma.OrganizationUncheckedUpdateInput = {};
  for (const key of MUTABLE_ORG_SCALARS) {
    const value = (input as Record<string, unknown>)[key];
    // only nullable inputs are wilayaId/cityId (assigned below); the rest are strings
    if (typeof value === 'string') data[key] = value;
  }
  if (input.wilayaId !== undefined) data.wilayaId = input.wilayaId;
  if (input.cityId !== undefined) data.cityId = input.cityId;

  if (Object.keys(data).length === 0) {
    throw AppError.validation('Provide at least one field to update.');
  }

  const { id: _id, ...before } = existing;
  const updated = await prisma.organization.update({
    where: { id: org.orgId },
    data,
    select: ORG_SELECT,
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'organization.update',
    entityType: 'organization',
    entityId: org.orgId,
    before,
    after: { fields: Object.keys(data) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { organization: updated };
}

// ── Members ────────────────────────────────────────────────────

async function listMembers(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.read');
  const f = query(ctx, membersQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.OrganizationMemberWhereInput = {
    organizationId: org.orgId,
    ...(f.status ? { status: f.status } : {}),
    ...(f.role ? { role: f.role } : {}),
    ...(f.q
      ? {
          OR: [
            { user: { firstName: { contains: f.q, mode: 'insensitive' } } },
            { user: { lastName: { contains: f.q, mode: 'insensitive' } } },
            { user: { email: { contains: f.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.organizationMember.count({ where }),
    prisma.organizationMember.findMany({
      where,
      select: {
        id: true,
        role: true,
        status: true,
        title: true,
        joinedAt: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profileImage: true,
            preferredLanguage: true,
          },
        },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => ({
    ...row,
    user: { ...row.user, email: maskEmail(row.user.email) },
  }));
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function inviteMember(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.members.manage');
  const input = await body(ctx, inviteMemberSchema);
  const prisma = getPrisma();

  const targetUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true, preferredLanguage: true, deletedAt: true },
  });

  const existingMember = targetUser
    ? await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: org.orgId, userId: targetUser.id } },
        select: { status: true },
      })
    : null;
  if (existingMember?.status === 'ACTIVE') {
    throw AppError.conflict('This person is already an active member of the organization.');
  }

  // Re-inviting supersedes any outstanding invitation for the same email.
  await prisma.organizationInvitation.updateMany({
    where: { organizationId: org.orgId, email: input.email, status: 'PENDING' },
    data: { status: 'REVOKED' },
  });

  const token = generateOpaqueSecret();
  const invitation = await prisma.organizationInvitation.create({
    data: {
      organizationId: org.orgId,
      email: input.email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedById: org.user.userId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      status: 'PENDING',
    },
    select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true },
  });

  const organization = await prisma.organization.findUnique({
    where: { id: org.orgId },
    select: { name: true },
  });
  const orgName = organization?.name ?? 'BLADNA';
  const link = `${env.publicAppUrl}/invitations/accept?token=${encodeURIComponent(token)}`;
  const locale: LocaleCode =
    targetUser && !targetUser.deletedAt
      ? resolveLocale(targetUser.preferredLanguage.toLowerCase())
      : org.user.locale;
  const copy = INVITE_NOTICE[locale];
  const bodyText = fill(copy.body, { org: orgName, role: input.role });

  if (targetUser && !targetUser.deletedAt) {
    await notify({
      userId: targetUser.id,
      type: 'SYSTEM',
      title: copy.title,
      body: `${bodyText} ${copy.cta}: ${link}`,
      data: { organizationId: org.orgId, invitationId: invitation.id, role: input.role, link },
    });
  } else {
    try {
      await sendEmail({
        to: input.email,
        subject: `${copy.title} — ${orgName}`,
        html: `<p>${escapeHtml(bodyText)}</p><p><a href="${link}">${escapeHtml(copy.cta)}</a></p>`,
        text: `${bodyText}\n\n${copy.cta}: ${link}`,
        locale,
        tags: ['org_invitation'],
      });
    } catch (error) {
      console.error('[organizations] invitation email failed', error);
    }
  }

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'organization.member_invite',
    entityType: 'organizationInvitation',
    entityId: invitation.id,
    after: { email: maskEmail(input.email), role: input.role },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  return { invitation };
}

async function listInvitations(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.members.manage');
  const f = query(ctx, invitationsQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.OrganizationInvitationWhereInput = {
    organizationId: org.orgId,
    ...(f.status ? { status: f.status } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.organizationInvitation.count({ where }),
    prisma.organizationInvitation.findMany({
      where,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        acceptedAt: true,
        invitedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);

  const items = rows.map((row) => ({ ...row, email: maskEmail(row.email) }));
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function revokeInvitation(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.members.manage');
  const { invitationId } = pathParams(ctx, invitationParamsSchema);
  const prisma = getPrisma();

  const invitation = await prisma.organizationInvitation.findFirst({
    where: { id: invitationId, organizationId: org.orgId },
    select: { id: true, status: true, email: true, role: true },
  });
  if (!invitation) throw AppError.notFound('Invitation not found.');
  if (invitation.status !== 'PENDING') {
    throw AppError.conflict('Only pending invitations can be revoked.');
  }

  await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: { status: 'REVOKED' },
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'organization.invitation_revoke',
    entityType: 'organizationInvitation',
    entityId: invitation.id,
    before: { status: invitation.status },
    after: { status: 'REVOKED', email: maskEmail(invitation.email) },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { invitation: { id: invitation.id, status: 'REVOKED' } };
}

async function updateMemberRole(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.members.manage');
  const { memberId } = pathParams(ctx, memberParamsSchema);
  const input = await body(ctx, updateMemberSchema);
  const prisma = getPrisma();

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: org.orgId },
    select: { id: true, userId: true, role: true, status: true },
  });
  if (!member) throw AppError.notFound('Member not found.');

  await assertNotLastOwner(org.orgId, member, { role: input.role, status: input.status });

  const updated = await prisma.organizationMember.update({
    where: { id: member.id },
    data: {
      role: input.role,
      ...(input.status ? { status: input.status } : {}),
    },
    select: { id: true, role: true, status: true, joinedAt: true },
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'organization.member_role',
    entityType: 'organizationMember',
    entityId: member.id,
    before: { role: member.role, status: member.status },
    after: { role: updated.role, status: updated.status },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { member: updated };
}

async function removeMember(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'organization.members.manage');
  const { memberId } = pathParams(ctx, memberParamsSchema);
  const prisma = getPrisma();

  const member = await prisma.organizationMember.findFirst({
    where: { id: memberId, organizationId: org.orgId },
    select: { id: true, userId: true, role: true, status: true },
  });
  if (!member) throw AppError.notFound('Member not found.');
  if (member.status === 'REMOVED') throw AppError.conflict('This member has already been removed.');

  await assertNotLastOwner(org.orgId, member, { status: 'REMOVED' });

  await prisma.organizationMember.update({
    where: { id: member.id },
    data: { status: 'REMOVED' },
  });

  await audit({
    actorUserId: org.user.userId,
    organizationId: org.orgId,
    action: 'organization.member_remove',
    entityType: 'organizationMember',
    entityId: member.id,
    before: { role: member.role, status: member.status },
    after: { status: 'REMOVED' },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });
  return { member: { id: member.id, status: 'REMOVED' } };
}

async function listMyInvitations(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.OrganizationInvitationWhereInput = {
    email: user.email,
    status: 'PENDING',
    expiresAt: { gt: new Date() },
  };

  const [total, items] = await Promise.all([
    prisma.organizationInvitation.count({ where }),
    prisma.organizationInvitation.findMany({
      where,
      select: {
        id: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        organization: {
          select: { id: true, name: true, slug: true, logo: true, verificationStatus: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

async function acceptInvitation(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const { token } = pathParams(ctx, acceptInvitationSchema);
  const prisma = getPrisma();

  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
      invitedById: true,
      organization: { select: { id: true, name: true } },
      invitedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!invitation) throw AppError.validation('This invitation link is invalid or has expired.');
  if (invitation.status === 'ACCEPTED')
    throw AppError.conflict('This invitation has already been accepted.');
  if (invitation.status !== 'PENDING') {
    throw AppError.businessRule('This invitation is no longer valid. Ask for a new one.');
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    await prisma.organizationInvitation.updateMany({
      where: { id: invitation.id, status: 'PENDING' },
      data: { status: 'EXPIRED' },
    });
    throw AppError.businessRule('This invitation has expired. Ask for a new one.');
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw AppError.forbidden('This invitation was sent to a different email address.');
  }

  const existing = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: invitation.organizationId, userId: user.userId },
    },
    select: { id: true, status: true },
  });
  if (existing?.status === 'ACTIVE') {
    throw AppError.conflict('You are already a member of this organization.');
  }

  let membershipId: string;
  try {
    membershipId = await prisma.$transaction(async (tx) => {
      await tx.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      if (existing) {
        await tx.organizationMember.update({
          where: { id: existing.id },
          data: { role: invitation.role, status: 'ACTIVE', joinedAt: new Date() },
        });
        return existing.id;
      }
      const created = await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: user.userId,
          role: invitation.role,
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
        select: { id: true },
      });
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('You are already a member of this organization.');
    }
    throw error;
  }

  await audit({
    actorUserId: user.userId,
    organizationId: invitation.organizationId,
    action: 'organization.invitation_accept',
    entityType: 'organizationMember',
    entityId: membershipId,
    after: { role: invitation.role },
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  });

  const copy = JOINED_NOTICE[resolveLocale(user.locale)];
  await notify({
    userId: invitation.invitedById,
    type: 'SYSTEM',
    title: copy.title,
    body: fill(copy.body, {
      name: `${user.email}`,
      org: invitation.organization.name,
      role: invitation.role,
    }),
    data: { organizationId: invitation.organizationId, membershipId },
  });

  return {
    membership: {
      id: membershipId,
      organizationId: invitation.organizationId,
      role: invitation.role,
      status: 'ACTIVE',
    },
  };
}

// ── Analytics ──────────────────────────────────────────────────

async function analytics(ctx: RequestContext): Promise<unknown> {
  const org = await requireOrgMembership(ctx, 'analytics.read');
  const f = query(ctx, dashboardQuerySchema);
  const prisma = getPrisma();

  const dateRange: Prisma.DateTimeFilter = {
    ...(f.from ? { gte: f.from } : {}),
    ...(f.to ? { lte: f.to } : {}),
  };
  const hasRange = f.from !== undefined || f.to !== undefined;

  const [
    opportunityGroups,
    applicationGroups,
    memberGroups,
    certificateGroups,
    verifiedHours,
    attendanceCount,
    attendanceVolunteers,
  ] = await Promise.all([
    prisma.opportunity.groupBy({
      by: ['status'],
      where: { organizationId: org.orgId, deletedAt: null },
      _count: true,
    }),
    prisma.opportunityApplication.groupBy({
      by: ['status'],
      where: { opportunity: { organizationId: org.orgId } },
      _count: true,
    }),
    prisma.organizationMember.groupBy({
      by: ['status'],
      where: { organizationId: org.orgId },
      _count: true,
    }),
    prisma.volunteerCertificate.groupBy({
      by: ['status'],
      where: { organizationId: org.orgId },
      _count: true,
    }),
    prisma.volunteerHour.aggregate({
      where: {
        organizationId: org.orgId,
        status: 'VERIFIED',
        ...(hasRange ? { date: dateRange } : {}),
      },
      _sum: { hours: true },
      _count: true,
    }),
    prisma.attendance.count({
      where: {
        opportunity: { organizationId: org.orgId },
        ...(hasRange ? { date: dateRange } : {}),
      },
    }),
    prisma.attendance.groupBy({
      by: ['volunteerProfileId'],
      where: {
        opportunity: { organizationId: org.orgId },
        ...(hasRange ? { date: dateRange } : {}),
      },
    }),
  ]);

  const groupToRecord = (
    rows:
      | Array<{ _count: number | { [key: string]: number } }>
      | Array<{ status: string; _count: number }>,
  ): Record<string, number> =>
    Object.fromEntries(
      rows.map((row) => [(row as { status: string }).status, row._count as number]),
    );

  return {
    analytics: {
      opportunities: groupToRecord(opportunityGroups as Array<{ status: string; _count: number }>),
      applications: groupToRecord(applicationGroups as Array<{ status: string; _count: number }>),
      members: groupToRecord(memberGroups as Array<{ status: string; _count: number }>),
      certificates: groupToRecord(certificateGroups as Array<{ status: string; _count: number }>),
      verifiedHours: verifiedHours._sum.hours ? verifiedHours._sum.hours.toNumber() : 0,
      verifiedHourRecords: verifiedHours._count,
      attendanceRecords: attendanceCount,
      attendanceVolunteers: attendanceVolunteers.length,
      range: { from: f.from ?? null, to: f.to ?? null },
    },
  };
}

// ── Public directory (spec §36) ────────────────────────────────

const orgDirectorySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  organizationType: z.enum(ORGANIZATION_TYPES).optional(),
  verifiedOnly: z.enum(['true', 'false']).optional(),
  slug: z.string().trim().min(1).max(120).optional(),
});

/**
 * Public-safe projection: no contact details. `logo`/`coverImage` are the
 * tenant's own published presentation images, and the members preview only
 * surfaces volunteers who opted into the public directory
 * (`volunteerProfile.publicProfile` + no soft-deleted user) — a roster of
 * unconsented members never leaves this select.
 */
const ORG_PUBLIC_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  logo: true,
  coverImage: true,
  organizationType: true,
  verificationStatus: true,
  trustLevel: true,
  verifiedAt: true,
  createdAt: true,
  wilaya: { select: { id: true, code: true, nameAr: true, nameFr: true, nameEn: true } },
  city: { select: { id: true, nameAr: true, nameFr: true, nameEn: true } },
  members: {
    select: {
      role: true,
      user: { select: { firstName: true, lastName: true, profileImage: true } },
    },
    where: {
      status: 'ACTIVE' as const,
      user: { deletedAt: null, volunteerProfile: { publicProfile: true } },
    },
    orderBy: { joinedAt: 'asc' as const },
    take: 4,
  },
  _count: { select: { members: true, opportunities: true } },
} as const satisfies Prisma.OrganizationSelect;

/**
 * Anonymous organization directory: ACTIVE tenants only (pending, suspended
 * and archived tenants are not listed), paginated, with optional search and
 * verified-only filtering. Exposes no contact PII beyond the public profile.
 */
export async function directory(ctx: RequestContext): Promise<unknown> {
  const f = query(ctx, orgDirectorySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where: Prisma.OrganizationWhereInput = {
    status: 'ACTIVE',
    deletedAt: null,
    ...(f.slug ? { slug: f.slug } : {}),
    ...(f.organizationType ? { organizationType: f.organizationType } : {}),
    ...(f.verifiedOnly === 'true' ? { verificationStatus: 'VERIFIED' } : {}),
    ...(f.q
      ? {
          OR: [
            { name: { contains: f.q, mode: 'insensitive' } },
            { legalName: { contains: f.q, mode: 'insensitive' } },
            { description: { contains: f.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, items] = await Promise.all([
    prisma.organization.count({ where }),
    prisma.organization.findMany({
      where,
      select: ORG_PUBLIC_SELECT,
      orderBy: [{ verifiedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip,
      take,
    }),
  ]);
  return { items, meta: buildPageMeta(total, { page, limit }) };
}

// ── Self-registration (spec §31, §54) ───────────────────────────

/** First-come slug allocation from the tenant name (a race resolves to 409). */
async function allocateOrganizationSlug(name: string): Promise<string> {
  const base = slugify(name, 80) || 'organization';
  const rows = await getPrisma().organization.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
    take: 100,
  });
  return uniqueSlug(base, new Set(rows.map((row) => row.slug)));
}

/**
 * Creates a tenant and seats the caller as its OWNER.
 *
 * Requires a confirmed email and the §54 registration consents. The tenant
 * enters both lifecycles at the bottom — `PENDING_VERIFICATION` / `PENDING` —
 * so a self-registered organization can never start life as ACTIVE or
 * VERIFIED; the OWNER role comes from the session, never from the payload.
 */
async function selfRegister(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  requireVerifiedEmail(user);
  const input = await body(ctx, createOrganizationSchema);
  const slug = await allocateOrganizationSlug(input.name);
  const prisma = getPrisma();

  try {
    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name: input.name,
          legalName: input.legalName ?? null,
          slug,
          organizationType: input.organizationType,
          description: input.description ?? null,
          website: input.website ?? null,
          officialEmail: input.officialEmail ?? null,
          phone: input.phone ?? null,
          wilayaId: input.wilayaId ?? null,
          cityId: input.cityId ?? null,
          address: input.address ?? null,
          countryId: input.countryId ?? null,
          status: 'PENDING_VERIFICATION',
          verificationStatus: 'PENDING',
        },
        select: ORG_SELECT,
      });

      await tx.organizationMember.create({
        data: {
          organizationId: created.id,
          userId: user.userId,
          role: 'OWNER',
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      // Consent ledger: purpose + policy version + IP (§54), as in register.
      await tx.privacyConsent.createMany({
        data: input.consents.map((purpose) => ({
          userId: user.userId,
          purpose,
          policyVersion: env.policyVersion,
          ipAddress: ctx.ip === 'local' ? null : ctx.ip,
        })),
      });

      return created;
    });

    await audit({
      actorUserId: user.userId,
      organizationId: organization.id,
      action: 'organization.create',
      entityType: 'organization',
      entityId: organization.id,
      after: {
        slug: organization.slug,
        status: organization.status,
        verificationStatus: organization.verificationStatus,
        ownerRole: 'OWNER',
        consents: input.consents,
      },
      metadata: { source: 'self_registration' },
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return { organization };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw AppError.conflict('An organization with this name is already registered.');
    }
    throw error;
  }
}

// ── My organizations ────────────────────────────────────────────

/**
 * The caller's ACTIVE memberships with a compact organization summary — this
 * is what `/billing` uses to pick the tenant and what the dashboard's
 * "my organizations" card renders. Inactive/suspended memberships are hidden:
 * you can only act through an ACTIVE membership.
 */
async function listMyOrganizations(ctx: RequestContext): Promise<unknown> {
  const user = await requireAuth(ctx);
  const f = query(ctx, paginationQuerySchema);
  const { skip, take, page, limit } = normalizePageParams({ page: f.page, limit: f.limit });
  const prisma = getPrisma();

  const where = { userId: user.userId, status: 'ACTIVE' as const };
  const [total, rows] = await Promise.all([
    prisma.organizationMember.count({ where }),
    prisma.organizationMember.findMany({
      where,
      select: {
        role: true,
        status: true,
        joinedAt: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            organizationType: true,
            status: true,
            verificationStatus: true,
            trustLevel: true,
            verifiedAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
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

// ── Route table ─────────────────────────────────────────────────

export const organizationRoutes: AppRoute[] = [
  {
    method: 'GET',
    path: '/organizations',
    handler: directory,
    options: { rateLimit: 'public' },
    auth: 'public',
    summary: 'Public organization directory (ACTIVE tenants, paginated)',
  },
  {
    method: 'POST',
    path: '/organizations',
    handler: selfRegister,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Self-register a tenant (verified email + consents; creator becomes OWNER)',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId',
    handler: getOrganization,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Organization detail',
  },
  {
    method: 'PATCH',
    path: '/orgs/:orgId',
    handler: patchOrganization,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Update organization profile',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/members',
    handler: listMembers,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'List organization members (paginated)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/members/invite',
    handler: inviteMember,
    options: { rateLimit: 'passwordReset' },
    auth: 'org',
    summary: 'Invite a member by email',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/members/invitations',
    handler: listInvitations,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'List invitations (paginated)',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/members/invitations/:invitationId/revoke',
    handler: revokeInvitation,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Revoke a pending invitation',
  },
  {
    method: 'POST',
    path: '/orgs/:orgId/members/:memberId/role',
    handler: updateMemberRole,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Change a member role/status',
  },
  {
    method: 'DELETE',
    path: '/orgs/:orgId/members/:memberId',
    handler: removeMember,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Remove a member (soft: status REMOVED)',
  },
  {
    method: 'GET',
    path: '/me/organizations',
    handler: listMyOrganizations,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'My ACTIVE organization memberships (compact summary, paginated)',
  },
  {
    method: 'GET',
    path: '/me/invitations',
    handler: listMyInvitations,
    options: { rateLimit: 'authenticated' },
    auth: 'authenticated',
    summary: 'Invitations addressed to me',
  },
  {
    method: 'POST',
    path: '/me/invitations/:token/accept',
    handler: acceptInvitation,
    options: { rateLimit: 'auth' },
    auth: 'authenticated',
    summary: 'Accept an invitation by token',
  },
  {
    method: 'GET',
    path: '/orgs/:orgId/analytics',
    handler: analytics,
    options: { rateLimit: 'authenticated' },
    auth: 'org',
    summary: 'Real activity aggregates for the tenant',
  },
];
