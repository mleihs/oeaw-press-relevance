'use client';

import { RouteError } from '@/components/route-error';

// Route error boundary for /researchers. The page renders client-side, so an
// in-render throw lands here. Body shared with the other list pages via RouteError.
export default function ResearchersError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError {...props} />;
}
