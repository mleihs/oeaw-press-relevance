import type { ReactNode } from 'react';
import { cn } from '@/lib/shared/utils';

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Small uppercase grey heading used above content blocks (e.g. "Zusammenfassung",
 * "Pitch", "Schlagwörter"). Replaces 24+ ad-hoc
 * `<h4 className="text-xs font-medium text-muted-foreground uppercase mb-1">`
 * idioms across the codebase.
 *
 * Override margins via `className` (e.g. `className="mb-2"`) — twMerge handles
 * conflict-resolution between the default `mb-1` and any override.
 */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <h4 className={cn('text-xs font-medium text-muted-foreground uppercase mb-1', className)}>
      {children}
    </h4>
  );
}
