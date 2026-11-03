'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { ChevronDownIcon } from '@/ui/components/icons';

/**
 * Mobile filter tray (P3, NN/g pattern): the opportunities GET form stays a
 * plain server-rendered form, wrapped in a native `<details>` disclosure —
 * no dialog primitive needed and everything keeps working without JS.
 *
 * Progressive enhancement:
 * - SSR ships `open`, so no-JS visitors (all widths) and desktop visitors
 *   see the full inline form exactly as before.
 * - After hydration below `lg` the tray collapses to a "Filters (n)" trigger
 *   sitting directly above the results; the active-filter chips beside the
 *   results keep the filter values visible while it is closed.
 * - A media-query listener re-opens the tray when a viewport reaches `lg`,
 *   so the `lg:hidden` trigger can never strand a closed form on desktop.
 */
export function FilterTray({
  locale,
  activeCount,
  children,
}: {
  locale: LocaleCode;
  activeCount: number;
  children: ReactNode;
}) {
  const { dict } = getDictionary(locale);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const sync = (): void => {
      details.open = desktop.matches;
    };
    sync(); // collapse below lg on first paint after hydration
    desktop.addEventListener('change', sync);
    return () => desktop.removeEventListener('change', sync);
  }, []);

  return (
    <details ref={detailsRef} open data-testid="filter-tray" className="group mt-6">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-sand-200 bg-white px-3 py-2 text-sm font-semibold text-sand-900 hover:bg-sand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand-900 lg:hidden [&::-webkit-details-marker]:hidden">
        <span>
          {dict.common.filters}
          {activeCount > 0 ? ` (${activeCount})` : ''}
        </span>
        <ChevronDownIcon className="size-4 text-sand-500 transition-transform group-open:rotate-180" />
      </summary>
      {children}
    </details>
  );
}
