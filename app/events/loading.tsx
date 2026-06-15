import { LoadingState } from '@/components/loading-state';

// Route-level Suspense fallback for the `force-dynamic` events page.
export default function Loading() {
  return <LoadingState label="Lade Events …" />;
}
