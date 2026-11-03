// Role-Based Access Control (spec §6).
// Permissions are granted to system roles here, and to organization roles via
// membership. Server code must rely on this matrix — frontend checks are UX only.

import type { OrgMemberRole, SystemRole } from '@bladna/types';

export const PERMISSIONS = [
  // volunteer self-service
  'volunteer.profile.read',
  'volunteer.profile.update',
  'volunteer.profile.read:public',
  'volunteer.skills.manage',
  'volunteer.cv.generate',
  'volunteer.card.read',
  // own participations
  'application.create',
  'application.read:own',
  'application.withdraw:own',
  'attendance.checkin:self',
  'hours.read:own',
  'certificate.read:own',
  'opportunity.save',
  // organization scoped
  'organization.read',
  'organization.update',
  'organization.members.manage',
  'organization.verification.submit',
  'organization.billing.manage',
  'opportunity.create',
  'opportunity.update',
  'opportunity.publish',
  'opportunity.suspend:own',
  'application.read',
  'application.update',
  'attendance.create',
  'attendance.verify',
  'hours.verify',
  'hours.revoke',
  'certificate.issue',
  'certificate.revoke',
  'campaign.create',
  'campaign.update',
  'analytics.read',
  'document.upload',
  'document.read',
  'messaging.send',
  // sponsor scoped
  'sponsor.read',
  'sponsor.manage',
  'csr.create',
  'csr.manage',
  'sponsorship.create',
  'sponsorship.manage',
  'impact.read',
  // platform scoped
  'user.read',
  'user.suspend',
  'user.role.manage',
  'organization.read:platform',
  'organization.verify',
  'organization.suspend',
  'opportunity.read:platform',
  'opportunity.moderate',
  'campaign.read:platform',
  'sponsor.read:platform',
  'report.review',
  'risk.review',
  'moderation.action',
  'certificate.read:platform',
  'certificate.revoke:platform',
  'payment.read',
  'payment.manage',
  'subscription.manage',
  'audit.read',
  'admin.settings.manage',
  'content.manage',
  'featureflag.manage',
  'data.export',
  // partnerships & CSR ecosystem (P34 — design §6)
  'economic.profile.manage',
  'partner.match.read',
  'partnership.request.create',
  'partnership.request.review',
  'partnership.proposal.manage',
  'partnership.manage',
  'partnership.agreement.manage',
  'partnership.funding.manage',
  'partnership.obligation.update',
  'partnership.evidence.manage',
  'impact.evidence.verify',
  'partnership.report.generate',
  'partnership.crm.manage',
  'partnership.moderate',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VOLUNTEER_PERMISSIONS: Permission[] = [
  'volunteer.profile.read',
  'volunteer.profile.update',
  'volunteer.profile.read:public',
  'volunteer.skills.manage',
  'volunteer.cv.generate',
  'volunteer.card.read',
  'application.create',
  'application.read:own',
  'application.withdraw:own',
  'attendance.checkin:self',
  'hours.read:own',
  'certificate.read:own',
  'opportunity.save',
];

const ORG_BASE_PERMISSIONS: Permission[] = ['organization.read', 'partner.match.read'];

const ORG_STAFF_PERMISSIONS: Permission[] = [
  'opportunity.create',
  'opportunity.update',
  'application.read',
  'attendance.create',
  'document.upload',
  'document.read',
  'messaging.send',
  'analytics.read',
  // partnership front line: open requests, draft proposals, upload evidence,
  // work the CRM (P34 — design §6 roles columns).
  'partnership.request.create',
  'partnership.request.review',
  'partnership.proposal.manage',
  'partnership.evidence.manage',
  'partnership.crm.manage',
];

const ORG_MANAGER_PERMISSIONS: Permission[] = [
  ...ORG_STAFF_PERMISSIONS,
  'organization.update',
  'application.update',
  'attendance.verify',
  'hours.verify',
  'certificate.issue',
  'campaign.create',
  'campaign.update',
  'opportunity.publish',
  'opportunity.suspend:own',
  'organization.verification.submit',
  // senior partnership acts: profile/focus, lifecycle, agreements, funding,
  // own-party obligations, report generation (P34).
  'economic.profile.manage',
  'partnership.manage',
  'partnership.agreement.manage',
  'partnership.funding.manage',
  'partnership.obligation.update',
  'partnership.report.generate',
];

const ORG_ADMIN_PERMISSIONS: Permission[] = [
  ...ORG_MANAGER_PERMISSIONS,
  'organization.members.manage',
  'hours.revoke',
  'certificate.revoke',
];

const ORG_OWNER_PERMISSIONS: Permission[] = [
  ...ORG_ADMIN_PERMISSIONS,
  'organization.billing.manage',
];

const SPONSOR_MEMBER_PERMISSIONS: Permission[] = ['sponsor.read', 'csr.manage', 'impact.read'];

const SPONSOR_ADMIN_PERMISSIONS: Permission[] = [
  ...SPONSOR_MEMBER_PERMISSIONS,
  'sponsor.manage',
  'csr.create',
  'sponsorship.create',
  'sponsorship.manage',
  'organization.billing.manage',
];

const MODERATOR_PERMISSIONS: Permission[] = [
  'user.read',
  'organization.read:platform',
  'opportunity.read:platform',
  'opportunity.moderate',
  'campaign.read:platform',
  'report.review',
  'moderation.action',
  'certificate.read:platform',
  'certificate.revoke:platform',
  // platform oversight of the partnership surface (P34).
  'partnership.moderate',
  'partner.match.read',
];

const VERIFICATION_OFFICER_PERMISSIONS: Permission[] = [
  'user.read',
  'organization.read:platform',
  'organization.verify',
  'opportunity.read:platform',
  'report.review',
  'risk.review',
  'audit.read',
  // the only role that verifies impact evidence/disbursements — plus upload
  // and read-match oversight (P34 — design §6 verification column).
  'impact.evidence.verify',
  'partnership.evidence.manage',
  'partner.match.read',
];

const SUPPORT_PERMISSIONS: Permission[] = [
  'user.read',
  'organization.read:platform',
  'report.review',
];

const SUPER_ADMIN_PERMISSIONS: Permission[] = [...PERMISSIONS];

/**
 * Note: a user does not implicitly get VOLUNTEER permissions from USER;
 * VOLUNTEER is granted when the volunteer profile exists (assigned at
 * registration completion). This keeps permission grants explicit.
 */
export const ROLE_PERMISSIONS: Record<SystemRole, Permission[]> = {
  USER: [],
  VOLUNTEER: VOLUNTEER_PERMISSIONS,
  ORGANIZATION_MEMBER: ORG_BASE_PERMISSIONS,
  ORGANIZATION_ADMIN: ORG_BASE_PERMISSIONS,
  ORGANIZATION_OWNER: ORG_BASE_PERMISSIONS,
  SPONSOR_MEMBER: [],
  SPONSOR_ADMIN: [],
  MODERATOR: MODERATOR_PERMISSIONS,
  VERIFICATION_OFFICER: VERIFICATION_OFFICER_PERMISSIONS,
  SUPPORT: SUPPORT_PERMISSIONS,
  SUPER_ADMIN: SUPER_ADMIN_PERMISSIONS,
};

/** Permissions granted through an organization membership (tenant-scoped). */
export const ORG_ROLE_PERMISSIONS: Record<OrgMemberRole, Permission[]> = {
  VIEWER: [...ORG_BASE_PERMISSIONS, 'analytics.read'],
  STAFF: [...ORG_BASE_PERMISSIONS, ...ORG_STAFF_PERMISSIONS],
  MANAGER: [...ORG_BASE_PERMISSIONS, ...ORG_MANAGER_PERMISSIONS],
  ADMIN: [...ORG_BASE_PERMISSIONS, ...ORG_ADMIN_PERMISSIONS],
  OWNER: [...ORG_BASE_PERMISSIONS, ...ORG_OWNER_PERMISSIONS],
};

export const SPONSOR_ROLE_PERMISSIONS: Record<'SPONSOR_MEMBER' | 'SPONSOR_ADMIN', Permission[]> = {
  SPONSOR_MEMBER: SPONSOR_MEMBER_PERMISSIONS,
  SPONSOR_ADMIN: SPONSOR_ADMIN_PERMISSIONS,
};

export function permissionsForSystemRoles(roles: readonly SystemRole[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) out.add(permission);
  }
  return out;
}

export function hasSystemPermission(roles: readonly SystemRole[], permission: Permission): boolean {
  return permissionsForSystemRoles(roles).has(permission);
}

/**
 * Effective permission check for an organization-scoped action.
 * @param orgRole membership role of the caller in the target organization (null = not a member)
 */
export function canPerformOrgAction(
  roles: readonly SystemRole[],
  orgRole: OrgMemberRole | null,
  permission: Permission,
): boolean {
  // Platform-wide roles grant the platform flavour of the permission;
  // SUPER_ADMIN holds every permission outright.
  if (hasSystemPermission(roles, permission)) return true;
  if (orgRole === null) return false;
  return ORG_ROLE_PERMISSIONS[orgRole].includes(permission);
}

/** True when the permission may only be exercised platform-wide (admin surface). */
export function isPlatformPermission(permission: Permission): boolean {
  return permission.endsWith(':platform');
}
