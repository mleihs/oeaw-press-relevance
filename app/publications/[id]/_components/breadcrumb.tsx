import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

// Server-renderable breadcrumb shared by the RSC page, the not-found
// fallback, and the error fallback. Three identical inline copies before
// extraction; collapses to one place per the same A1/pilot pattern that
// produced `back-link.tsx` for `/persons/[id]`. `title` is optional so the
// error/not-found surfaces can render a parent-only crumb.
export function PublicationBreadcrumb({ title }: { title?: string }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link href="/publications" className="hover:text-brand transition-colors">
        Publikationen
      </Link>
      {title && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/70" />
          <span className="text-foreground truncate max-w-[300px]">{title}</span>
        </>
      )}
    </nav>
  );
}
