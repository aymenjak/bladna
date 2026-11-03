import { Skeleton } from '@bladna/ui';

/**
 * Auth-page Suspense fallback: the form's field + button footprint in skeleton
 * form, announced once to screen readers. Replaces the old `fallback={null}`
 * blank flash while `useSearchParams` resolves.
 */
export function AuthFormSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
