import { describe, expect, it } from 'vitest';
import {
  canPerformOrgAction,
  hasSystemPermission,
  isPlatformPermission,
  ORG_ROLE_PERMISSIONS,
  permissionsForSystemRoles,
  ROLE_PERMISSIONS,
} from './rbac';

describe('RBAC matrix', () => {
  it('grants SUPER_ADMIN every permission it defines in its role list', () => {
    expect(hasSystemPermission(['SUPER_ADMIN'], 'audit.read')).toBe(true);
    expect(hasSystemPermission(['SUPER_ADMIN'], 'hours.verify')).toBe(true);
    expect(hasSystemPermission(['SUPER_ADMIN'], 'admin.settings.manage')).toBe(true);
  });

  it('does not let a regular USER read audit logs', () => {
    expect(hasSystemPermission(['USER'], 'audit.read')).toBe(false);
    expect(hasSystemPermission(['USER'], 'user.suspend')).toBe(false);
  });

  it('gives VOLUNTEER self-service permissions only', () => {
    expect(hasSystemPermission(['VOLUNTEER'], 'volunteer.profile.update')).toBe(true);
    expect(hasSystemPermission(['VOLUNTEER'], 'application.create')).toBe(true);
    expect(hasSystemPermission(['VOLUNTEER'], 'application.update')).toBe(false);
    expect(hasSystemPermission(['VOLUNTEER'], 'organization.verify')).toBe(false);
    expect(hasSystemPermission(['VOLUNTEER'], 'payment.manage')).toBe(false);
  });

  it('keeps billing away from moderators', () => {
    expect(hasSystemPermission(['MODERATOR'], 'payment.manage')).toBe(false);
    expect(hasSystemPermission(['MODERATOR'], 'subscription.manage')).toBe(false);
    expect(hasSystemPermission(['MODERATOR'], 'report.review')).toBe(true);
  });

  it('keeps verification officers out of financial records', () => {
    expect(hasSystemPermission(['VERIFICATION_OFFICER'], 'organization.verify')).toBe(true);
    expect(hasSystemPermission(['VERIFICATION_OFFICER'], 'payment.manage')).toBe(false);
    expect(hasSystemPermission(['VERIFICATION_OFFICER'], 'payment.read')).toBe(false);
  });

  it('organization permissions derive from membership role', () => {
    expect(canPerformOrgAction([], 'VIEWER', 'opportunity.create')).toBe(false);
    expect(canPerformOrgAction([], 'STAFF', 'opportunity.create')).toBe(true);
    expect(canPerformOrgAction([], 'STAFF', 'hours.verify')).toBe(false);
    expect(canPerformOrgAction([], 'MANAGER', 'hours.verify')).toBe(true);
    expect(canPerformOrgAction([], 'ADMIN', 'organization.members.manage')).toBe(true);
    expect(canPerformOrgAction([], 'MANAGER', 'organization.members.manage')).toBe(false);
    expect(canPerformOrgAction([], 'ADMIN', 'organization.billing.manage')).toBe(false);
    expect(canPerformOrgAction([], 'OWNER', 'organization.billing.manage')).toBe(true);
    // Review-before-publish: publishing/rejecting an initiative is platform
    // moderation — no organization role (even OWNER) grants it.
    expect(canPerformOrgAction([], 'MANAGER', 'opportunity.moderate')).toBe(false);
    expect(canPerformOrgAction([], 'OWNER', 'opportunity.moderate')).toBe(false);
    expect(canPerformOrgAction(['MODERATOR'], null, 'opportunity.moderate')).toBe(true);
  });

  it('denies org actions for non-members', () => {
    expect(canPerformOrgAction(['VOLUNTEER'], null, 'opportunity.read' as never)).toBe(false);
    expect(canPerformOrgAction(['VOLUNTEER'], null, 'application.read')).toBe(false);
  });

  it('does not leak platform permissions into org roles', () => {
    for (const perms of Object.values(ORG_ROLE_PERMISSIONS)) {
      for (const permission of perms) {
        expect(permission.endsWith(':platform')).toBe(false);
      }
    }
  });

  it('USER role grants nothing privileged', () => {
    expect(ROLE_PERMISSIONS.USER).toHaveLength(0);
    expect(permissionsForSystemRoles(['USER']).size).toBe(0);
  });
});

/**
 * Partnerships & CSR (P34, design §6): the fourteen new permissions land on
 * the roles the matrix assigns them — staff opens the conversation, managers
 * commit the institution, only verification officers verify, and no org role
 * (even OWNER) can wear the officer's hat.
 */
