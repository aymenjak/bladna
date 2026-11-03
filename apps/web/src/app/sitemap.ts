import type { MetadataRoute } from 'next';

const BASE = 'https://bladna.org';
const LOCALES = ['ar', 'fr', 'en'] as const;

/**
 * Root-level sitemap referenced by `/robots.txt`.
 *
 * Every entry is a locale-prefixed path that resolves to a real `page.tsx`
 * under `app/[locale]/`; entries are not added here before the page exists.
 * This file lives at the app root rather than inside `app/[locale]/` because a
 * nested copy is emitted once per locale as `/{ar,fr,en}/sitemap.xml` while
 * `robots.txt` points at the single root `/sitemap.xml`.
 */
const STATIC_PATHS = [
  '',
  '/opportunities',
  '/map',
  '/organizations',
  '/volunteers',
  '/campaigns',
  '/international',
  '/international/countries',
  '/international/providers',
  '/international/safety',
  '/verify',
  '/verify/certificate',
  '/verify/volunteer',
  '/verify/organization',
  '/help',
  '/login',
  '/register',
  '/terms',
  '/privacy',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];
  for (const locale of LOCALES) {
    for (const path of STATIC_PATHS) {
      entries.push({
        url: `${BASE}/${locale}${path}`,
        lastModified: now,
        changeFrequency: 'weekly',
        priority: path === '' ? 1 : path === '/opportunities' ? 0.9 : 0.6,
        alternates: {
          languages: Object.fromEntries(LOCALES.map((l) => [l, `${BASE}/${l}${path}`])),
        },
      });
    }
  }
  return entries;
}
