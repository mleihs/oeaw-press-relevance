'use client';

import { ApiErrorCard } from '@/components/api-error-card';
import { Button } from '@/components/ui/button';
import { useReportError } from '@/components/use-report-error';

/**
 * Shared body for the route-segment `error.tsx` boundaries (press-releases,
 * publications, researchers list pages). Next requires each `error.tsx` to be a
 * Client Component receiving `{ error, reset }`; those files are thin wrappers
 * around this. List pages have no parent to navigate back to, so it's the
 * styled card alone with a retry wired to Next's `reset()`.
 */
export function RouteError({
  error,
  reset,
  title = 'Fehler beim Laden',
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title?: string;
}) {
  useReportError(error);
  return (
    <div className="space-y-4">
      <ApiErrorCard
        title={title}
        message={error.message}
        action={
          <Button size="sm" variant="outline" onClick={reset}>
            Nochmal versuchen
          </Button>
        }
      />
    </div>
  );
}
