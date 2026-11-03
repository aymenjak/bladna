import { describe, expect, it } from 'vitest';
import { getDictionary, LOCALES } from '../ui/i18n';
import { reviewRoutes } from './modules/reviews';

/**
 * DB-free tests for the P24 review wiring: the route table's shape and
 * auth/rate-limit metadata, plus the localized copy every locale must ship.
 * The eligibility rules themselves (ACCEPTED application or VERIFIED hours)
 * are exercised end-to-end by tests/e2e/reviews.spec.ts against a live server.
 */

describe('review route table (P24)', () => {
  it('registers the read + write quartet on the initiative slug', () => {
    expect(reviewRoutes).toHaveLength(4);
    const byKey = reviewRoutes.map((route) => `${route.method} ${route.path}`);
    expect(byKey).toEqual([
      'GET /opportunities/:slug/reviews',
      'POST /opportunities/:slug/reviews',
      'PATCH /opportunities/:slug/reviews/:reviewId',
      'DELETE /opportunities/:slug/reviews/:reviewId',
    ]);
  });

  it('reads publicly and writes behind the authenticated tier', () => {
    const [list, create, update, remove] = reviewRoutes;
    expect(list.auth).toBe('public');
    expect(list.options?.rateLimit).toBe('public');
    for (const route of [create, update, remove]) {
      expect(route.auth).toBe('authenticated');
      expect(route.options?.rateLimit).toBe('authenticated');
    }
  });

  it('carries a summary on every route (API reference metadata)', () => {
    for (const route of reviewRoutes) expect(route.summary).toBeTruthy();
  });
});

describe('review copy (P24)', () => {
  const KEYS = [
    'reviewsTitle',
    'reviewsCount',
    'reviewsNote',
    'reviewsEmpty',
    'reviewAnonymous',
    'reviewYour',
    'reviewEdited',
    'reviewRatingLabel',
    'reviewRate',
    'reviewBodyLabel',
    'reviewBodyPlaceholder',
    'reviewPublish',
    'reviewEdit',
    'reviewDelete',
    'reviewDeleteConfirm',
    'reviewSignin',
  ] as const;

  it('ships non-empty strings for every review key in all four locales', () => {
    for (const locale of LOCALES) {
      const { dict } = getDictionary(locale);
      for (const key of KEYS) {
        expect(dict.opportunity[key], `${locale} missing ${key}`).toBeTruthy();
      }
      expect(dict.opportunity.reviewSources.participant, locale).toBeTruthy();
      expect(dict.opportunity.reviewSources.hours, locale).toBeTruthy();
    }
  });

  it('keeps the probe-matched English title + note ASCII (BOM-less probe reads ANSI)', () => {
    const { dict } = getDictionary('en');
    expect(dict.opportunity.reviewsTitle).toBe('Participant reviews');
    expect(dict.opportunity.reviewsNote).toMatch(/^[\x20-\x7E]+$/);
  });
});
