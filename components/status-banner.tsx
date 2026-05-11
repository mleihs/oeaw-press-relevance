import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const VARIANT_CLASSES = {
  success:
    'border-emerald-300 bg-emerald-50/60 text-emerald-900 dark:bg-emerald-500/[0.08] dark:border-emerald-500/30 dark:text-emerald-200',
  warning:
    'border-amber-300 bg-amber-50/60 text-amber-900 dark:bg-amber-500/[0.08] dark:border-amber-500/30 dark:text-amber-200',
  info:
    'border-blue-300 bg-blue-50/60 text-blue-900 dark:bg-blue-500/[0.08] dark:border-blue-500/30 dark:text-blue-200',
  error:
    'border-red-300 bg-red-50/60 text-red-900 dark:bg-red-500/[0.08] dark:border-red-500/30 dark:text-red-200',
  neutral: 'border bg-muted/50 text-foreground',
} as const;

export type StatusVariant = keyof typeof VARIANT_CLASSES;

interface StatusBannerProps {
  variant: StatusVariant;
  /** Icon node (e.g. `<AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />`) — caller controls sizing. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Inline alert banner with a tinted background, border, and optional icon.
 * Typical usage: "Bereits ÖAW-pressed" success-banner, orphans-warning,
 * "niedriges Guthaben" warning. For richer status summaries (title + badges +
 * footer), inline a div with `space-y-2 p-3` since the layouts vary too much
 * to generalize.
 */
export function StatusBanner({ variant, icon, children, className }: StatusBannerProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {icon}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
