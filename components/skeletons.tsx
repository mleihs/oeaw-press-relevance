import { Skeleton } from '@/components/ui/skeleton';

/**
 * Page-shape skeletons that mirror the real layouts so loading feels solid.
 * These replace the spinner-only `LoadingState` for pages where the structure
 * is known up-front and predictable.
 */

export function TableRowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="bg-muted/50 px-3 py-2.5 flex items-center gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
        <div className="ml-auto">
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-t px-3 py-3.5 flex items-center gap-3">
          <Skeleton className="h-4 w-4 rounded-sm" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ReviewQueueSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-3 flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded-sm" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-2.5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-9 w-64 rounded-lg" />
      <TableRowSkeleton rows={5} />
    </div>
  );
}
