import type { ReactNode } from 'react';

/**
 * Shared section rhythm for the marketing surfaces (DESIGN.md §3 "Eyebrow"
 * role + §4 page anatomy): optional pre-title label → `h2` → optional action
 * slot aligned to the end edge. One implementation keeps the landing and the
 * discover page stepping through the same hierarchy.
 *
 * RTL note: the eyebrow's `tracking-wider` is neutralised with
 * `rtl:tracking-normal` — Arabic is a joined script and letter-spacing
 * visually breaks the ligatures (never track Arabic text).
 */
export function SectionHeading({
  eyebrow,
  title,
  action,
  className,
  tone = 'light',
}: {
  eyebrow?: string;
  title: string;
  /** End-edge slot (usually a "view all" link) — mirrors to the start edge in RTL. */
  action?: ReactNode;
  className?: string;
  /** P22: dark bands (stats) invert the heading; light stays the default. */
  tone?: 'light' | 'dark';
}) {
  const dark = tone === 'dark';
  return (
    <div
      className={['flex flex-wrap items-end justify-between gap-3', className ?? '']
        .join(' ')
        .trim()}
    >
      <div>
        {eyebrow ? (
          <p
            className={`text-xs font-semibold uppercase tracking-wider rtl:tracking-normal ${
              dark ? 'text-brand-300' : 'text-brand-700'
            }`}
          >
            {eyebrow}
          </p>
        ) : null}
        <h2
          className={`text-2xl font-bold ${dark ? 'text-white' : 'text-sand-900'}${
            eyebrow ? ' mt-2' : ''
          }`}
        >
          {title}
        </h2>
      </div>
      {action ? <div className="shrink-0 pb-1">{action}</div> : null}
    </div>
  );
}
