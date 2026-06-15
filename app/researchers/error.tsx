'use client';

import { ApiErrorCard } from '@/components/api-error-card';
import { Button } from '@/components/ui/button';

// Route error boundary for /researchers. The page renders client-side, so an
// in-render throw lands here with a retry wired to Next's `reset()`.
export default function ResearchersError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <ApiErrorCard
        title="Fehler beim Laden"
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
