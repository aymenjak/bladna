import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { getDictionary } from './index';

/**
 * next-intl request config (P6 "adopt standard libraries").
 *
 * The proxy resolves the URL prefix and forwards it as `x-locale` before any
 * rendering happens, so this reads the same source `getDictionary` has always
 * read: one resolver, one set of message objects — the standard
 * `getTranslations`/`useTranslations` APIs and the typed `dict.*` accessor can
 * never disagree about the locale or the copy. Locale validation and the
 * fallback to `DEFAULT_LOCALE` stay in `getDictionary`.
 *
 * The messages are the existing TS dictionary modules (nested objects), which
 * next-intl accepts as-is; no string was re-authored for this integration.
 */
export default getRequestConfig(async () => {
  const { locale, dict } = getDictionary((await headers()).get('x-locale'));
  return { locale, messages: dict };
});
