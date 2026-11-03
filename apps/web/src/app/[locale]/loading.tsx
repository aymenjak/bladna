import { Card, Skeleton } from '@bladna/ui';
import { headers } from 'next/headers';
import { getDictionary } from '@/ui/i18n';

/**
 * Route-level loading boundary for every page under `[locale]` (RESEARCH M1):
 * before this file, slow RSC fetches rendered a blank frame — Suspense
 * skeletons existed only inside 5 auth/verify flows. One boundary here covers
 * the whole locale tree; add segment-level `loading.tsx` files only where a
 * page needs a different shape.
 *
 * Locale comes from the same `x-locale` header the root layout reads.
 */
export default async function LocaleLoading() {
  const raw = (await headers()).get('x-locale');
  const { dict } = getDictionary(raw);

  return (
    <div role="status" className="mx-auto max-w-6xl space-y-4 px-4 py-10">
      <span className="sr-only">{dict.common.loading}</span>
      {/* Page anatomy per docs/DESIGN.md §4: title, lede, then the content grid */}
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-5 pt-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
            <Skeleton className="mt-4 h-9 w-28" />
          </Card>
        ))}
      </div>
    </div>
  );
}
