'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDownIcon } from './icons';

/**
 * Account menu (header right side) — Radix DropdownMenu (P6 "adopt standard
 * libraries"). Holds the low-frequency signed-in destinations (workspace,
 * settings, billing, safety) so the primary nav stays within one row at every
 * width. Replaces the hand-rolled disclosure with the standard APG menu:
 * roving focus + typeahead, Escape/outside-click with focus returned to the
 * trigger, portal positioning (never clipped by the header's overflow), and
 * `aria-expanded`/`aria-haspopup` wired on the trigger.
 *
 * `align` is direction-aware (the old panel used the logical `end-0` edge):
 * Radix popper placements are physical, so the html direction — read after
 * mount, when the menu can actually open — flips `end`/`start` for RTL.
 */
export function AccountMenu({
  label,
  items,
}: {
  /** Trigger label + `aria-label` source (e.g. "Account"). */
  label: string;
  items: Array<{ href: string; label: string }>;
}) {
  const [rtl, setRtl] = useState(false);
  useEffect(() => {
    setRtl(document.documentElement.dir === 'rtl');
  }, []);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="group flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100 hover:text-sand-900"
        >
          {label}
          <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={rtl ? 'start' : 'end'}
          sideOffset={4}
          className="z-50 w-48 rounded-xl border border-sand-200 bg-white p-1 shadow-lg"
        >
          {items.map((item) => (
            <DropdownMenu.Item key={item.href} asChild>
              <Link
                href={item.href}
                className="flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100 hover:text-sand-900 focus:bg-sand-100 focus:outline-none"
              >
                {item.label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
