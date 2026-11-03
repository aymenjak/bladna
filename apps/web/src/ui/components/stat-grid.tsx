import type { ReactNode } from 'react';

/**
 * Hairline stats panel — one bordered shell whose cells are divided by 1px
 * gaps (DESIGN.md §5 "one depth cue per layer": this is the page's single
 * card-level cue, the cells themselves are flat). Shared by the participant
 * dashboard and the workspace overview so both surfaces read as the same
 * instrument panel. P10/D7: each cell pairs the solid brand icon chip with a
 * 3xl figure — the reference KPI treatment — without adding a second depth
 * cue to the shell.
 *
 * - `<dl>/<dt>/<dd>` semantics: the numbers are a definition list.
 * - `tabular-nums` keeps digit columns aligned; the honest `—` fallback
 *   (missing enrichment) flows through as an ordinary value string.
 * - Icon slots are optional decorative nodes (`aria-hidden` by the icon
 *   wrappers) — the label always carries the meaning.
 * - Staging: callers add the `rise` entrance class (globals.css; declared
 *   only inside `prefers-reduced-motion: no-preference`).
 *
 * RTL: pure flow layout — cells reflow via grid, no directional utilities.
 */
export function StatGrid({
  items,
  columns = 4,
  className,
}: {
  items: Array<{ key: string; label: string; value: string; icon?: ReactNode; hint?: string }>;
  /** Desktop column count; mobile always starts at two columns. */
  columns?: 2 | 3 | 4;
  /** Extra classes on the outer shell (e.g. the `rise` entrance). */
  className?: string;
}) {
  const cols =
    columns === 2
      ? 'sm:grid-cols-2'
      : columns === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <dl
      className={[
        'grid grid-cols-2 gap-px overflow-hidden rounded-card border border-sand-200 bg-sand-200/70',
        cols,
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {items.map((item) => (
        <div key={item.key} className="bg-white px-5 py-4">
          <div className="flex items-center gap-2">
            {item.icon ? (
              /* P10/D7: solid jade chip — the reference KPI treatment (dark
                 tile, white glyph); brand-800 keeps G1's brand-700 rule. */
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand-800 text-white">
                {item.icon}
              </span>
            ) : null}
            <dt className="text-xs font-semibold text-sand-600">{item.label}</dt>
          </div>
          <dd className="mt-1.5 text-3xl font-bold tabular-nums text-sand-900">
            <span className="block truncate">{item.value}</span>
            {item.hint ? (
              <span className="mt-0.5 block truncate text-xs font-normal text-sand-500">
                {item.hint}
              </span>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
