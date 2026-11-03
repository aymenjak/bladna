import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Index-policy regression guard: authenticated pages and transient auth-flow
 * pages must carry `noindex`, while public acquisition/content pages must stay
 * indexable. The policy lives in each page's `generateMetadata`, so this scans
 * the page sources (same source-scanning style as scripts/check-routes.ts).
 */

const NOINDEX = 'robots: { index: false, follow: false }';

const readPage = (path: string): string =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

/** Authenticated (private) pages + transient auth-flow pages → never indexed. */
const PRIVATE_PAGES: Array<{ name: string; path: string }> = [
  'dashboard',
  'settings',
  'safety',
  'messages',
  'billing',
  'admin',
  'mfa',
  'forgot-password',
  'reset-password',
  'verify-email',
  'applications',
  'notifications',
  'profile',
  'check-in',
  'workspace',
  'sponsor',
  'saved',
  'recommendations',
]
  .map((slug) => ({ name: slug, path: `./[locale]/${slug}/page.tsx` }))
  .concat([
    { name: 'invitations/accept', path: './[locale]/invitations/accept/page.tsx' },
    { name: 'admin/[section]', path: './[locale]/admin/[section]/page.tsx' },
    { name: 'workspace/[orgId]', path: './[locale]/workspace/[orgId]/page.tsx' },
    { name: 'international/apply/[id]', path: './[locale]/international/apply/[id]/page.tsx' },
    { name: 'international/applications', path: './[locale]/international/applications/page.tsx' },
    { name: 'international/passport', path: './[locale]/international/passport/page.tsx' },
    ...[
      'opportunities',
      'applications',
      'members',
      'attendance',
      'hours',
      'certificates',
      'documents',
      'verification',
      'campaigns',
      'settings',
    ].map((tab) => ({
      name: `workspace/[orgId]/${tab}`,
      path: `./[locale]/workspace/[orgId]/${tab}/page.tsx`,
    })),
  ]);

/** Public landing/acquisition/content pages → must remain indexable. */
const PUBLIC_PAGES = [
  { name: 'landing', path: './[locale]/page.tsx' },
  { name: 'login', path: './[locale]/login/page.tsx' },
  { name: 'register', path: './[locale]/register/page.tsx' },
  { name: 'verify', path: './[locale]/verify/page.tsx' },
  { name: 'opportunities', path: './[locale]/opportunities/page.tsx' },
  { name: 'opportunities/[slug]', path: './[locale]/opportunities/[slug]/page.tsx' },
  { name: 'map', path: './[locale]/map/page.tsx' },
  { name: 'organizations', path: './[locale]/organizations/page.tsx' },
  { name: 'organizations/[slug]', path: './[locale]/organizations/[slug]/page.tsx' },
  { name: 'volunteers', path: './[locale]/volunteers/page.tsx' },
  { name: 'volunteers/[id]', path: './[locale]/volunteers/[id]/page.tsx' },
  { name: 'campaigns', path: './[locale]/campaigns/page.tsx' },
  { name: 'campaigns/[id]', path: './[locale]/campaigns/[id]/page.tsx' },
  { name: 'international', path: './[locale]/international/page.tsx' },
  { name: 'international/[id]', path: './[locale]/international/[id]/page.tsx' },
  { name: 'international/countries', path: './[locale]/international/countries/page.tsx' },
  {
    name: 'international/countries/[code]',
    path: './[locale]/international/countries/[code]/page.tsx',
  },
  { name: 'international/providers', path: './[locale]/international/providers/page.tsx' },
  { name: 'international/safety', path: './[locale]/international/safety/page.tsx' },
  { name: 'verify/volunteer', path: './[locale]/verify/volunteer/page.tsx' },
  { name: 'verify/organization', path: './[locale]/verify/organization/page.tsx' },
  { name: 'verify/certificate', path: './[locale]/verify/certificate/page.tsx' },
  { name: 'terms', path: './[locale]/terms/page.tsx' },
  { name: 'privacy', path: './[locale]/privacy/page.tsx' },
  { name: 'credits', path: './[locale]/credits/page.tsx' },
  { name: 'help', path: './[locale]/help/page.tsx' },
  { name: 'help/[slug]', path: './[locale]/help/[slug]/page.tsx' },
];

/** Every `page.tsx` under this directory, as posix paths relative to it. */
function collectPages(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...collectPages(path.join(dir, entry.name), rel));
    } else if (entry.name === 'page.tsx') {
      found.push(rel);
    }
  }
  return found;
}

describe('page index policy', () => {
  it('classifies every page on disk (nothing unlisted)', () => {
    const appDir = fileURLToPath(new URL('.', import.meta.url));
    const classified = [...PRIVATE_PAGES, ...PUBLIC_PAGES].map((entry) =>
      entry.path.replace('./', ''),
    );
    expect(collectPages(appDir).sort()).toEqual(classified.sort());
  });

  it.each(PRIVATE_PAGES)('$name is noindexed', ({ path }) => {
    expect(readPage(path)).toContain(NOINDEX);
  });

  it.each(PUBLIC_PAGES)('$name stays indexable', ({ path }) => {
    expect(readPage(path)).not.toContain(NOINDEX);
  });
});
