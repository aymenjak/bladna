import { permissionsForSystemRoles, type Permission } from '@bladna/domain';
import { SYSTEM_ROLES, type SystemRole } from '@bladna/types';

/**
 * Admin console section access (display-only — every endpoint re-checks the
 * exact permission server-side). A section is granted when the caller holds
 * ANY of its permissions; `settings` intentionally accepts either
 * `admin.settings.manage` or `featureflag.manage` so a flag-only operator
 * still reaches the section they can actually manage. `content` (CMS) and
 * `sponsors` require `content.manage` / `sponsor.read:platform` (SUPER_ADMIN
 * only); `international` rides `opportunity.read:platform` for read access
 * while its create/edit forms stay hidden unless `content.manage` is held —
 * mirroring the guards in modules/cms.ts, international.ts and sponsors.ts.
 * `exports` requires `data.export` and `billing` requires `payment.read`,
 * mirroring the guards in modules/admin.ts (dataExport) and billing.ts
 * (listAdminPayments/invoices/subscriptions).
 */
export type AdminSectionId =
  | 'users'
  | 'organizations'
  | 'sponsors'
  | 'opportunities'
  | 'international'
  | 'verification'
  | 'reports'
  | 'risk'
  | 'audit'
  | 'content'
  | 'settings'
  | 'flags'
  | 'exports'
  | 'billing';

interface SectionDef {
  readonly id: AdminSectionId;
  readonly anyOf: readonly Permission[];
}

/** Canonical tab order — also the order sections appear in the console. */
const SECTIONS: readonly SectionDef[] = [
  { id: 'users', anyOf: ['user.read'] },
  { id: 'organizations', anyOf: ['organization.read:platform'] },
  { id: 'sponsors', anyOf: ['sponsor.read:platform'] },
  { id: 'opportunities', anyOf: ['opportunity.read:platform'] },
  { id: 'international', anyOf: ['opportunity.read:platform'] },
  { id: 'verification', anyOf: ['organization.verify'] },
  { id: 'reports', anyOf: ['report.review'] },
  { id: 'risk', anyOf: ['risk.review'] },
  { id: 'audit', anyOf: ['audit.read'] },
  { id: 'content', anyOf: ['content.manage'] },
  { id: 'settings', anyOf: ['admin.settings.manage', 'featureflag.manage'] },
  { id: 'flags', anyOf: ['featureflag.manage'] },
  { id: 'exports', anyOf: ['data.export'] },
  { id: 'billing', anyOf: ['payment.read'] },
];

const isSystemRole = (role: string): role is SystemRole =>
  (SYSTEM_ROLES as readonly string[]).includes(role);

/** Granted admin sections for a user's roles (unknown role strings are ignored). */
export function adminSectionsFor(roles: readonly string[]): AdminSectionId[] {
  const systemRoles = roles.filter(isSystemRole);
  const granted = permissionsForSystemRoles(systemRoles);
  return SECTIONS.filter((section) =>
    section.anyOf.some((permission) => granted.has(permission)),
  ).map((section) => section.id);
}

const SECTION_IDS: ReadonlySet<string> = new Set(SECTIONS.map((section) => section.id));

/**
 * Route-param guard for `/admin/[section]`. Unknown ids are NOT 404'd — the
 * page canonicalises them to the caller's first granted section instead (an
 * ungranted-but-real section must not confirm its existence either).
 */
export function isAdminSection(value: string): value is AdminSectionId {
  return SECTION_IDS.has(value);
}
