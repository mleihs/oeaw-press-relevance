/**
 * Single, reusable loading-indicator. Replaces 4 different ad-hoc spinner
 * idioms that drifted across pages (see audit D5).
 *
 * Variants:
 *   - "spinner": small inline ÖAW-blue circular spinner (table cells, modals)
 *   - "text":    text-only line, for inline placeholders ("Lade Rangliste …")
 *   - "panel":   centered box with spinner + text — default for empty content
 *
 * `prefers-reduced-motion` honored automatically (motion-reduce variant).
 */
type Variant = 'spinner' | 'text' | 'panel';

const SPINNER = 'animate-spin motion-reduce:animate-none rounded-full border-neutral-200 border-t-brand';

export function LoadingState({
  variant = 'panel',
  label = 'Lade …',
}: {
  variant?: Variant;
  label?: string;
}) {
  if (variant === 'spinner') {
    return (
      <span
        className={`inline-block h-4 w-4 border-2 ${SPINNER}`}
        role="status"
        aria-label={label}
      />
    );
  }
  if (variant === 'text') {
    return (
      <div
        className="rounded-lg border bg-white p-12 text-center text-sm text-neutral-500"
        role="status"
        aria-live="polite"
      >
        {label}
      </div>
    );
  }
  return (
    <div className="flex justify-center py-12" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className={`h-8 w-8 border-4 ${SPINNER}`} aria-hidden="true" />
    </div>
  );
}
