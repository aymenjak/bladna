'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Fixed bottom tab bar (P3 / RESEARCH M3): the four high-frequency signed-in
 * destinations (dashboard, applications, messages, notifications) stay one
 * tap away on small screens instead of costing a hamburger open per switch —
 * the "redesign for mobile, not resize" item from the audit. Below `lg` only,
 * so the desktop header is untouched; every target is ≥44px (RESEARCH H3),
 * labels wrap instead of truncating, `aria-current="page"` marks the active
 * destination, and `env(safe-area-inset-bottom)` clears the iOS home
 * indicator. The locale layout mirrors the bar's height with bottom padding
 * so the footer is never trapped underneath it.
 */
export function BottomNav({
  locale,
  items,
}: {
  locale: LocaleCode;
  items: Array<{ href: string; label: string }>;
}) {
  const { dict } = getDictionary(locale);
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={dict.nav.tabBar}
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-6xl">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'flex min-h-11 flex-col items-center justify-center px-1 py-1.5 text-center text-[11px] leading-tight',
                  active
                    ? 'bg-brand-50 font-semibold text-brand-800'
                    : 'font-medium text-sand-600 hover:text-sand-900',
                ].join(' ')}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
