import type { HTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Loading placeholder — animated (`animate-pulse`) block that reserves the
 * final layout so content doesn't jump when it swaps in. Use inside
 * `<Suspense>` fallbacks and data-fetching skeletons.
 */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div aria-hidden className={cn('animate-pulse rounded-lg bg-sand-100', className)} {...rest} />
  );
}
