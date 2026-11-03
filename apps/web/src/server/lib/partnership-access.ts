import { getPrisma } from '@bladna/database';
import { canPerformOrgAction, hasSystemPermission, type Permission } from '@bladna/domain';
import { AppError, type PartnershipStatus } from '@bladna/types';
import { requireAuth, requireOrgMembership, type OrgContext } from '../guards';
import type { RequestContext } from '../http';

/**
 * Two-sided access for the Partnerships & CSR ecosystem (P34, design §6).
 *
 * Every entity in this module hangs off a `Partnership` (or a
 * `PartnershipRequest`) with **two** organizations, and each endpoint must be
 * reachable from the right side(s): both sides read, the receiver reviews,
 * the economic institution funds, each party manages its own obligations.
 * `requireScopedActor` resolves that decision deterministically:
 *
 * 1. try each scope in order — a platform system-grant for its permission, or
 *    an ACTIVE membership whose org role grants it (both validated fully,
 *    MFA included, by the `requireOrgMembership` re-check);
 * 2. a member of any involved org without the permission gets the canonical
 *    403 naming it — an outsider gets 404, so probing cannot confirm that an
 *    entity exists.
 */

export type PartnershipSide = 'youth' | 'economic' | 'requester' | 'receiver';

export interface PartnershipScope {
  orgId: string;
  permission: Permission;
  side: PartnershipSide;
}

export interface ScopedActor {
  org: OrgContext;
  side: PartnershipSide;
  /** True when access came from a platform grant (no membership row). */
  platform: boolean;
}

export interface PartnershipRecord {
  id: string;
  organizationId: string;
  economicOrganizationId: string;
  status: PartnershipStatus;
}

/** 404 when the partnership does not exist — callers scope access afterwards. */
export async function loadPartnership(id: string): Promise<PartnershipRecord> {
  const partnership = await getPrisma().partnership.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      economicOrganizationId: true,
      status: true,
    },
  });
  if (!partnership) throw AppError.notFound('Partnership not found.');
  return partnership;
}

/** The two org ids of a partnership, labeled for scope construction. */
export function partnershipSides(
  partnership: Pick<PartnershipRecord, 'organizationId' | 'economicOrganizationId'>,
): Array<{ side: PartnershipSide; orgId: string }> {
  return [
    { side: 'youth', orgId: partnership.organizationId },
    { side: 'economic', orgId: partnership.economicOrganizationId },
  ];
}

/** See the class docstring — the single entry point for side-scoped actions. */
export async function requireScopedActor(
  ctx: RequestContext,
  scopes: PartnershipScope[],
): Promise<ScopedActor> {
  if (scopes.length === 0) throw AppError.forbidden('No organization scope to act against.');
  const user = await requireAuth(ctx);
  const prisma = getPrisma();

  let chosen: PartnershipScope | null = null;
  let fallback: PartnershipScope | null = null;

  for (const scope of scopes) {
    if (hasSystemPermission(user.roles, scope.permission)) {
      chosen = scope;
      break;
    }
    const membership = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: scope.orgId, userId: user.userId } },
      select: { role: true, status: true },
    });
    if (!membership) continue;
    fallback ??= scope;
    if (membership.status !== 'ACTIVE') continue;
    if (canPerformOrgAction(user.roles, membership.role, scope.permission)) {
      chosen = scope;
      break;
    }
  }

  if (chosen) {
    const org = await requireOrgMembership(ctx, chosen.permission, { orgId: chosen.orgId });
    return { org, side: chosen.side, platform: org.membershipId === '' };
  }
  if (fallback) {
    // Member of an involved org without the permission: surface the canonical
    // 403 (or the suspended-membership error) naming it.
    const org = await requireOrgMembership(ctx, fallback.permission, { orgId: fallback.orgId });
    return { org, side: fallback.side, platform: org.membershipId === '' };
  }
  // Outsider: 404 — existence of the entity is not confirmed by probing.
  throw AppError.notFound('Not found.');
}

/** Org ids → scopes for one permission over a subset of sides (default: both). */
export function sideScopes(
  sides: ReadonlyArray<{ side: PartnershipSide; orgId: string }>,
  permission: Permission,
  only: readonly PartnershipSide[] = ['youth', 'economic'],
): PartnershipScope[] {
  return sides
    .filter((entry) => only.includes(entry.side))
    .map((entry) => ({ ...entry, permission }));
}
