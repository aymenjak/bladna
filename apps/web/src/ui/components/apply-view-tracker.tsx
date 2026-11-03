'use client';

import { useEffect } from 'react';
import { api } from '@/ui/api/client';
import type { LocaleCode } from '@/ui/i18n';

/**
 * Counts a detail view (POST /opportunities/:slug/view) exactly once per mount.
 * Fire-and-forget: view analytics must never block or break the page.
 */
export function ApplyViewTracker({ locale, slug }: { locale: LocaleCode; slug: string }) {
  useEffect(() => {
    let sent = false;
    const timer = window.setTimeout(() => {
      if (sent) return;
      sent = true;
      void api.post(`/opportunities/${slug}/view`).catch(() => undefined);
    }, 1500);
    return () => {
      sent = true;
      window.clearTimeout(timer);
    };
  }, [locale, slug]);

  return null;
}
