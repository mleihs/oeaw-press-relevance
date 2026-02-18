import { CapybaraLogo } from '@/components/capybara-logo';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface EmptyStateProps {
  message: string;
  submessage?: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}

export function EmptyState({ message, submessage, actionLabel, actionHref, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <CapybaraLogo size="lg" />
      <h3 className="mt-4 font-medium text-lg text-neutral-700">{message}</h3>
      {submessage && (
        <p className="mt-1 text-sm text-neutral-500 max-w-md">{submessage}</p>
      )}
      {actionLabel && actionHref && (
        <Button asChild className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
      {actionLabel && onAction && !actionHref && (
        <Button onClick={onAction} className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
