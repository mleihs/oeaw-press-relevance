'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { ApiErrorCard } from '@/components/api-error-card';

// error.tsx must be a Client Component (it receives an error prop + a reset
// callback). Provides the same UX the old client-side fetch error path had
// before the RSC migration: a back-link plus the error message.
export default function PersonDetailError({ error }: { error: Error & { digest?: string } }) {
  return (
    <div className="space-y-4">
      <Link
        href="/researchers"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
      >
        <ChevronLeft className="h-3 w-3" />
        Zurück zur Forscher:innen-Übersicht
      </Link>
      <ApiErrorCard title="Fehler beim Laden" message={error.message} />
    </div>
  );
}
