'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { buttonClasses } from '@bladna/ui';

/**
 * Locale switcher: swaps the `/xx` prefix of the current pathname (and keeps
 * the query string) so the user stays on the page they are reading. All three
 * locales are always shown; the active one is a non-link marked with
 * `aria-current` so the current language is unambiguous.
 * Wrapped in Suspense because `useSearchParams` requires it during prerender.
 */
export function LocaleSwitch({
  target,
  label,
  current = false,
}: {
  target: string;
  label: string;
  /** The locale currently being viewed — rendered as the selected state. */
  current?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <LocaleSwitchInner target={target} label={label} current={current} />
    </Suspense>
  );
}

function LocaleSwitchInner({
  target,
  label,
  current,
}: {
  target: string;
  label: string;
  current: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const parts = pathname.split('/');
  if (parts.length > 1) parts[1] = target;
  const href = `${parts.join('/')}${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`;

  if (current) {
    // Not a control: the current locale does nothing when activated, so it
    // must not be focusable. A sized span keeps visual parity with the
    // sibling links (44px row) without promising an action.
    return (
      <span
        aria-current="true"
        aria-label={label}
        className="inline-flex h-11 items-center rounded-lg bg-sand-100 px-3 text-xs font-semibold text-sand-700"
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      hrefLang={target}
      href={href}
      aria-label={label}
      className={buttonClasses({ variant: 'ghost', size: 'sm' })}
    >
      {label}
    </Link>
  );
}
