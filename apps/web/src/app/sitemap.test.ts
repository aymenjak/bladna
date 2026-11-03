import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sitemap from './sitemap';

/**
 * Sitemap contract: one entry per (locale × static path), every entry
 * cross-linked to the three locales, and — the important one — every listed
 * path MUST resolve to a real `page.tsx` under `app/[locale]/` so the sitemap
 * can never advertise a route that does not exist.
 */

const BASE = 'https://bladna.org';
const LOCALES = ['ar', 'fr', 'en'] as const;

describe('sitemap', () => {
  const entries = sitemap();

  it('emits 3 locales × 19 static paths = 57 unique URLs', () => {
    expect(entries).toHaveLength(57);
    const urls = entries.map((entry) => entry.url);
    expect(new Set(urls).size).toBe(57);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/bladna\.org\/(ar|fr|en)(\/|$)/);
    }
  });

  it('declares all three locale alternates on every entry', () => {
    for (const entry of entries) {
      expect(Object.keys(entry.alternates?.languages ?? {})).toEqual([...LOCALES]);
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  it('only lists paths that resolve to a real page.tsx under app/[locale]', () => {
    const paths = new Set<string>();
    for (const entry of entries) {
      for (const locale of LOCALES) {
        const prefix = `${BASE}/${locale}`;
        if (entry.url.startsWith(prefix)) paths.add(entry.url.slice(prefix.length));
      }
    }
    expect(paths.size).toBe(19);
    for (const path of paths) {
      const page = join(
        process.cwd(),
        'apps/web/src/app/[locale]',
        ...path.split('/').filter(Boolean),
        'page.tsx',
      );
      expect(existsSync(page), `sitemap lists "${path}" but ${page} does not exist`).toBe(true);
    }
  });
});
