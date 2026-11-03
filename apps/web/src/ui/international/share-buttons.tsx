'use client';

import { usePathname } from 'next/navigation';
import { Button } from '@bladna/ui';
import { toast } from 'sonner';
import { getDictionary, type LocaleCode } from '@/ui/i18n';

/**
 * Share/copy-link control for a public page (`shareLabel` / `copyLink` /
 * `linkCopied`). Copies the current page URL via the clipboard API and
 * confirms through the standard toast layer (sonner); when the browser
 * refuses (permissions/insecure context) nothing is claimed — no fake
 * success. Purely presentational, RTL-safe flex row.
 */
export function ShareButtons({ locale }: { locale: LocaleCode }) {
  const { dict } = getDictionary(locale);
  const pathname = usePathname();

  async function copy(): Promise<void> {
    try {
      if (!navigator.clipboard) return;
      await navigator.clipboard.writeText(new URL(pathname, window.location.origin).toString());
      toast.success(dict.international.linkCopied);
    } catch {
      // Clipboard unavailable — the URL stays selectable in the address bar.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm text-sand-500">{dict.international.shareLabel}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
        {dict.international.copyLink}
      </Button>
    </div>
  );
}
