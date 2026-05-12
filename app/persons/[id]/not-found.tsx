import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';

export default function PersonNotFound() {
  return (
    <div className="space-y-4">
      <Link
        href="/researchers"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
      >
        <ChevronLeft className="h-3 w-3" />
        Zurück zur Forscher:innen-Übersicht
      </Link>
      <EmptyState title="Person nicht gefunden." />
    </div>
  );
}
