'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Primary nav links with an active state — the active item gets
 * `aria-current="page"` (WCAG / SEO) plus a brand tint, so users always know
 * where they are. Server components can't read the pathname, so the link list
 * itself is passed down as serializable props.
 *
 * Active rule: exact match, or any descendant route (`/en/map` is active on
 * `/en/map/…` but never on `/en/maps-archive` — the trailing slash boundary
 * prevents prefix false-positives).
 */
export function NavLinks({
  links,
  label,
  className,
  activeClassName = 'bg-brand-50 text-brand-800',
}: {
  links: Array<{ href: string; label: string }>;
  /** `aria-label` for the wrapping `<nav>`. */
  label: string;
  className?: string;
  activeClassName?: string;
}) {
  const pathname = usePathname() ?? '';

  return (
    <nav aria-label={label} className={className}>
      {links.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={[
              'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100 hover:text-sand-900',
              active ? activeClassName : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
