// P20 — "where do I find the ID?" report targets.
//
// The report form used to demand a raw UUID while most public pages address
// their content by slug (`/en/opportunities/algiers-park-cleanup`). This
// parser turns whatever the user pastes — an app URL from the address bar, a
// bare slug, a uuid, a certificate link with `?code=` — into a reference the
// form (auto target type) and `POST /reports` can resolve. Shared by the
// client form and the server so both agree on the same rules.

import type { ReportTargetType } from './enums';

export interface ParsedReportTargetRef {
  /** Target type implied by an app path (`/ar/opportunities/slug` → OPPORTUNITY). */
  targetType?: ReportTargetType;
  /** What to resolve: uuid, slug, certificate number, or the original text. */
  ref: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const LOCALES = new Set(['ar', 'fr', 'en']);

/** First path segment → the reportable type it addresses (public pages only). */
const PATH_TYPES: Record<string, ReportTargetType> = {
  opportunities: 'OPPORTUNITY',
  organizations: 'ORGANIZATION',
  workspace: 'ORGANIZATION',
  campaigns: 'CAMPAIGN',
};

/** URL-shaped inputs only — a bare slug must never be mistaken for a path. */
function asUrl(raw: string): URL | null {
  const parse = (value: string): URL | null => {
    try {
      return new URL(value);
    } catch {
      return null;
    }
  };
  if (raw.startsWith('/')) return parse(`https://bladna.local${raw}`);
  if (SCHEME_RE.test(raw)) return parse(raw);
  if (raw.startsWith('www.')) return parse(`https://${raw}`);
  return null;
}

/**
 * Extract the resolvable reference from a pasted report target. Unrecognized
 * input passes through untouched, so the typed uuid / certificate number keep
 * working exactly as before.
 */
export function parseReportTargetRef(raw: string): ParsedReportTargetRef {
  const value = raw.trim();
  if (!value) return { ref: '' };
  if (UUID_RE.test(value)) return { ref: value };

  const url = asUrl(value);
  if (!url) return { ref: value }; // bare slug or certificate number

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALES.has(segments[0])) segments.shift();

  // `/verify/certificate?code=BLD-CERT-…` carries the number in the query.
  if (segments[0] === 'verify' && segments[1] === 'certificate') {
    const code = url.searchParams.get('code');
    if (code?.trim()) return { targetType: 'CERTIFICATE', ref: code.trim() };
    return { ref: value };
  }

  const [head, next] = segments;
  const targetType = head ? PATH_TYPES[head] : undefined;
  if (targetType && next?.trim()) return { targetType, ref: next.trim() };

  // A link, but not a target page — let the server answer honestly.
  return { ref: value };
}
