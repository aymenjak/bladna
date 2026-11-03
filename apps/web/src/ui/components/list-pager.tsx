'use client';

import { Button } from '@bladna/ui';

/** Page envelope shared by every paginated list response (`buildPageMeta`). */
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PagerLabels {
  page: string;
  of: string;
  previous: string;
  next: string;
}

/**
 * Minimal previous/next pager — identical structure to the sessions panel so
 * every list in the app paginates the same honest way (server-side pages).
 */
export function ListPager({
  meta,
  busy,
  onPrev,
  onNext,
  labels,
}: {
  meta: PageMeta;
  busy: boolean;
  onPrev: () => void;
  onNext: () => void;
  labels: PagerLabels;
}) {
  if (meta.total === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={meta.page <= 1 || busy} onClick={onPrev}>
        {labels.previous}
      </Button>
      <span className="text-sm text-sand-600">
        {labels.page} {meta.page} {labels.of} {meta.totalPages} · {meta.total}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={meta.page >= meta.totalPages || busy}
        onClick={onNext}
      >
        {labels.next}
      </Button>
    </div>
  );
}
