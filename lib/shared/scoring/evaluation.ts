// Plausibilität einer Bewertung, bevor sie weiterverarbeitet wird: jede
// Dimension eine Zahl in 0..1, jeder Pflichttext vorhanden. Eine Regel für
// Modell- und Chat-Bewertungen: der Bewertungskern prüft damit jede
// Modellantwort (problemsOf der Adapter), die In-Chat-Apply-Skripte jede Zeile
// der Eingabedatei. Rein, ohne Abhängigkeiten.

/** Eine Zahl in 0..1, sonst nichts: kein String, kein NaN, keine Unendlichkeit. */
export function isUnitScore(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

/**
 * Was an einer Bewertung nicht stimmt, je Problem eine Zeile; leer heißt
 * brauchbar. `texts` sind die Felder, die nicht leer sein dürfen.
 */
export function evaluationProblems(
  evaluation: unknown,
  spec: { dimensions: readonly string[]; texts?: readonly string[] },
): string[] {
  const r = (typeof evaluation === 'object' && evaluation !== null ? evaluation : {}) as Record<string, unknown>;
  const problems: string[] = [];
  for (const dim of spec.dimensions) {
    if (!isUnitScore(r[dim])) problems.push(`${dim}=${JSON.stringify(r[dim])} (erwartet Zahl 0..1)`);
  }
  for (const field of spec.texts ?? []) {
    const v = r[field];
    if (typeof v !== 'string' || v.trim() === '') problems.push(`${field} fehlt`);
  }
  return problems;
}
