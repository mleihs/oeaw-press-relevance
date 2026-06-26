import { Skeleton } from '@/components/ui/skeleton';
import { CALENDAR_SHELL_HEIGHT } from '../_lib/calendar-range';

/** Placeholder shown while the calendar island's JS loads (dynamic ssr:false)
 *  and during the next-themes mount gate, so the layout doesn't jump. Mirrors
 *  the rough proportions of a month grid. */
export function CalendarSkeleton() {
  return (
    <div className={`${CALENDAR_SHELL_HEIGHT} rounded-xl border bg-card p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 42 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}
