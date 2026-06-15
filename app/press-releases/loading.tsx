import { LoadingState } from '@/components/loading-state';

// Route-level Suspense fallback for the `force-dynamic` press-releases page.
export default function Loading() {
  return <LoadingState label="Lade Presseaussendungen …" />;
}
