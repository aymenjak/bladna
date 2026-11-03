import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { buttonClasses } from '@bladna/ui';
import { getDictionary, LOCALES, isLocale, type Dictionary, type LocaleCode } from '@/ui/i18n';
import { ACCESS_COOKIE } from '@/server/cookies';
import { AccountMenu } from './account-menu';
import { BellIcon, MailIcon } from './icons';
import { LocaleSwitch } from './locale-switch';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';
import { SignOutButton } from './sign-out';

/**
 * The four high-frequency signed-in destinations (P3 / RESEARCH M3): one
 * definition shared by the header nav and the fixed bottom tab bar, so the
 * two surfaces can never drift apart.
 */
export function coreNavLinks(
  locale: LocaleCode,
  dict: Dictionary,
): Array<{ href: string; label: string }> {
  return [
    { href: `/${locale}/dashboard`, label: dict.nav.dashboard },
    { href: `/${locale}/applications`, label: dict.applications.title },
    { href: `/${locale}/messages`, label: dict.nav.messages },
    { href: `/${locale}/notifications`, label: dict.inbox.title },
  ];
}

/** Top navigation — server component, locale-aware links. */
export async function SiteHeader() {
  const headerStore = await headers();
  const { locale, dict } = getDictionary(headerStore.get('x-locale'));
  // Cookie presence only (no DB hit): a stale cookie just lands on login, which
  // already handles `?next=`.
  const signedIn = (await cookies()).has(ACCESS_COOKIE);

  // Primary row — curated so it fits one line at every width (overflow was
  // breaking 768–1100px). Verification lives in the footer + landing CTA;
  // low-frequency destinations moved into the account menu below.
  const links: Array<{ href: string; label: string }> = [
    // Initiatives are the core object (spec §8–§10): المبادرات + الخريطة first.
    { href: `/${locale}/opportunities`, label: dict.nav.opportunities },
    { href: `/${locale}/map`, label: dict.nav.map },
    { href: `/${locale}/organizations`, label: dict.nav.organizations },
    { href: `/${locale}/campaigns`, label: dict.nav.campaigns },
  ];
  // Signed-in destinations that are one click away (account menu + mobile nav).
  const accountLinks: Array<{ href: string; label: string }> = [];
  const coreLinks = signedIn ? coreNavLinks(locale, dict) : [];
  if (signedIn) {
    // Desktop nav = public four + dashboard — five text links that always fit
    // one row. Applications moves into the account menu; messages and
    // notifications become icon buttons beside it (their aria-labels carry
    // the names), which is what collapsed the old eight-link row.
    links.push(...coreLinks.slice(0, 1));
    accountLinks.push(
      ...coreLinks.slice(1, 2),
      { href: `/${locale}/workspace`, label: dict.workspace.title },
      { href: `/${locale}/settings`, label: dict.nav.settings },
      { href: `/${locale}/billing`, label: dict.nav.billing },
      { href: `/${locale}/safety`, label: dict.nav.safety },
    );
  }
  // The hamburger (below lg) shows the complete list — re-adding the two
  // icon-only destinations so nothing is desktop-exclusive; the fixed bottom
  // tab bar (P3 / M3) covers the core four in one tap while signed in.
  const mobileLinks = [...links, ...coreLinks.slice(2), ...accountLinks];

  // P16: sticky — the bar stays reachable on long pages; z-40 sits under the
  // Radix menus/dialogs (z-50+) and above page content.
  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link
          href={`/${locale}`}
          className="flex items-center gap-2 text-lg font-bold text-brand-800"
        >
          <img
            src="/logo.png"
            alt=""
            width={44}
            height={44}
            decoding="async"
            className="h-11 w-11 shrink-0"
          />
          {dict.meta.siteName}
        </Link>

        <NavLinks
          links={links}
          label={dict.nav.home}
          className="hidden items-center gap-1 lg:flex"
        />

        <div className="ms-auto flex items-center gap-2">
          <nav aria-label={dict.nav.language} className="flex items-center gap-1">
            {LOCALES.map((code) => (
              <LocaleSwitch
                key={code}
                target={code}
                label={code.toUpperCase()}
                current={code === locale}
              />
            ))}
          </nav>
          {signedIn ? (
            <>
              {/* Messages/notifications as icon buttons — same destinations
                  as the old text links, a quarter of the width. Hidden below
                  sm: the P3 bottom tab bar carries the core four there. */}
              <div className="hidden items-center gap-0.5 sm:flex">
                <Link
                  href={`/${locale}/messages`}
                  aria-label={dict.nav.messages}
                  title={dict.nav.messages}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg text-sand-600 hover:bg-sand-100 hover:text-sand-900"
                >
                  <MailIcon className="size-5" />
                </Link>
                <Link
                  href={`/${locale}/notifications`}
                  aria-label={dict.inbox.title}
                  title={dict.inbox.title}
                  className="grid min-h-11 min-w-11 place-items-center rounded-lg text-sand-600 hover:bg-sand-100 hover:text-sand-900"
                >
                  <BellIcon className="size-5" />
                </Link>
              </div>
              <span className="hidden lg:block">
                <AccountMenu label={dict.nav.account} items={accountLinks} />
              </span>
              <span className="hidden sm:flex">
                <SignOutButton locale={locale} />
              </span>
            </>
          ) : (
            <>
              <Link
                href={`/${locale}/login`}
                className={buttonClasses({ variant: 'ghost', className: 'hidden sm:inline-flex' })}
              >
                {dict.nav.login}
              </Link>
              <Link
                href={`/${locale}/register`}
                className={buttonClasses({ className: 'hidden sm:inline-flex' })}
              >
                {dict.nav.register}
              </Link>
            </>
          )}
          <MobileNav
            locale={locale}
            links={mobileLinks}
            authLinks={
              signedIn ? null : { login: `/${locale}/login`, register: `/${locale}/register` }
            }
          />
        </div>
      </div>
    </header>
  );
}

