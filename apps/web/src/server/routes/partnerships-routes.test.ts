import { describe, expect, it } from 'vitest';
import { coreRoutes } from './core';
import { platformRoutes } from './platform';
import { economicRoutes } from '../modules/economic';
import { fundingRoutes } from '../modules/funding';
import { impactRoutes } from '../modules/impact';
import { partnershipRoutes } from '../modules/partnerships';
import { supportRoutes } from '../modules/support';

/**
 * Partnerships & CSR route registration (P34/M2): the 43 new endpoints must
 * stay wired into the real tables — module exports alone would pass while the
 * server 404s. `npm run check` guards shapes and duplicates; this guards
 * presence, counts and the method+path keys API.md documents against.
 */
describe('partnerships & CSR route registration (P34/M2)', () => {
  const platformKeys = new Set(platformRoutes.map((r) => `${r.method} ${r.path}`));
  const coreKeys = new Set(coreRoutes.map((r) => `${r.method} ${r.path}`));

  it('ships the expected module counts (economic 12, partnerships 16, funding 11)', () => {
    expect(economicRoutes).toHaveLength(12);
    expect(partnershipRoutes).toHaveLength(16);
    expect(fundingRoutes).toHaveLength(11);
  });

  it('registers every economic/partnership/funding route in the platform table', () => {
    for (const route of [...economicRoutes, ...partnershipRoutes, ...fundingRoutes]) {
      expect(platformRoutes).toContain(route);
    }
  });

  it('registers the three evidence routes (impact) and the body-addressed offer (support)', () => {
    for (const key of [
      'GET /impact/metrics/:metricId/evidence',
      'POST /impact/metrics/:metricId/evidence',
      'POST /impact-evidence/:id/verify',
    ]) {
      expect(impactRoutes.map((r) => `${r.method} ${r.path}`)).toContain(key);
      expect(platformKeys.has(key)).toBe(true);
    }
    expect(impactRoutes).toHaveLength(10);

    expect(supportRoutes.map((r) => `${r.method} ${r.path}`)).toContain('POST /support-offers');
    expect(coreKeys.has('POST /support-offers')).toBe(true);
    expect(supportRoutes).toHaveLength(10);
  });

  it('exposes the lifecycle-critical endpoints under their exact keys', () => {
    for (const key of [
      'GET /orgs/:orgId/economic-profile',
      'PATCH /orgs/:orgId/economic-profile',
      'POST /orgs/:orgId/economic-profile/activate',
      'PUT /orgs/:orgId/economic-profile/focus-areas',
      'GET /csr-focus-areas',
      'GET /orgs/:orgId/partner-matches',
      'GET /opportunities/:id/partner-matches',
      'GET /partner-matches/:id',
      'POST /partnership-requests',
      'GET /me/partnership-requests',
      'GET /orgs/:orgId/partnership-requests',
      'POST /partnership-requests/:id/transition',
      'POST /partnership-requests/:id/proposals',
      'POST /partnership-proposals/:id/transition',
      'GET /partnerships',
      'POST /partnerships',
      'GET /partnerships/:id',
      'POST /partnerships/:id/transition',
      'POST /partnerships/:id/agreements',
      'POST /agreements/:id/transition',
      'POST /partnerships/:id/funding-commitments',
      'POST /disbursements/:id/verify',
      'POST /in-kind-contributions/:id/transition',
      'PATCH /obligations/:id',
      'POST /obligations/:id/transition',
    ]) {
      expect(platformKeys.has(key), `missing platform route: ${key}`).toBe(true);
    }
  });

  it('keeps summaries on every new route (API.md/meta describe them)', () => {
    for (const route of [...economicRoutes, ...partnershipRoutes, ...fundingRoutes]) {
      expect((route.summary ?? '').length).toBeGreaterThan(0);
      expect(route.options?.rateLimit).toBeTruthy();
    }
  });
});
