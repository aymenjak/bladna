/**
 * P11 landscape art — an original inline SVG (oasis dunes, line-art sun,
 * date-palm silhouettes) that bookends the landing page: the full motif on
 * the hero, the dune rhythm alone (no sun/palms, lighter tones) on the deep
 * final-CTA band. Drawn from tokens only (brand/sand/clay ramps) so it can
 * never drift from DESIGN.md §11.
 *
 * Craft notes:
 * - decorative by contract: `aria-hidden` + `focusable="false"`, no ids (the
 *   component renders twice on one page — no `url(#…)` references), no copy;
 * - all fills stay dark on the hero (never lighten the ground under the
 *   trust strip) and never carry meaning — clay is warmth only (§11);
 * - `w-full` + viewBox ratio keeps it proportional at every width; the
 *   parent sections are `overflow-hidden` and the content divs are
 *   positioned after it in DOM order, so the art always paints underneath.
 */
export function HeroArt({ className, deep = false }: { className?: string; deep?: boolean }) {
  if (deep) {
    // Final-CTA variant: the band is brand-900, so the dunes read *lighter*
    // than the ground; sun and palms would vanish — the crest line alone
    // carries the motif.
    return (
      <svg
        viewBox="0 0 1440 200"
        aria-hidden
        focusable="false"
        className={`block w-full ${className ?? ''}`}
      >
        <path
          d="M0,120 C220,86 420,112 660,104 C910,96 1160,70 1440,102 L1440,200 L0,200 Z"
          className="fill-brand-700/35"
        />
        <path
          d="M0,152 C260,124 520,150 760,142 C1000,134 1240,112 1440,138 L1440,200 L0,200 Z"
          className="fill-brand-800/60"
        />
        <path
          d="M0,182 C300,164 560,186 840,178 C1080,171 1280,158 1440,172 L1440,200 L0,200 Z"
          className="fill-brand-800"
        />
        <path
          d="M0,120 C220,86 420,112 660,104 C910,96 1160,70 1440,102"
          className="stroke-clay-400/40"
          strokeWidth={2}
          fill="none"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 1440 200"
      aria-hidden
      focusable="false"
      className={`block w-full ${className ?? ''}`}
    >
      {/* Line-art sun — a 25%-opacity fill keeps the luminance near the
          ground, so text crossing it (nothing should) loses no contrast.
          Left of the dune it clears the trust strip in every locale and
          width: strip items sit above the sun until the art outgrows them,
          then the items begin left of it (measured, p11 overlap probe). */}
      <circle
        cx={210}
        cy={95}
        r={22}
        className="fill-clay-600/25 stroke-clay-400/60"
        strokeWidth={2}
      />
      {/* Three dune layers: back = brand-800 wash with a terracotta crest,
          mid/front = deepening jade into the section's own brand-700 floor. */}
      <path
        d="M0,120 C220,86 420,112 660,104 C910,96 1160,70 1440,102 L1440,200 L0,200 Z"
        className="fill-brand-800/60"
      />
      <path
        d="M0,152 C260,124 520,150 760,142 C1000,134 1240,112 1440,138 L1440,200 L0,200 Z"
        className="fill-brand-900/75"
      />
      <path
        d="M0,182 C300,164 560,186 840,178 C1080,171 1280,158 1440,172 L1440,200 L0,200 Z"
        className="fill-brand-900"
      />
      <path
        d="M0,120 C220,86 420,112 660,104 C910,96 1160,70 1440,102"
        className="stroke-clay-400/50"
        strokeWidth={2}
        fill="none"
      />
      {/* Date palms — ink silhouettes rooted on the mid dune; six drooping
          fronds per crown, mirrored twice for a natural skyline. */}
      <g className="fill-sand-950 stroke-sand-950">
        <g transform="translate(318 150) scale(0.9)">
          <path d="M0,0 C-3,-26 -4,-50 3,-66" strokeWidth={5} strokeLinecap="round" fill="none" />
          <g transform="translate(3 -66)">
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(-38)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(-6)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(28)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(148)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(184)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(216)" />
          </g>
        </g>
        <g transform="translate(1128 128) scale(0.74)">
          <path d="M0,0 C3,-26 4,-50 -3,-66" strokeWidth={5} strokeLinecap="round" fill="none" />
          <g transform="translate(-3 -66)">
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(-34)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(2)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(36)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(144)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(180)" />
            <path d="M0,0 Q24,-18 52,-13 Q27,-4 4,8 Z" transform="rotate(214)" />
          </g>
        </g>
      </g>
    </svg>
  );
}
