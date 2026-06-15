'use client';

import { ApiErrorCard } from '@/components/api-error-card';
import { Button } from '@/components/ui/button';

// error.tsx must be a Client Component (it receives an error prop + a reset
// callback). Pilot-consistent with /press-releases and /publications/[id] —
// list pages have no parent to navigate back to, so just the styled card,
// with a retry wired to Next's `reset()` to re-render the segment.
export default function PublicationsError({
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
