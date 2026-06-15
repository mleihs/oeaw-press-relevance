import { LoadingState } from '@/components/loading-state';

// Route-level Suspense fallback: the publications list is `force-dynamic` and
// awaits a DB read, so without this the gate-to-content navigation shows a
// blank frame until the query resolves.
export default function Loading() {
  return <LoadingState label="Lade Publikationen …" />;
}
