'use client';

import { useEffect, useState } from 'react';
import { getDictionary, type LocaleCode } from '@/ui/i18n';
import { CloseIcon } from '@/ui/components/icons';

const storageKey = (id: string) => `bladna:announcement:${id}`;

/**
 * Site-wide announcement band (P12). The server page passes an already
 * localized title/body; dismissal is remembered per announcement id so the
 * admin console can rotate content without the banner becoming permanent
 * noise. It renders in SSR (works without JS) and only hides after mount
 * when this browser has dismissed this exact announcement.
 *
 * P26 adds `variant="ticker"` — the landing page's reference-style breaking
 * strip (mjeunesse.gov.dz "red strip"): a marquee of the same title/body
 * over terracotta. The moving copy is aria-hidden (a screen reader gets the
 * sr-only full sentence instead of the duplicated track), reduced motion
 * renders it static, and hover/focus pauses it so it can be read.
 */
export function AnnouncementBanner({
  locale,
  id,
  title,
  body,
  variant = 'banner',
}: {
  locale: LocaleCode;
  id: string;
  title: string;
  body: string;
  variant?: 'banner' | 'ticker';
}) {
  const { dict } = getDictionary(locale);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey(id)) === '1') setVisible(false);
    } catch {
      // Storage blocked → the banner simply stays (never trap the user).
    }
  }, [id]);

  if (!visible) return null;

  const dismiss = (): void => {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey(id), '1');
    } catch {
      // Nothing to do — dismissal is a convenience, not a requirement.
    }
  };

  if (variant === 'ticker') {
    return (
      <div role="region" aria-label={dict.announcements.label} className="bg-clay-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <span className="shrink-0 rounded-full bg-white/20 px-3 py-1 text-xs font-bold uppercase tracking-wider rtl:tracking-normal">
            {dict.announcements.label}
          </span>
          {/* One accessible sentence; the marquee below is the decoration. */}
          <span className="sr-only">{`${title} — ${body}`}</span>
          <div aria-hidden className="ticker min-w-0 flex-1 overflow-hidden">
            <div className="ticker-track flex w-max whitespace-nowrap text-sm font-medium">
              <span className="pe-12">{title}</span>
              <span className="pe-12 text-clay-100">{body}</span>
              {/* Second copy — the track translates exactly ±50% onto it. */}
              <span className="pe-12">{title}</span>
              <span className="pe-12 text-clay-100">{body}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={dict.announcements.dismiss}
            className="grid size-10 shrink-0 place-items-center rounded-md text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <CloseIcon className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={dict.announcements.label}
      className="border-b border-clay-200 bg-clay-50"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-clay-900">{title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-clay-800">{body}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={dict.announcements.dismiss}
          className="grid size-10 shrink-0 place-items-center rounded-md text-clay-700 transition hover:bg-clay-100 hover:text-clay-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-700"
        >
          <CloseIcon className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
