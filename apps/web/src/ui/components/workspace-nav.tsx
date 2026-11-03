'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

export type WorkspaceTab =
  | 'overview'
  | 'opportunities'
  | 'applications'
  | 'members'
  | 'attendance'
  | 'hours'
  | 'certificates'
  | 'documents'
  | 'verification'
  | 'campaigns'
  | 'settings';

/** Canonical tab order — mirrors `dict.workspace.tabs`. */
const TABS: readonly WorkspaceTab[] = [
  'overview',
  'opportunities',
  'applications',
  'members',
  'attendance',
  'hours',
  'certificates',
  'documents',
  'verification',
  'campaigns',
  'settings',
];

export function workspaceTabHref(locale: LocaleCode, orgId: string, tab: WorkspaceTab): string {
  return tab === 'overview'
    ? `/${locale}/workspace/${orgId}`
    : `/${locale}/workspace/${orgId}/${tab}`;
}

/**
 * Tab bar for the organization workspace. The active tab is derived from the
 * pathname (layouts do not receive the child segment), so no extra wiring is
 * needed per page.
 */
export function WorkspaceTabs({ locale, orgId }: { locale: LocaleCode; orgId: string }) {
  const { dict } = getDictionary(locale);
  const pathname = usePathname();
  const base = `/${locale}/workspace/${orgId}`;
  const suffix = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : '';
  const active: WorkspaceTab = (TABS as readonly string[]).includes(suffix)
    ? (suffix as WorkspaceTab)
    : 'overview';

  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-sand-200"
      aria-label={dict.workspace.title}
    >
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Link
            key={tab}
            href={workspaceTabHref(locale, orgId, tab)}
            aria-current={isActive ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-t-lg px-3 text-sm font-medium ${
              isActive
                ? 'bg-white text-brand-700 shadow-sm ring-1 ring-sand-200'
                : 'text-sand-600 hover:text-sand-900'
            }`}
          >
            {dict.workspace.tabs[tab]}
          </Link>
        );
      })}
    </nav>
  );
}
