'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

// Global error boundary for the App Router. Replaces the default Next.js
// stack-trace screen with a recoverable, branded fallback that lets the
// user retry or navigate away.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error.tsx]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" aria-hidden />
      <div>
        <h1 className="text-xl font-semibold">Etwas ist schiefgelaufen.</h1>
        <p className="mt-1 max-w-md text-sm text-neutral-500">
          Ein unerwarteter Fehler ist aufgetreten. Versuche es erneut, oder
          lade die Seite neu. Wenn der Fehler bleibt: melde dich bei der
          Pressestelle.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-neutral-400">
            Referenz: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>Nochmal versuchen</Button>
        <Button variant="outline" onClick={() => window.location.assign('/')}>Zur Startseite</Button>
      </div>
    </div>
  );
}
