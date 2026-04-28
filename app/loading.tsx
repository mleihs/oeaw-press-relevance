import { LoadingState } from '@/components/loading-state';

// Default loading UI for the App Router. Per-route children can override
// with their own `loading.tsx` if they want a tighter placeholder.
export default function Loading() {
  return <LoadingState label="Lade …" />;
}
