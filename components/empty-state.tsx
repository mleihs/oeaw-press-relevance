import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Single, reusable empty-state. Replaces 6 ad-hoc "rounded-lg border bg-white
 * p-12 text-center text-sm text-neutral-{400,500}" idioms that drifted across
 * pages.
 *
 * Variants:
 *   - "card"   (default): bordered box on white. Use for top-level sections.
 *   - "inline":           bare centered text. Use inside an existing Card.
 *
 * Compose richer empty-states with the `icon` and `action` slots — pass any
 * ReactNode (Lucide icon, CapybaraLogo, Button, group of Buttons).
 */
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  variant?: 'card' | 'inline';
  className?: string;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  variant = 'card',
  className,
}: EmptyStateProps) {
  const wrapper =
    variant === 'card'
      ? 'rounded-lg border bg-white p-10 text-center'
      : 'py-8 text-center';

  return (
    <div className={cn(wrapper, className)} role="status">
      {icon && (
        <div className="mx-auto mb-3 text-neutral-400 [&>svg]:mx-auto [&>svg]:h-8 [&>svg]:w-8">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-neutral-700">{title}</p>
      {body && (
        <div className="mt-1 text-xs text-neutral-500 max-w-md mx-auto">
          {body}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
