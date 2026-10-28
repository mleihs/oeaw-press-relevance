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

/**
 * Ein Aufruf, der scheiterte, aber abgerechnet wurde: die Antwort kam an und
 * taugte nur nicht (abgelehnt, abgeschnitten). Der Transport hängt die
 * Token-Nutzung an, die Fassade (completeJson) den Preis; der Bewertungskern
 * zählt ihn auf den Kostendeckel. Ohne das sähe der Deckel einen bei der
 * Obergrenze abgeschnittenen Aufruf (bei Opus 5.5 und 128K Tokens rund
 * 2,60 USD) als kostenlos.
 */
export abstract class LlmBilledError extends Error {
  /** USD; setzt completeJson, 0 solange unbekannt. */
  cost = 0;
  constructor(
    message: string,
    public readonly usage: TokenUsage | null,
  ) {
    super(message);
  }
}

/**
 * Der Anbieter hat die Anfrage abgelehnt (Anthropic `stop_reason: refusal`).
 * Eigene Klasse, weil der Bewertungskern eine Ablehnung anders behandelt als
 * einen Netzfehler: er zerlegt den Batch in Einzelaufrufe, statt fünf Einträge
 * für einen problematischen mitscheitern zu lassen. Der Name trägt die
 * Fehlerklasse ins Journal (errorClassFor in lib/shared/scoring/run-classify.ts
 * liest ihn, weil lib/shared keine Server-Klassen importieren darf).
 */
export class LlmRefusalError extends LlmBilledError {
  constructor(
    public readonly category: string,
    usage: TokenUsage | null = null,
  ) {
    super(`Anthropic: Anfrage abgelehnt (refusal, ${category})`, usage);
    this.name = 'LlmRefusalError';
  }
}

/** Die Antwort wurde an der Token-Obergrenze abgeschnitten (`stop_reason: max_tokens`). */
export class LlmMaxTokensError extends LlmBilledError {
  constructor(
    public readonly maxTokens: number,
    usage: TokenUsage | null = null,
  ) {
    super(`Anthropic: Antwort bei max_tokens=${maxTokens} abgeschnitten`, usage);
    this.name = 'LlmMaxTokensError';
  }
}
