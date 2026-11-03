import { describe, expect, it } from 'vitest';
import { adminSectionsFor, isAdminSection, type AdminSectionId } from './admin-access';

/**
 * Section grants are checked against the REAL RBAC matrix in
 * @bladna/domain — if a role's permissions change, these expectations move
 * with them instead of silently granting console access.
 */
describe('adminSectionsFor', () => {
  it('grants no sections to accounts without platform permissions', () => {
    expect(adminSectionsFor([])).toEqual([]);
    expect(adminSectionsFor(['USER'])).toEqual([]);
    expect(adminSectionsFor(['VOLUNTEER'])).toEqual([]);
    expect(adminSectionsFor(['ORGANIZATION_OWNER', 'USER'])).toEqual([]);
    expect(adminSectionsFor(['SPONSOR_ADMIN'])).toEqual([]);
  });

  it('grants SUPPORT users/organizations/reports only (no sponsors/international/content)', () => {
    expect(adminSectionsFor(['SUPPORT'])).toEqual(['users', 'organizations', 'reports']);
  });

  it('grants MODERATOR users/organizations/opportunities/international/reports', () => {
    expect(adminSectionsFor(['MODERATOR'])).toEqual([
      'users',
      'organizations',
      'opportunities',
      'international',
      'reports',
    ]);
  });

  it('grants VERIFICATION_OFFICER everything except sponsors/content/settings/flags', () => {
    expect(adminSectionsFor(['VERIFICATION_OFFICER'])).toEqual([
      'users',
      'organizations',
      'opportunities',
      'international',
      'verification',
      'reports',
      'risk',
      'audit',
    ]);
  });

  it('grants SUPER_ADMIN all fourteen sections in canonical order', () => {
    const expected: AdminSectionId[] = [
      'users',
      'organizations',
      'sponsors',
      'opportunities',
      'international',
      'verification',
      'reports',
      'risk',
      'audit',
      'content',
      'settings',
      'flags',
      'exports',
      'billing',
    ];
    expect(adminSectionsFor(['SUPER_ADMIN'])).toEqual(expected);
  });

  it('unions multiple roles and ignores unknown role strings', () => {
    expect(adminSectionsFor(['SUPPORT', 'VERIFICATION_OFFICER'])).toEqual([
      'users',
      'organizations',
      'opportunities',
      'international',
      'verification',
      'reports',
      'risk',
      'audit',
    ]);
    expect(adminSectionsFor(['NOT_A_ROLE', 'SUPPORT'])).toEqual([
      'users',
      'organizations',
      'reports',
    ]);
  });
});

/**
 * M7: `[section]` route params are validated before rendering, so the guard
 * must accept exactly the fourteen section ids — anything else canonicalises
 * (never 404s) on the page.
 */
describe('isAdminSection', () => {
  it('accepts every canonical section id', () => {
    const ids: AdminSectionId[] = [
      'users',
      'organizations',
      'sponsors',
      'opportunities',
      'international',
      'verification',
      'reports',
      'risk',
      'audit',
      'content',
      'settings',
      'flags',
      'exports',
      'billing',
    ];
    for (const id of ids) expect(isAdminSection(id)).toBe(true);
  });

  it('rejects unknown, empty and case-varied params', () => {
    expect(isAdminSection('')).toBe(false);
    expect(isAdminSection('dashboard')).toBe(false);
    expect(isAdminSection('Users')).toBe(false);
    expect(isAdminSection('users/../../etc')).toBe(false);
    expect(isAdminSection('audit?x=1')).toBe(false);
  });
});
