'use client';

import { useEffect, useRef, useState } from 'react';
import type { LocaleCode } from '@bladna/types';
import { formatNumber } from '@/ui/format';

/**
 * P26 impact figure — counts up the first time the stat scrolls into view
 * (the reference site's animated totals). SSR renders the FINAL figure, so
 * the honest number is what crawlers, no-JS readers and reduced-motion users
 * always see; the animation only ever replays it for eyes that asked for
 * motion. One count per mount, cancelled cleanly on unmount.
 */
export function StatCounter({ value, locale }: { value: number; locale: LocaleCode }) {
  const [display, setDisplay] = useState(value);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let frame = 0;
    let started = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (started || !entries.some((entry) => entry.isIntersecting)) return;
        started = true;
        observer.disconnect();
        const t0 = performance.now();
        const step = (now: number): void => {
          const progress = Math.min(1, (now - t0) / 1400);
          const eased = 1 - (1 - progress) ** 3;
          setDisplay(progress < 1 ? Math.round(value * eased) : value);
          if (progress < 1) frame = requestAnimationFrame(step);
        };
        setDisplay(0);
        frame = requestAnimationFrame(step);
      },
      { threshold: 0.35 },
    );
    observer.observe(node);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);

  return (
    <span ref={ref} data-stat-counter>
      {formatNumber(display, locale)}
    </span>
  );
}
