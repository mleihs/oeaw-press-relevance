'use client';

import { useReportError } from '@/components/use-report-error';

/**
 * Root error boundary. Unlike `app/error.tsx` (which catches errors *inside*
 * the root layout's children), `global-error.tsx` catches errors thrown by the
 * root layout itself and therefore replaces the entire document — it must
 * render its own `<html>`/`<body>` and cannot rely on layout providers
 * (theme, fonts, design tokens). So the markup here is deliberately
 * self-contained with inline styles.
 *
 * Reporting goes through the same `useReportError` hook every other boundary
 * uses, so this last-resort screen is not a blind spot for Sentry.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useReportError(error);
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: '#1f2937',
          background: '#ffffff',
        }}
      >
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
          Etwas ist schiefgelaufen.
        </h1>
        <p style={{ maxWidth: '28rem', fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
          Ein unerwarteter Fehler ist aufgetreten. Lade die Seite neu. Wenn der
          Fehler bleibt: melde dich bei der Pressestelle.
        </p>
        {error.digest && (
          <p style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>
            Referenz: {error.digest}
          </p>
        )}
        <button
          type="button"
          onClick={() => window.location.assign('/')}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            borderRadius: '0.375rem',
            border: '1px solid #d1d5db',
            background: '#f9fafb',
            cursor: 'pointer',
          }}
        >
          Zur Startseite
        </button>
      </body>
    </html>
  );
}
