// Platform route table (Phase 2): everything beyond auth/taxonomies/locations/
// opportunities/applications — campaigns, impact, sponsors, CSR, international,
// notifications, messaging, reports, risk, admin, CMS and billing.
//
// Integration note: this table must be registered alongside `coreRoutes` in
// `app/api/v1/[[...segments]]/route.ts` (`router.register(platformRoutes)`).
// That file is shared and was intentionally left untouched by this module's
// author — see the hand-off report.
//
// Ordering: within each module, literal segments precede `:param` segments for
// every method. Across modules the shapes never collide (segment counts and
// middle literals differ), and the duplicate check below fails loudly at import
// time if that ever regresses.

import { adminRoutes } from '../modules/admin';
import { billingRoutes } from '../modules/billing';
import { campaignRoutes } from '../modules/campaigns';
import { cmsRoutes } from '../modules/cms';
import { csrRoutes } from '../modules/csr';
import { economicRoutes } from '../modules/economic';
import { fundingRoutes } from '../modules/funding';
import { impactRoutes } from '../modules/impact';
import { internationalRoutes } from '../modules/international';
import { messagingRoutes } from '../modules/messaging';
import { notificationRoutes } from '../modules/notifications';
import { partnershipRoutes } from '../modules/partnerships';
import { reportRoutes } from '../modules/reports';
import { riskRoutes } from '../modules/risk';
import { sponsorRoutes } from '../modules/sponsors';
import type { AppRoute } from '../router';

export const platformRoutes: AppRoute[] = [
  ...campaignRoutes,
  ...impactRoutes,
  ...sponsorRoutes,
  ...csrRoutes,
  ...economicRoutes,
  ...partnershipRoutes,
  ...fundingRoutes,
  ...internationalRoutes,
  ...notificationRoutes,
  ...messagingRoutes,
  ...reportRoutes,
  ...riskRoutes,
  ...adminRoutes,
  ...cmsRoutes,
  ...billingRoutes,
];

/** Two routes with the same method+path would silently shadow each other. */
function assertNoDuplicateRoutes(routes: AppRoute[]): void {
  const seen = new Set<string>();
  for (const route of routes) {
    const key = `${route.method} ${route.path}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate route in platform table: ${key}`);
    }
    seen.add(key);
  }
}

assertNoDuplicateRoutes(platformRoutes);
