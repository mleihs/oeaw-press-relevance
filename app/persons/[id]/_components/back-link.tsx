import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

// Server-renderable back-link shared by the RSC page, the not-found
// fallback, and the error fallback. Three identical inline copies before
// extraction; collapses to one place per A1's "extract on the second
// caller in a different feature" rule (here: same folder, three contexts).
export function BackLink() {
  return (
    <Link
      href="/researchers"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-brand"
    >
      <ChevronLeft className="h-3 w-3" />
      Zurück zur Forscher:innen-Übersicht
    </Link>
  );
}
