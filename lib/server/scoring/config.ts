// Stellschrauben des Bewertungskerns, an einer Stelle. Die Env-Variablen der
// Nacht (SCORING_NIGHTLY_LIMIT_*, SCORING_NIGHTLY_COST_CAP_USD,
// SCORING_BATCH_SIZE, SCORING_CONCURRENCY) nehmen diese Werte als Default;
// Knopf und CLI reichen ihre eigenen herein.

export const SCORING_DEFAULTS = {
  /** Obergrenze je Lauf und Entität. */
  limit: { publications: 80, events: 60 },
  /** Deckel je Lauf in USD, beide Entitäten zusammen (ein geteilter Zähler). */
  costCapUsd: 25,
  /** Datensätze je Modellaufruf. */
  batchSize: 5,
  /** Modellaufrufe gleichzeitig (nur Transport `direct`; über die Batch-API gehen alle zugleich). */
  concurrency: 2,
  /** Nacht und CLI über die Message Batches API: halber Preis, Minuten Wartezeit. */
  transport: 'batch',
} as const;

/** Nachforderungen je Haiku nach dem ersten Versuch; danach bleibt das Feld leer. */
export const HAIKU_RETRIES = 2;

/**
 * Ab so vielen abgelehnten EINZELaufrufen in einem Lauf gilt die Ablehnung als
 * systematisch (Prompt, Konto, Modell) und beendet den Lauf mit Alarm. Darunter
 * ist sie ein Problem einzelner Datensätze: die bleiben offen und stehen im
 * Bericht, der Rest wird bewertet.
 */
export const REFUSAL_LIMIT = 2;

/** So viele abgeschnittene Antworten hintereinander beenden den Lauf. */
export const MAX_TOKENS_LIMIT = 2;

/**
 * Denktiefe des Lektorats. Bewertung und Haiku-Nachforderung laufen mit max
 * (gate.ts), das Lektorat bewusst mit high (Nutzerentscheid 2026-10-28): es
 * ändert nur Texte, nie Scores, und kostete mit max rund das Zehnfache
 * (gemessen am 28.10.: 1,05 gegen 0,11 USD für denselben Chunk). Für die
 * Bewertung selbst ist high keine Option: dort lagen dieselben drei
 * Publikationen im Schnitt 0,08 über max. Ob die Sprache mit high hält, prüft
 * die Sprachprobe des Vergleichslaufs (scripts/scoring-compare.ts); hält sie
 * nicht, gehört hier wieder max hin.
 */
export const LEKTORAT_EFFORT = 'high' as const;

/**
 * Über die Batch-API wartet ein Lauf höchstens so lange auf Anthropic, gezählt
 * ab seinem Start. Danach wird storniert, was noch läuft; die Einträge bleiben
 * für die nächste Nacht offen. Anthropic sagt 24 Stunden zu, meist ist ein
 * Batch nach Minuten fertig. Mit fünf Stunden endet auch eine schlechte Nacht
 * vor dem Arbeitstag.
 */
export const BATCH_DEADLINE_MINUTES = 300;
