import { describe, expect, it } from 'vitest';
import { planActionFor, planName } from './billing-utils';

describe('planActionFor', () => {
  it('offers UPGRADE (Subscribe) when there is no subscription', () => {
    expect(planActionFor(null, 'FREE')).toBe('UPGRADE');
    expect(planActionFor(null, 'BASIC')).toBe('UPGRADE');
    expect(planActionFor(null, 'ENTERPRISE')).toBe('UPGRADE');
  });

  it('returns null for the current tier (render a badge, not a button)', () => {
    expect(planActionFor('FREE', 'FREE')).toBeNull();
    expect(planActionFor('BASIC', 'BASIC')).toBeNull();
    expect(planActionFor('PROFESSIONAL', 'PROFESSIONAL')).toBeNull();
    expect(planActionFor('ENTERPRISE', 'ENTERPRISE')).toBeNull();
  });

  it('returns UPGRADE for a higher tier', () => {
    expect(planActionFor('FREE', 'BASIC')).toBe('UPGRADE');
    expect(planActionFor('BASIC', 'PROFESSIONAL')).toBe('UPGRADE');
    expect(planActionFor('PROFESSIONAL', 'ENTERPRISE')).toBe('UPGRADE');
    expect(planActionFor('FREE', 'ENTERPRISE')).toBe('UPGRADE');
  });

  it('returns DOWNGRADE for a lower tier', () => {
    expect(planActionFor('BASIC', 'FREE')).toBe('DOWNGRADE');
    expect(planActionFor('ENTERPRISE', 'BASIC')).toBe('DOWNGRADE');
    expect(planActionFor('ENTERPRISE', 'FREE')).toBe('DOWNGRADE');
    expect(planActionFor('PROFESSIONAL', 'BASIC')).toBe('DOWNGRADE');
  });
});

describe('planName', () => {
  const plan = { nameAr: 'الأساسية', nameFr: 'Basique', nameEn: 'Basic' };

  it('picks the active locale', () => {
    expect(planName(plan, 'ar')).toBe('الأساسية');
    expect(planName(plan, 'fr')).toBe('Basique');
    expect(planName(plan, 'en')).toBe('Basic');
  });
});
