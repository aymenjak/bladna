'use client';

import { useEffect, useState } from 'react';
import { PauseIcon, PlayIcon } from '@/ui/components/icons';

const SLIDE_MS = 6000;

/**
 * P26 hero slideshow — the reference site's framed photo slider
 * (mjeunesse.gov.dz): crossfading frames with a slow drift, a `01 / 04`
 * counter, clickable progress segments and a play/pause toggle.
 *
 * The photos are decorative (alt=""; inactive frames aria-hidden), so the
 * overlay copy stays the page's accessible content. Reduced motion never
 * autoplays — the first frame simply stays put — and a hidden tab stops
 * advancing so the slider doesn't burn through the set unobserved.
 */
export function HeroSlider({
  slides,
  label,
  showLabel,
  playLabel,
  pauseLabel,
}: {
  slides: readonly string[];
  /** Group label — the slider is one landmark, not four images. */
  label: string;
  /** Prefixed with the slide number by the component ("Show slide 2"). */
  showLabel: string;
  playLabel: string;
  pauseLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setPlaying(false);
  }, []);

  useEffect(() => {
    if (!playing || slides.length < 2) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((current) => (current + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
  }, [playing, slides.length]);

  const pad = (n: number): string => String(n).padStart(2, '0');

  return (
    <div data-hero-slider role="group" aria-label={label} className="w-full">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] border border-white/15 shadow-2xl ring-1 ring-black/20 sm:aspect-[16/10]">
        {slides.map((slug, i) => (
          <img
            key={slug}
            data-slide={i}
            src={`/photos/${slug}.jpg`}
            alt=""
            aria-hidden={i !== index}
            width={1024}
            height={683}
            loading={i === 0 ? 'eager' : 'lazy'}
            decoding="async"
            className={`hero-slide absolute inset-0 size-full object-cover ${
              i === index ? 'hero-slide-active opacity-100' : 'opacity-0'
            }`}
          />
        ))}
        {/* Scrim — keeps the frame's edges readable against the dark band. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-brand-950/70 via-transparent to-brand-950/20"
        />
      </div>

      {/* Counter row — the reference's `04 / 10` + segmented progress bar. */}
      <div className="mt-3 flex items-center gap-3">
        <p aria-hidden className="shrink-0 text-sm tabular-nums text-clay-300">
          {pad(index + 1)}
          <span className="px-1 text-sand-500">/</span>
          {pad(slides.length)}
        </p>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {slides.map((slug, i) => (
            <button
              key={slug}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`${showLabel} ${i + 1}`}
              aria-current={i === index ? 'true' : undefined}
              className="group flex h-6 min-w-0 flex-1 items-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-300"
            >
              <span
                className={`h-1.5 w-full rounded-full transition ${
                  i === index
                    ? 'bg-gradient-to-r from-clay-300 to-clay-500'
                    : 'bg-white/25 group-hover:bg-white/50'
                }`}
              />
            </button>
          ))}
        </div>
        <button
          type="button"
          data-slider-toggle
          onClick={() => setPlaying((current) => !current)}
          aria-pressed={playing}
          aria-label={playing ? pauseLabel : playLabel}
          className="grid size-10 shrink-0 place-items-center rounded-full border border-white/25 bg-black/30 text-white transition hover:bg-black/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-300"
        >
          {playing ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
        </button>
      </div>
    </div>
  );
}
