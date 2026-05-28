import type { ReactNode } from 'react';
import { cn } from '@/lib/shared/utils';

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
export type StatusBannerRole = 'alert' | 'status';

/**
 * Default live-region role per variant:
 *   - `'alert'` for errors (assertive interruption — screen reader cuts
 *     in to deliver the message).
 *   - `'status'` for warning / success / info (polite — waits for current
 *     announcement to finish).
 *   - `undefined` for neutral (purely informational, no live behaviour).
 */
function defaultRoleFor(variant: StatusVariant): StatusBannerRole | undefined {
  if (variant === 'error') return 'alert';
  if (variant === 'warning' || variant === 'success' || variant === 'info') {
    return 'status';
  }
  return undefined;
}

function resolveRole(
  variant: StatusVariant,
  override: StatusBannerRole | null | undefined,
): StatusBannerRole | undefined {
  // Explicit `null` opts out of any live-region behaviour. Useful for
  // banners that are present at first render and shouldn't get re-
  // announced on re-renders.
  if (override === null) return undefined;
  // Explicit `'alert'` or `'status'` overrides the default.
  if (override !== undefined) return override;
  // Default mapping based on variant semantics.
  return defaultRoleFor(variant);
}

interface StatusBannerProps {
  variant: StatusVariant;
  /** Icon node (e.g. `<AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />`) — caller controls sizing. */
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * ARIA live-region role. Omitting picks a sensible default based on
   * variant — `'alert'` for errors, `'status'` for warning/success/info,
   * none for neutral. Pass `null` to disable the default (useful for
   * static banners present at first render that shouldn't get re-
   * announced). Pass `'alert'` or `'status'` to override the default
   * (e.g. an info banner that should interrupt because it's
   * action-critical).
   */
  role?: StatusBannerRole | null;
}

/**
 * Inline alert banner with a tinted background, border, and optional icon.
 * Typical usage: "Bereits ÖAW-pressed" success-banner, orphans-warning,
 * "niedriges Guthaben" warning. For richer status summaries (title + badges +
 * footer), inline a div with `space-y-2 p-3` since the layouts vary too much
 * to generalize.
 *
 * a11y (WCAG 4.1.3 Status Messages): dynamically-appearing banners are
 * announced via the live-region role — `alert` for errors (assertive,
 * interrupts current speech), `status` for everything else (polite, waits
 * for current speech to finish) by default. See `resolveRole` for the
 * override / opt-out semantics.
 */
export function StatusBanner({ variant, icon, children, className, role }: StatusBannerProps) {
  const resolvedRole = resolveRole(variant, role);
  return (
    <div
      role={resolvedRole}
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