describe('partnerships & CSR permissions (P34)', () => {
  it('front-line partnership acts start at STAFF, senior acts at MANAGER', () => {
    expect(canPerformOrgAction([], 'VIEWER', 'partnership.request.create')).toBe(false);
    expect(canPerformOrgAction([], 'STAFF', 'partnership.request.create')).toBe(true);
    expect(canPerformOrgAction([], 'STAFF', 'partnership.proposal.manage')).toBe(true);
    expect(canPerformOrgAction([], 'STAFF', 'partnership.crm.manage')).toBe(true);
    expect(canPerformOrgAction([], 'STAFF', 'partnership.manage')).toBe(false);
    expect(canPerformOrgAction([], 'MANAGER', 'partnership.manage')).toBe(true);
    expect(canPerformOrgAction([], 'MANAGER', 'economic.profile.manage')).toBe(true);
    expect(canPerformOrgAction([], 'MANAGER', 'partnership.funding.manage')).toBe(true);
    expect(canPerformOrgAction([], 'MANAGER', 'partnership.agreement.manage')).toBe(true);
    expect(canPerformOrgAction([], 'MANAGER', 'partnership.obligation.update')).toBe(true);
  });

  it('lets every member of a tenant read its own matches', () => {
    expect(canPerformOrgAction([], 'VIEWER', 'partner.match.read')).toBe(true);
    expect(canPerformOrgAction([], 'OWNER', 'partner.match.read')).toBe(true);
    expect(canPerformOrgAction(['USER'], null, 'partner.match.read')).toBe(false);
  });

  it('gives impact verification to verification officers only', () => {
    expect(hasSystemPermission(['VERIFICATION_OFFICER'], 'impact.evidence.verify')).toBe(true);
    expect(hasSystemPermission(['SUPER_ADMIN'], 'impact.evidence.verify')).toBe(true);
    expect(hasSystemPermission(['MODERATOR'], 'impact.evidence.verify')).toBe(false);
    expect(hasSystemPermission(['USER'], 'impact.evidence.verify')).toBe(false);
    // The matrix's "ضابط التحقق وحده": no organization role — not even OWNER —
    // can verify evidence or disbursements through a membership.
    expect(canPerformOrgAction([], 'OWNER', 'impact.evidence.verify')).toBe(false);
    expect(canPerformOrgAction([], 'ADMIN', 'impact.evidence.verify')).toBe(false);
  });

  it('keeps platform oversight of partnerships with moderators', () => {
    expect(hasSystemPermission(['MODERATOR'], 'partnership.moderate')).toBe(true);
    expect(hasSystemPermission(['VERIFICATION_OFFICER'], 'partnership.moderate')).toBe(false);
    expect(canPerformOrgAction([], 'OWNER', 'partnership.moderate')).toBe(false);
  });

  it('separates economic-institution powers from volunteer-side powers', () => {
    // funding/report authority rides the new partnership permissions only —
    // taking none of the volunteer-side verification powers with it.
    expect(hasSystemPermission(['VERIFICATION_OFFICER'], 'partnership.funding.manage')).toBe(false);
    expect(canPerformOrgAction([], 'MANAGER', 'partnership.funding.manage')).toBe(true);
    // and the new permissions are org-scoped, never the platform flavour.
    expect(isPlatformPermission('partnership.funding.manage')).toBe(false);
    expect(isPlatformPermission('economic.profile.manage')).toBe(false);
  });

  it('every new permission is granted to at least one role', () => {
    const granted = permissionsForSystemRoles([
      'USER',
      'VOLUNTEER',
      'MODERATOR',
      'VERIFICATION_OFFICER',
      'SUPPORT',
      'SUPER_ADMIN',
    ]);
    const orgSide = [
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
      'partnership.report.generate',
      'partnership.crm.manage',
    ] as const;
    for (const permission of orgSide) {
      expect(granted.has(permission)).toBe(true);
      expect(canPerformOrgAction([], 'OWNER', permission)).toBe(true);
    }
    // the two platform/officer-only permissions are granted system-wide…
    expect(granted.has('impact.evidence.verify')).toBe(true);
    expect(granted.has('partnership.moderate')).toBe(true);
    // …and are the only two an organization OWNER cannot wear.
    expect(canPerformOrgAction([], 'OWNER', 'impact.evidence.verify')).toBe(false);
    expect(canPerformOrgAction([], 'OWNER', 'partnership.moderate')).toBe(false);
  });
});
