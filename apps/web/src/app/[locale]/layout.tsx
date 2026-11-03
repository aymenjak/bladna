import type { LocaleCode } from '@bladna/types';
import { cookies } from 'next/headers';
import { getDictionary } from '@/ui/i18n';
import { ACCESS_COOKIE } from '@/server/cookies';
import { SiteFooter, SiteHeader, coreNavLinks } from '@/ui/components/chrome';
import { SiteMasthead } from '@/ui/components/site-masthead';
import { BottomNav } from '@/ui/components/bottom-nav';

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Middleware guarantees /ar|/fr|/en, but be defensive on direct hits.
  const { locale: resolved, dict } = getDictionary(locale);
  const active: LocaleCode = resolved;
  // Cookie presence only (same as SiteHeader — no DB hit): signed-in users
  // get the fixed bottom tab bar (P3 / M3), so the column reserves room for
  // it below lg and the footer is never trapped underneath.
  const signedIn = (await cookies()).has(ACCESS_COOKIE);

  return (
    <div className={`flex min-h-screen flex-col${signedIn ? ' pb-24 lg:pb-0' : ''}`}>
      {/* P27 — the reference's opening chrome: promise strip + marquee ticker
          above the sticky header, on every route (they scroll away with it). */}
      <SiteMasthead locale={active} />
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      {signedIn ? <BottomNav locale={active} items={coreNavLinks(active, dict)} /> : null}
      <script
        type="application/json"
        id="__bladna_locale__"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({ locale: active, siteName: dict.meta.siteName }),
        }}
      />
    </div>
  );
}
