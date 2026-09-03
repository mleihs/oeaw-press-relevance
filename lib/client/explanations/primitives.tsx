// Gemeinsame Bausteine der Explanation-Domänendateien: der Eintrags-Typ,
// die beiden Render-Helfer (Para/Code) und leadWithReason. Öffentliche API
// (Explanation, leadWithReason) wird über ./index.tsx re-exportiert.

import type { ReactNode } from 'react';

export interface Explanation {
  title: string;
  formula?: string;
  body: ReactNode;
  example?: ReactNode;
  note?: ReactNode;
}

export const Para = ({ children }: { children: ReactNode }) => <p className="leading-relaxed">{children}</p>;
export const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded bg-muted px-1 py-0.5 font-mono text-2xs text-foreground/90">{children}</code>
);

/**
 * Compose a per-row explanation: lead with the specific, derived reason, then
 * the generic EXPL body as context — so EXPL stays the single home for the
 * generic copy (no duplication). Returns `undefined` when there is no specific
 * reason, so callers fall straight back to the plain EXPL entry.
 *
 * Pass the result as InfoBubble's `content` alongside the original `id`:
 * InfoBubble resolves the body from `content` but the "Mehr im Hilfe-Center →"
 * deep-link from `id`, so the link survives the override.
 */
export function leadWithReason(
  base: Explanation,
  reason: string | null | undefined,
): Explanation | undefined {
  if (!reason) return undefined;
  return {
    ...base,
    body: (
      <>
        <p className="font-medium text-foreground">{reason}</p>
        {base.body}
      </>
    ),
  };
}