export async function SiteFooter() {
  const headerStore = await headers();
  const raw = headerStore.get('x-locale');
  const { locale, dict } = getDictionary(isLocale(raw) ? raw : undefined);

  return (
    // P9: the footer is the one deep-ink surface (sand-950) — a deliberate
    // closing weight under the light page. Text pairs verified ≥6.4:1; link
    // hovers go jade (brand-300 = 10.6:1 on ink).
    <footer className="border-t border-sand-800 bg-sand-950">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          {/* Brand column */}
          <div className="max-w-xs">
            <p className="flex items-center gap-2 text-base font-bold text-white">
              <img
                src="/logo.png"
                alt=""
                width={40}
                height={40}
                decoding="async"
                className="h-10 w-10 shrink-0"
              />
              {dict.meta.siteName}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-sand-400">{dict.meta.tagline}</p>
          </div>

          {/* Explore */}
          <nav aria-label={dict.nav.opportunities} className="text-sm">
            <p className="font-semibold text-sand-100">{dict.nav.opportunities}</p>
            <ul className="mt-3 space-y-2 text-sand-300">
              <li>
                <Link href={`/${locale}/opportunities`} className="hover:text-brand-300">
                  {dict.nav.opportunities}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/organizations`} className="hover:text-brand-300">
                  {dict.nav.organizations}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/volunteers`} className="hover:text-brand-300">
                  {dict.nav.volunteers}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/campaigns`} className="hover:text-brand-300">
                  {dict.nav.campaigns}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/international`} className="hover:text-brand-300">
                  {dict.nav.international}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Trust */}
          <nav aria-label={dict.landing.verifyTitle} className="text-sm">
            <p className="font-semibold text-sand-100">{dict.landing.verifyTitle}</p>
            <ul className="mt-3 space-y-2 text-sand-300">
              <li>
                <Link href={`/${locale}/verify`} className="hover:text-brand-300">
                  {dict.verify.title}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/verify/certificate`} className="hover:text-brand-300">
                  {dict.verify.types.certificate}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/verify/volunteer`} className="hover:text-brand-300">
                  {dict.verify.types.volunteer}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/verify/organization`} className="hover:text-brand-300">
                  {dict.verify.types.organization}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Account & legal */}
          <nav aria-label={dict.nav.register} className="text-sm">
            <p className="font-semibold text-sand-100">{dict.nav.register}</p>
            <ul className="mt-3 space-y-2 text-sand-300">
              <li>
                <Link href={`/${locale}/login`} className="hover:text-brand-300">
                  {dict.nav.login}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/register`} className="hover:text-brand-300">
                  {dict.nav.register}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/help`} className="hover:text-brand-300">
                  {dict.nav.help}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/terms`} className="hover:text-brand-300">
                  {dict.nav.terms}
                </Link>
              </li>
              <li>
                <Link href={`/${locale}/privacy`} className="hover:text-brand-300">
                  {dict.nav.privacy}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-sand-800 pt-6 text-sm text-sand-400 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {dict.meta.siteName} — {dict.meta.tagline}
          </p>
          <nav className="flex flex-wrap gap-4" aria-label={dict.nav.home}>
            <Link href={`/${locale}/terms`} className="hover:text-white">
              {dict.nav.terms}
            </Link>
            <Link href={`/${locale}/privacy`} className="hover:text-white">
              {dict.nav.privacy}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
