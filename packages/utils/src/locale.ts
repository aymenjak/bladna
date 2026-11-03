// Localization helpers (spec §74, §105).
// Fallback chain: requested language → English → Arabic.

import type { LocaleCode } from '@bladna/types';

export const LOCALE_CODES: readonly LocaleCode[] = ['ar', 'fr', 'en'];
export const DEFAULT_LOCALE: LocaleCode = 'ar';
export const RTL_LOCALES: ReadonlySet<string> = new Set(['ar']);

export function isLocaleCode(value: unknown): value is LocaleCode {
  return typeof value === 'string' && (LOCALE_CODES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown, fallback: LocaleCode = DEFAULT_LOCALE): LocaleCode {
  return isLocaleCode(value) ? value : fallback;
}

export function directionFor(locale: LocaleCode): 'rtl' | 'ltr' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

export type LocalizedFields = {
  nameAr?: string | null;
  nameFr?: string | null;
  nameEn?: string | null;
  titleAr?: string | null;
  titleFr?: string | null;
  titleEn?: string | null;
  labelAr?: string | null;
  labelFr?: string | null;
  labelEn?: string | null;
  promptAr?: string | null;
  promptFr?: string | null;
  promptEn?: string | null;
  descriptionAr?: string | null;
  descriptionFr?: string | null;
  descriptionEn?: string | null;
};

const SUFFIX_BY_LOCALE: Record<LocaleCode, string> = { ar: 'Ar', fr: 'Fr', en: 'En' };

/**
 * Pick a localized field with fallback requested → EN → AR.
 * Accepts any pair of {prefix}{Ar|Fr|En} fields (name, title, prompt, …).
 */
export function pickLocalized(
  fields: LocalizedFields,
  locale: LocaleCode,
  prefixes: readonly ('name' | 'title' | 'label' | 'prompt' | 'description')[],
): string {
  const order: LocaleCode[] = [locale, 'en', 'ar'];
  for (const prefix of prefixes) {
    for (const lang of order) {
      const key = `${prefix}${SUFFIX_BY_LOCALE[lang]}` as keyof LocalizedFields;
      const value = fields[key];
      if (value) return value;
    }
  }
  return '';
}
