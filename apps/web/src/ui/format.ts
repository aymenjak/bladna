import type { LocaleCode } from '@bladna/types';

/**
 * Format a date for the active locale. Dates arrive as ISO strings from the
 * API envelope (JSON), so everything goes through `new Date`.
 */
export function formatDate(value: string | Date | null | undefined, locale: LocaleCode): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  locale: LocaleCode,
): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * Clock time only (HH:mm) — the dense timestamp shown under each chat bubble
 * (P17): a full `formatDateTime` inside every message was visual noise once
 * date separators carry the day.
 */
export function formatTime(value: string | Date | null | undefined, locale: LocaleCode): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatNumber(value: number, locale: LocaleCode): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Trilingual badge labels (`OrganizationBadge`) → active-locale text. */
export function badgeLabel(
  badge: { labelAr: string; labelFr: string; labelEn: string },
  locale: LocaleCode,
): string {
  if (locale === 'ar') return badge.labelAr;
  if (locale === 'fr') return badge.labelFr;
  return badge.labelEn;
}
