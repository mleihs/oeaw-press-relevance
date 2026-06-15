import { LoadingState } from '@/components/loading-state';

// Route-level Suspense fallback for the `force-dynamic` social monitor page.
export default function Loading() {
  return <LoadingState label="Lade Lagebild …" />;
}
