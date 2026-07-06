'use client';

import { RouteError } from '@/components/route-error';

// error.tsx must be a Client Component (it receives an error prop + a reset
// callback). Body shared with /press-releases and /researchers via RouteError.
export default function PublicationsError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
