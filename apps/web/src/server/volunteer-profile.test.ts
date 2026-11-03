import { describe, expect, it } from 'vitest';
import { getDictionary, LOCALES } from '../ui/i18n';
import { volunteerRoutes } from './modules/volunteers';

/**
 * DB-free tests for the P25 public volunteer profile wiring: the new route's
 * placement/auth metadata inside the participants table plus the localized
 * copy every locale ships. The privacy gates themselves (publicProfile → 404,
 * showHours / showCertificates withholding their sections) are exercised
 * end-to-end by tests/e2e/volunteer-profile.spec.ts and the live probe
 * against a running server.
 */

describe('public profile route (P25)', () => {
  it('registers GET /volunteers/:id right after the directory listing', () => {
    const keys = volunteerRoutes.map((route) => `${route.method} ${route.path}`);
    expect(keys).toContain('GET /volunteers/:id');
    // Static list before param detail — Router.handle takes the first match,
    // and the two must never shadow each other (segment counts differ).
    expect(keys.indexOf('GET /volunteers')).toBeLessThan(keys.indexOf('GET /volunteers/:id'));
    // The table stays duplicate-free (cross-table view: scripts/check-routes.ts).
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reads on the public tier exactly like the directory does', () => {
    const route = volunteerRoutes.find((r) => r.path === '/volunteers/:id');
    expect(route?.method).toBe('GET');
    expect(route?.auth).toBe('public');
    expect(route?.options?.rateLimit).toBe('public');
    expect(route?.summary).toBeTruthy();
  });
});

describe('public profile copy (P25)', () => {
  const KEYS = [
    'profileBack',
    'profileAbout',
    'profileMemberSince',
    'profilePrivacyNote',
    'profileHoursHidden',
    'profileCertsHidden',
  ] as const;
  const SLOTS = ['WEEKDAYS', 'WEEKENDS', 'EVENINGS', 'NIGHTS', 'HOLIDAYS', 'FLEXIBLE'] as const;

  it('ships non-empty profile strings for every locale', () => {
    for (const locale of LOCALES) {
      const { dict } = getDictionary(locale);
      for (const key of KEYS) {
        expect(dict.directory[key], `${locale} missing ${key}`).toBeTruthy();
      }
      for (const slot of SLOTS) {
        expect(
          dict.directory.availabilitySlots[slot],
          `${locale} missing slot ${slot}`,
        ).toBeTruthy();
      }
      expect(dict.settings.showCertificates, `${locale} missing showCertificates`).toBeTruthy();
    }
  });

  it('anchors the profile footnote on the probe-matched ASCII phone line', () => {
    const { dict } = getDictionary('en');
    // The probe greps this substring (ANSI-safe) on the profile page too.
    expect(dict.directory.profilePrivacyNote).toMatch(/^Phone numbers are never shown/);
    expect(dict.directory.profileBack).toMatch(/^[\x20-\x7E]+$/);
  });
});
