'use client';

import { ApiErrorCard } from '@/components/api-error-card';

// error.tsx must be a Client Component (it receives an error prop + a reset
// callback). The pilot pattern (persons/publications detail pages) wraps a
// breadcrumb plus ApiErrorCard. List pages have no parent to navigate back
// to, so the card alone — pilot-consistent title.
export default function PressReleasesError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="space-y-4">
      <ApiErrorCard title="Fehler beim Laden" message={error.message} />
    </div>
  );
}
