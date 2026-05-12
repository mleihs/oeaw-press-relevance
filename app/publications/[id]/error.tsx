'use client';

import { ApiErrorCard } from '@/components/api-error-card';
import { PublicationBreadcrumb } from './_components/breadcrumb';

// error.tsx must be a Client Component (it receives an error prop + a reset
// callback). Provides the same UX the old client-side fetch error path had
// before the RSC migration: the breadcrumb back-link plus the error card.
export default function PublicationDetailError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PublicationBreadcrumb />
      <ApiErrorCard message={error.message} />
    </div>
  );
}
