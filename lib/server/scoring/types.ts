// Verträge des Bewertungskerns (lib/server/scoring/run.ts): was ein Adapter
// je Entität liefern muss, was ein Lauf an Optionen nimmt und was er
// zurückgibt. Ein Kern für Nacht, Knopf und CLI; die Unterschiede zwischen
// Publikationen und Events stecken ausschließlich in den Adaptern
// (lib/server/analysis/scoring-adapter.ts, lib/server/events/scoring-adapter.ts).

import type { MessageBatchInfo, MessageBatcher } from '@/lib/server/anthropic-batch';
import type { RunLLMBatchOptions } from '@/lib/server/llm-batch';
import type { ScoringEntity } from '@/lib/shared/scoring/entity';
import type { AuditCode, TextField } from '@/lib/shared/scoring/text-audit';
import type {
  ScoringErrorClass,
  ScoringRunCounts,
  ScoringRunStatus,
} from '@/lib/shared/scoring/run-classify';

export { SCORING_ENTITIES, type ScoringEntity } from '@/lib/shared/scoring/entity';

export type ScoringTrigger = 'nightly' | 'button' | 'cli' | 'compare';

/**
 * Wie die Modellaufrufe eines Laufs zu Anthropic gehen: `direct` einzeln und
 * sofort (Bewerten-Knopf: dort wartet jemand), `batch` gesammelt über die
 * Message Batches API, asynchron und zum halben Preis (Nacht, CLI).
 */
export type ScoringTransport = 'direct' | 'batch';

/**
 * Was der Kern an JEDEN Modellaufruf durchreicht (Bewertung, Haiku-Nachforderung,
 * Lektorat). `effort` ist als Literal getippt: einen anderen Wert als `max`
 * kann man hier nicht einmal hineinschreiben (gate.ts). `batch` ist gesetzt,
 * wenn der Lauf über die Batch-API geht; die Aufrufer reichen es an
 * completeJson weiter.
 */
export interface ScoringCall {
  apiKey: string;
  model: string;
  effort: 'max';
  batch?: MessageBatcher;
}

/** Die vier Textfelder einer Bewertung, bei Publikationen dazu das Haiku. */
export type ScoredText = Record<TextField, string> & { haiku?: string };

export interface CandidateQuery {
  limit: number;
  /** Genau diese Einträge, geschnitten mit dem Pool. */
  ids?: string[];
  /** Auch bereits Bewertetes (Re-Score-Pool statt offener Kandidaten). */
  force: boolean;
  /** Nur Einträge mit diesem llm_model (Neubewertung einer Kohorte). */
  rescoreTag?: string;
  /** Nur Einträge, die seit diesem Zeitpunkt geändert wurden (ISO-Datum). */
  since?: string;
}

/** Eine fertige Zeile, wie sie in die DB geht. */
export interface ScoredRow<TItem, TResult> {
  item: TItem;
  result: TResult;
  /** Das geprüfte Haiku, oder null (verworfen, oder Entität ohne Haiku). */
  haiku: string | null;
  /** Anteil an allen Modellaufrufen dieses Datensatzes (Bewertung, Haiku, Lektorat). */
  cost: number;
}

export interface WriteContext {
  modelTag: string;
  force: boolean;
  /** Datensätze, deren Pitch das Lektorat umgeschrieben hat (pitch_revision = 1). */
  pitchRevised: ReadonlySet<string>;
}

export interface ScoringAdapter<TItem extends { id: string; title: string }, TResult> {
  entity: ScoringEntity;
  /** Publikationen ja, Events nein. */
  requiresHaiku: boolean;
  fetchCandidates(query: CandidateQuery): Promise<{ items: TItem[]; skipped: number }>;
  /**
   * Ein Modellaufruf für einen Batch. `twins` nennt 1-basierte Positionen im
   * Batch, die Sprachversionen oder Kopien desselben Eintrags sind; der Adapter
   * formuliert daraus den Hinweis im Prompt.
   */
  analyze(
    batch: TItem[],
    call: ScoringCall,
    extra: { twins: number[][] },
  ): Promise<{ results: TResult[]; tokensUsed: number; cost: number }>;
  /** 1-basierte Position, die das Modell zurückmeldet (publication_index, event_index). */
  resultIndex(result: TResult): number | undefined;
  /** Was an einer Bewertung nicht stimmt (Dimension fehlt oder liegt außerhalb 0..1,
   *  Pflichttext leer). Leer heißt brauchbar. */
  problemsOf(result: TResult): string[];
  textsOf(result: TResult): ScoredText;
  withTexts(result: TResult, texts: Partial<ScoredText>): TResult;
  /** Quelltext des Eintrags, für Haiku-Nachforderung und Lektorat. */
  contentOf(item: TItem): string;
  /** Gruppen von ids, die denselben Termin meinen (nur Events). */
  twinGroups?(items: TItem[]): string[][];
  /** Score je Bewertung, wie ihn write speichern würde (für Median und Vergleichslauf). */
  scores(results: TResult[]): Promise<number[]>;
  /** Schreibt die Zeilen und liefert die ids, die wirklich geschrieben wurden. */
  write(rows: Array<ScoredRow<TItem, TResult>>, ctx: WriteContext): Promise<string[]>;
  markFailed(ids: string[]): Promise<void>;
}

