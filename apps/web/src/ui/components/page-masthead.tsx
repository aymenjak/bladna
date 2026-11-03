import type { ReactNode } from 'react';

/**
 * P27 — the reference site's page-title band (mjeunesse.gov.dz), applied to
 * BLADNA's public hub pages: a full-bleed deep-green masthead carrying
 * eyebrow → h1 → lead (plus an optional end-edge action slot) in the same
 * gradient the landing hero opens with, so every route starts with the
 * reference's silhouette. Copy is untouched — each caller passes its existing
 * dictionary strings — and the entrance reuses the gated `rise` animation, so
 * motion opt-outs get a fully static band.
 *
 * P28 — a `children` mode lets detail pages (initiative, organization,
 * volunteer profile) and the auth shell bring their own richer header
 * markup — badges, avatars, action buttons, their own h1 — inside the same
 * band instead of re-deriving the title props. Exactly one of `title` or
 * `children` is accepted, so every caller still renders a single h1.
 */
type PageMastheadProps = {
  eyebrow?: string;
  subtitle?: string;
  note?: string;
  action?: ReactNode;
  inner?: string;
} & ({ title: string; children?: never } | { title?: never; children: ReactNode });

export function PageMasthead({
  eyebrow,
  title,
  subtitle,
  note,
  action,
  children,
  inner = 'mx-auto max-w-6xl px-4 py-10',
}: PageMastheadProps): ReactNode {
  return (
    <div
      data-page-masthead
      className="relative overflow-hidden bg-gradient-to-b from-brand-900 to-brand-800 text-white"
    >
      {/* Decorative wash — a centred radial, so RTL has nothing to mirror. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background: 'radial-gradient(46rem 20rem at 85% -30%, #b5e6d0 0%, transparent 62%)',
        }}
      />
      <div className={`rise relative ${inner}`}>
        {children ?? (
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            <div className="min-w-0">
              {eyebrow ? (
                <p className="text-xs font-semibold uppercase tracking-wider text-clay-300 rtl:tracking-normal">
                  {eyebrow}
                </p>
              ) : null}
              <h1 className={`font-bold text-3xl md:text-4xl${eyebrow ? ' mt-2' : ''}`}>{title}</h1>
              {subtitle ? <p className="mt-2 max-w-2xl text-brand-100">{subtitle}</p> : null}
              {note ? <p className="mt-3 max-w-2xl text-xs text-brand-200">{note}</p> : null}
            </div>
            {action ? <div>{action}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}
