'use client';

import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@bladna/ui';

/**
 * Client error boundary for everything under a locale. Renders a localized
 * message plus a retry that re-runs the failed render (Next `reset`). The
 * error object is logged to the console for debugging, never sent anywhere.
 *
 * Copy comes from next-intl's `useTranslations` (P6) against the messages the
 * root layout's `NextIntlClientProvider` ships; the locale is the provider's,
 * which the proxy's `x-locale` header put there.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations('common');
  const tErrors = useTranslations('errors');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <p className="text-sm font-semibold text-brand-700">Error</p>
      <h1 className="mt-2 text-3xl font-bold text-sand-900">{tErrors('generic')}</h1>
      <p className="mt-3 text-sm text-sand-500">{t('retry')}</p>
      <div className="mt-6 flex gap-3">
        <Button type="button" onClick={reset}>
          {t('retry')}
        </Button>
        <a
          href={`/${locale}`}
          className="rounded-lg border border-sand-200 px-5 py-2.5 text-sm font-semibold text-sand-700 hover:bg-sand-100"
        >
          {t('backHome')}
        </a>
      </div>
    </div>
  );
}
