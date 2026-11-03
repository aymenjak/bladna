import type { LocaleCode } from '@bladna/types';
import { DEFAULT_LOCALE, LOCALES, type Dictionary } from './types';
import { en } from './en';
import { fr } from './fr';
import { ar } from './ar';

export type { Dictionary, PillarCopy, LegalSection } from './types';
export { DEFAULT_LOCALE, LOCALES } from './types';
export type { LocaleCode } from '@bladna/types';

const DICTIONARIES: Record<LocaleCode, Dictionary> = { ar, fr, en };

export function isLocale(value: string | null | undefined): value is LocaleCode {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: string | null | undefined): {
  locale: LocaleCode;
  dict: Dictionary;
} {
  const resolved = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return { locale: resolved, dict: DICTIONARIES[resolved] };
}

/** `<html dir>` for a locale — Arabic is RTL, everything else LTR. */
export function directionFor(locale: LocaleCode): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
