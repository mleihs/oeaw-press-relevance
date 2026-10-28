// Welche LLM-Fehlermeldung ist fatal (Lauf stoppen, um Guthaben zu sparen)?
// Rein, damit sowohl der Batch-Loop (lib/server/llm-client.ts, isFatalLlmError)
// als auch die Klassifikation eines Bewertungslaufs
// (lib/shared/scoring/run-classify.ts) dieselbe Regel lesen. Die Transporte
// stellen den HTTP-Status der Meldung voran (lib/server/anthropic.ts,
// lib/server/openrouter.ts); darauf baut die Regel.

export type FatalLlmErrorClass = 'auth' | 'credits';

/** `credits`, `auth` oder null (vorübergehend: Batch überspringen, weiter). */
export function fatalLlmErrorClass(message: string): FatalLlmErrorClass | null {
  if (/\b402\b/.test(message) && /credits|afford|max_tokens|Budget|Guthaben/i.test(message)) return 'credits';
  // Anthropic meldet ein leeres Konto als 400, nicht als 402.
  if (/credit balance is too low/i.test(message)) return 'credits';
  if (/\b401\b/.test(message) && /unauthorized|invalid/i.test(message)) return 'auth';
  return null;
}