export type AnyScoringAdapter = ScoringAdapter<{ id: string; title: string }, unknown>;

type BatchHooks = NonNullable<RunLLMBatchOptions<{ id: string; title: string }, unknown>['hooks']>;

/**
 * Fortschritts-Hooks. Die Batch-Hooks haben dieselbe Form wie bei runLLMBatch,
 * zählen aber über den ganzen Lauf einer Entität, nicht je Chunk. Die
 * SSE-Frames des Bewerten-Knopfes macht lib/server/scoring/button.ts daraus.
 */
export type ScoringHooks = BatchHooks & {
  /** Kandidaten geladen, vor dem ersten Modellaufruf; `skipped` = benannte ids außerhalb der Gates. */
  onCandidates?: (p: { entity: ScoringEntity; total: number; skipped: number }) => void;
  onChunkWritten?: (p: { entity: ScoringEntity; written: number; total: number }) => void;
};

export interface RunOptions {
  entities: readonly ScoringEntity[];
  trigger: ScoringTrigger;
  /** App-Format, z. B. `anthropic/claude-opus-5.5`; gate.ts lässt nur Opus durch. */
  model: string;
  /** Default ANTHROPIC_API_KEY. */
  apiKey?: string;
  /** Default `direct`. */
  transport?: ScoringTransport;
  /** false: nichts schreiben, kein Journal, kein Lock (Dry-Run, Vergleichslauf). */
  write: boolean;
  /** Auch bereits Bewertetes neu bewerten und überschreiben. Eine Kohorte (`rescoreTag`) impliziert es. */
  force?: boolean;
  limit?: Partial<Record<ScoringEntity, number>>;
  batchSize?: number;
  concurrency?: number;
  costCapUsd?: number;
  ids?: string[];
  rescoreTag?: string;
  since?: string;
  abortSignal?: AbortSignal;
  hooks?: ScoringHooks;
  /**
   * Vorab angelegte Journal-Zeilen je Entität (journal.startRun). Die
   * Nacht-Route braucht das: ihre 202-Antwort nennt die ids, bevor der Lauf
   * beginnt, und die Entitäten laufen nacheinander. Ohne Angabe legt der Kern
   * die Zeile selbst an.
   */
  runIds?: Partial<Record<ScoringEntity, string>>;
}

export interface ScoringRunReport {
  haiku_rejected: Array<{ id: string; title: string; attempts: number; last_issue: string }>;
  /** Erstversuche und Nachforderungen; Grundlage der Haiku-Quote im Vergleichslauf. */
  haiku_stats: { checked: number; first_try_ok: number; retried_ok: number };
  lektorat_flags: Array<{ id: string; title: string; field: TextField; code: AuditCode; detail: string }>;
  lektorat_changes: Array<{ id: string; fields: TextField[] }>;
  /** Versuchte, aber nicht bewertete Einträge, mit Grund. */
  failed_items: Array<{ id: string; title: string; reason: string }>;
  batches: Array<{ index: number; size: number; tokens: number; cost: number; durationMs: number; error?: string }>;
  /** Nur bei Transport `batch`: die Anfragen an die Batch-API, mit Wartezeit. */
  message_batches?: MessageBatchInfo[];
  audit_before: Record<AuditCode, number>;
  audit_after: Record<AuditCode, number>;
  scores: number[];
}

/** Ergebnis je Datensatz, für Dry-Run und Vergleichslauf (nicht im Journal). */
export interface ScoringOutcome {
  id: string;
  title: string;
  /** Die endgültige Bewertung (bereinigt, lektoriert), im Format des Adapters. */
  result: unknown;
  haiku: string | null;
  /** Haiku-Versuche insgesamt; 0 bei Entitäten ohne Haiku. */
  haikuAttempts: number;
  lektoratFields: TextField[];
  score: number;
  cost: number;
  written: boolean;
}

export interface EntityRunResult {
  runId: string | null;
  status: Exclude<ScoringRunStatus, 'running'>;
  summary: string;
  alarm: boolean;
  counts: ScoringRunCounts;
  /** Tokens aller Modellaufrufe dieser Entität (Bewertung, Haiku, Lektorat). */
  tokensUsed: number;
  errorClass: ScoringErrorClass | null;
  errorMessage: string | null;
  report: ScoringRunReport;
  outcomes: ScoringOutcome[];
}
