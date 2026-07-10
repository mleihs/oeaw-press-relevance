'use client';

import { ApiErrorCard } from '@/components/api-error-card';
import { useReportError } from '@/components/use-report-error';
import { BackLink } from './_components/back-link';

// error.tsx must be a Client Component (it receives an error prop + a reset
// callback). Provides the same UX the old client-side fetch error path had
// before the RSC migration: a back-link plus the error message.
export default function PersonDetailError({ error }: { error: Error & { digest?: string } }) {
  useReportError(error);
  return (
    <div className="space-y-4">
      <BackLink />
      <ApiErrorCard title="Fehler beim Laden" message={error.message} />
    </div>
  );
}
