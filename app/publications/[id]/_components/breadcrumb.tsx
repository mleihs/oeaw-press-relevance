import Link from 'next/link';
import { ArrowLeft } from '@/lib/icons';

// Server-renderable back-link shared by the RSC page, the not-found
// fallback, and the error fallback (three identical inline copies before
// extraction). Ursprünglich ein Breadcrumb (Publikationen › Titel); mit dem
// Toolkit-Redesign auf den Comp-„Zurück zu Publikationen"-Link umgestellt
// (Toolkit-Redesign.dc.html Z. 220) — der Titel steht ohnehin als h1 darunter.
export function PublicationBreadcrumb(_props: { title?: string }) {
  return (
    <Link
      href="/publications"
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-brand"
    >
      <ArrowLeft className="h-[15px] w-[15px]" />
      Zurück zu Publikationen
    </Link>
  );
}
