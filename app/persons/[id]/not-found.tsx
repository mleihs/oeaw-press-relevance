import { EmptyState } from '@/components/empty-state';
import { BackLink } from './_components/back-link';

export default function PersonNotFound() {
  return (
    <div className="space-y-4">
      <BackLink />
      <EmptyState title="Person nicht gefunden." />
    </div>
  );
}
