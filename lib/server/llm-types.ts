// Gemeinsame Typen der LLM-Schicht. Ein Blatt-Modul ohne Imports, damit die
// Transporte (openrouter.ts, anthropic.ts) und die Fassade (llm-client.ts)
// sie teilen können, ohne einander zu importieren.

/** Tokens eines Aufrufs, nach Richtung getrennt — so rechnen beide Anbieter ab. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/** Was ein Transport für einen JSON-Aufruf zurückgibt. Kosten rechnet die Fassade. */
export interface JsonCompletion {
  /** Roher Antworttext (JSON-String, mit parseJsonContent parsen). */
  content: string;
  usage: TokenUsage;
}

/** Guthabenstand eines Keys. `null` heißt: unbekannt, nicht leer. */
export interface KeyBalance {
  limitRemaining: number | null;
  usage: number;
  limit: number | null;
  accountBalance: number | null;
  effectiveBudget: number | null;
}

/** Kein Stand verfügbar (Anthropic hat keinen Endpunkt, oder die Abfrage scheiterte). */
export const UNKNOWN_BALANCE: KeyBalance = {
  limitRemaining: null,
  usage: 0,
  limit: null,
  accountBalance: null,
  effectiveBudget: null,
};
