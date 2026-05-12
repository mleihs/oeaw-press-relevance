import { EmptyState } from '@/components/empty-state';
import { PublicationBreadcrumb } from './_components/breadcrumb';

export default function PublicationNotFound() {
  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <PublicationBreadcrumb />
      <EmptyState title="Publikation nicht gefunden." />
    </div>
  );
}
