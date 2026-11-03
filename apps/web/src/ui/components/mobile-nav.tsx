'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { buttonClasses } from '@bladna/ui';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { CloseIcon, MenuIcon } from './icons';

/**
 * Mobile navigation — the desktop nav is `hidden lg:flex`, so without this the
 * small-screen layout had *no* page links at all. Server component passes the
 * already-resolved link list (locale-aware, session-aware) as serializable
 * props; this client component owns the open/closed state.
 *
 * Accessibility: `aria-expanded` + `aria-controls` on the toggle, the panel is
 * a plain `<nav>` of links (works without JS styling), Escape closes it and
 * returns focus to the toggle, outside clicks close it, and it closes itself
 * on navigation. The panel scrolls internally (`max-h`) so long signed-in
 * lists never exceed the viewport.
 */
export function MobileNav({
  locale,
  links,
  authLinks,
}: {
  locale: LocaleCode;
  links: Array<{ href: string; label: string }>;
  /** Sign-in / create-account shortcuts — only passed while signed out. */
  authLinks?: { login: string; register: string } | null;
}) {
  const { dict } = getDictionary(locale);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const wrapRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close after navigating (covers links outside the panel too).
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div ref={wrapRef} className="lg:hidden">
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        aria-label={open ? dict.common.menuClose : dict.common.menuOpen}
        className="grid size-11 place-items-center rounded-lg border border-sand-200 text-sand-700 hover:bg-sand-100"
      >
        {open ? <CloseIcon className="size-5" /> : <MenuIcon className="size-5" />}
      </button>

      {open ? (
        <nav
          id="mobile-nav-panel"
          aria-label={dict.nav.home}
          className="absolute inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-sand-200 bg-white p-4 shadow-lg"
        >
          <ul className="flex flex-col gap-1">
            {links.map((link) => {
              const active = isActive(link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={[
                      'flex min-h-11 items-center rounded-lg px-3 py-2.5 font-medium hover:bg-sand-100 hover:text-sand-900',
                      active ? 'bg-brand-50 text-brand-800' : 'text-sand-700',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2 border-t border-sand-100 pt-3">
            {authLinks ? (
              <>
                <Link
                  href={authLinks.login}
                  onClick={() => setOpen(false)}
                  className={buttonClasses({ variant: 'outline', className: 'flex-1' })}
                >
                  {dict.nav.login}
                </Link>
                <Link
                  href={authLinks.register}
                  onClick={() => setOpen(false)}
                  className={buttonClasses({ className: 'flex-1' })}
                >
                  {dict.nav.register}
                </Link>
              </>
            ) : (
              <Link
                href={`/${locale}/settings`}
                onClick={() => setOpen(false)}
                className={buttonClasses({ variant: 'outline', className: 'flex-1' })}
              >
                {dict.nav.settings}
              </Link>
            )}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
