'use client';

import { ApiErrorCard } from '@/components/api-error-card';

// error.tsx must be a Client Component (it receives an error prop + a reset
// callback). Pilot-consistent with /press-releases and /publications/[id] —
// list pages have no parent to navigate back to, so just the styled card.
export default function PublicationsError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="space-y-4">
      <ApiErrorCard title="Fehler beim Laden" message={error.message} />
    </div>
  );
}
