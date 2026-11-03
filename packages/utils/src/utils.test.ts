import { describe, expect, it } from 'vitest';
import { buildPageMeta, normalizePageParams } from './pagination';
import { directionFor, pickLocalized, resolveLocale } from './locale';
import { maskEmail, maskPhone } from './mask';
import { slugify, uniqueSlug } from './slug';

describe('pagination', () => {
  it('normalizes page params with caps', () => {
    expect(normalizePageParams({ page: '3', limit: '15' })).toEqual({
      page: 3,
      limit: 15,
      skip: 30,
      take: 15,
    });
    expect(normalizePageParams({ page: '-5', limit: '9999' })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
      take: 100,
    });
    expect(normalizePageParams({})).toEqual({ page: 1, limit: 20, skip: 0, take: 20 });
  });

  it('computes total pages', () => {
    expect(buildPageMeta(45, { page: 1, limit: 20 }).totalPages).toBe(3);
    expect(buildPageMeta(0, { page: 1, limit: 20 }).totalPages).toBe(0);
  });
});

describe('locale', () => {
  it('resolves and falls back', () => {
    expect(resolveLocale('fr')).toBe('fr');
    expect(resolveLocale('xx')).toBe('ar');
    expect(directionFor('ar')).toBe('rtl');
    expect(directionFor('en')).toBe('ltr');
  });

  it('applies requested → en → ar fallback', () => {
    const fields = { titleAr: 'عربي', titleEn: 'English title' };
    expect(pickLocalized(fields, 'fr', ['title'])).toBe('English title');
    expect(pickLocalized({ titleAr: 'عربي' }, 'fr', ['title'])).toBe('عربي');
    expect(pickLocalized({ titleFr: 'Français', titleEn: 'English' }, 'fr', ['title'])).toBe(
      'Français',
    );
    expect(pickLocalized({ titleFr: 'Français', titleEn: 'English' }, 'ar', ['title'])).toBe(
      'English',
    );
  });
});

describe('masking', () => {
  it('masks emails and phones', () => {
    expect(maskEmail('aymen@example.com')).toBe('a****@example.com');
    expect(maskPhone('+213 555 12 34 56')).toBe('********3456');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

describe('slugify', () => {
  it('produces clean slugs', () => {
    expect(slugify('  Clean-Up  Your Room! ')).toBe('clean-up-your-room');
    expect(slugify('.clean')).toBe('clean');
    expect(slugify('!!!')).toBe('item');
  });

  it('avoids collisions', () => {
    const existing = new Set(['clean-up', 'clean-up-2']);
    expect(uniqueSlug('Clean Up', existing)).toBe('clean-up-3');
  });
});
