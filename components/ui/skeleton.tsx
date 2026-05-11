import { cn } from '@/lib/shared/utils';

/**
 * Lightweight skeleton placeholder (shadcn-style).
 * Use animate-pulse on an empty <div> shaped like the real content.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'animate-pulse rounded-md bg-muted/70 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
