import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { IBM_Plex_Sans_Arabic, Noto_Kufi_Arabic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { buttonClasses, cn, ConfirmProvider } from '@bladna/ui';
import { getDictionary, directionFor } from '@/ui/i18n';
import { Toaster } from 'sonner';
import './globals.css';

/**
 * P9 retheme: one family carries both scripts (DESIGN §3/§11). The `variable`
 * is applied on `<html>`; `globals.css` maps `--font-sans` to it so every
 * surface — including Arabic — renders in Plex. `swap` keeps content visible
 * while the (subsetted, preloaded) webfont arrives.
 */
const plex = IBM_Plex_Sans_Arabic({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-plex',
  fallback: ['system-ui', 'Segoe UI'],
});

/**
 * P26 display face — Noto Kufi Arabic, the headline family of the reference
 * site (mjeunesse.gov.dz). It ships as a `--font-kufi` variable and only RTL
 * headings resolve it (globals.css `[dir='rtl'] h1…h4`); Latin locales keep
 * Plex, and body copy stays Plex everywhere.
 */
const kufi = Noto_Kufi_Arabic({
  subsets: ['arabic', 'latin'],
  display: 'swap',
  variable: '--font-kufi',
  fallback: ['system-ui', 'Segoe UI'],
});

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const { locale } = getDictionary(headerStore.get('x-locale'));
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: {
      default: `${t('siteName')} — ${t('tagline')}`,
      template: `%s · ${t('siteName')}`,
    },
    description: t('description'),
    alternates: {
      languages: { ar: '/ar', fr: '/fr', en: '/en' },
    },
  };
}

/**
 * Root layout. The locale arrives through the `x-locale` request header set by
 * the proxy, so `<html lang/dir>` is correct on the server (RTL for ar).
 *
 * `NextIntlClientProvider` (next-intl, P6) exposes the standard client i18n
 * API under it. The messages it ships are the namespaces the client-side slice
 * consumes (`error.tsx` reads `common`/`errors`); every other client component
 * still uses the typed `getDictionary` accessor, and server components read the
 * full dictionary through `getTranslations` — both resolve against the same
 * locale objects via `src/ui/i18n/request.ts`.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headerStore = await headers();
  const { locale, dict } = getDictionary(headerStore.get('x-locale'));
  const dir = directionFor(locale);
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <html lang={locale} dir={dir} className={`${plex.variable} ${kufi.variable}`}>
      <body>
        <NextIntlClientProvider
          locale={locale}
          timeZone="Africa/Algiers"
          messages={{ common: dict.common, errors: dict.errors }}
        >
          <ConfirmProvider labels={{ confirm: t('confirm'), cancel: t('cancel') }}>
            <a
              href="#main"
              className={cn(
                'sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50',
                'focus:rounded-lg focus:px-4 focus:py-2',
                buttonClasses({ variant: 'primary' }),
              )}
            >
              {t('skipToContent')}
            </a>
            {children}
            {/* Standard toast layer (sonner) — transient confirmations only;
                errors that belong to a control stay inline next to it. */}
            <Toaster position="top-center" />
          </ConfirmProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
