import type { MetadataRoute } from 'next';

const PUBLIC_HOSTS = ['https://bladna.org', 'https://www.bladna.org'];

/**
 * Root-level robots.txt (crawlers only ever read `/robots.txt` at the host
 * root; a `[locale]`-nested copy would be emitted as `/ar/robots.txt`, which
 * no crawler fetches). The proxy matcher skips paths containing a dot,
 * so this file is served without a locale redirect.
 *
 * Page URLs live under `/<locale>/…`, therefore the private-area rules are
 * written with a wildcard locale segment (an asterisk, then the path) — an
 * un-prefixed `/dashboard` would never match `/ar/dashboard` and would
 * silently disallow nothing.
 */
export default function robots(): MetadataRoute.Robots {
  const host = PUBLIC_HOSTS[0]!;
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/*/dashboard',
          '/*/admin',
          '/*/settings',
          '/*/applications',
          '/*/notifications',
          '/*/invitations',
          '/*/profile',
          '/*/workspace',
          '/*/sponsor',
          '/*/check-in',
          '/*/mfa',
          '/*/reset-password',
          '/*/verify-email',
          '/*/forgot-password',
          '/*/international/apply',
          '/*/international/passport',
        ],
      },
    ],
    sitemap: `${host}/sitemap.xml`,
    host,
  };
}
