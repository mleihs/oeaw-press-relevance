// Severity-Entscheidung eines Bewertungslaufs, als reine Funktion (Muster
// lib/server/ingest/classify-run.ts). Sie beantwortet zwei Fragen: welcher
// Status gehört ins Journal `scoring_runs`, und verdient der Lauf einen Alarm?
//
// Die Linie ist dieselbe wie beim Ingest (Post-mortem 2026-07-21): Alarm nur,
// wenn der Lauf wirklich gescheitert ist. Ein verworfenes Haiku oder ein
// Lektorat-Hinweis ist Normalbetrieb mit Nacharbeit (`partial`): Journal und
// Kachel zeigen es, niemand wird nachts angepiept.

import { fatalLlmErrorClass } from '../llm-errors';

export const SCORING_ERROR_CLASSES = [
  'provider_gate',
  'model_gate',
  'effort_gate',
  'auth',
  'credits',
  'refusal',
  'max_tokens',
  'json_parse',
  'cost_cap',
  'lock_busy',
  'db',
  'transport',
  'aborted',
  'unknown',
] as const;
export type ScoringErrorClass = (typeof SCORING_ERROR_CLASSES)[number];

export type ScoringRunStatus = 'running' | 'ok' | 'partial' | 'failed' | 'skipped';

export interface ScoringRunCounts {
  candidates: number;
  scored: number;
  failed: number;
  skipped: number;
  haikuRejected: number;
  lektoratFlags: number;
  lektoratChanges: number;
  costUsd: number;
  costCapUsd: number;
  costCapHit: boolean;
}

export interface ScoringFatal {
  errorClass: ScoringErrorClass;
  message: string;
}

export interface ScoringRunVerdict {
  status: Exclude<ScoringRunStatus, 'running'>;
  summary: string;
  alarm: boolean;
}

/**
 * Status, Einzeiler und Alarm eines beendeten Laufs.
 *
 *   fatal lock_busy        skipped, kein Alarm (ein anderer Lauf hält den Lock)
 *   fatal cost_cap         partial, kein Alarm (bewusster Stopp am Deckel)
 *   fatal aborted          partial, kein Alarm (Abbruch durch den Aufrufer,
 *                          etwa das geschlossene Bewerten-Modal; die Nacht
 *                          bricht nie selbst ab)
 *   fatal sonst            failed, Alarm
 *   keine Kandidaten       skipped
 *   alles bewertet, sauber ok
 *   sonst                  partial, kein Alarm
 */
export function classifyScoringRun(c: ScoringRunCounts, fatal: ScoringFatal | null): ScoringRunVerdict {
  const tally = summarize(c);
  if (fatal?.errorClass === 'lock_busy') {
    return { status: 'skipped', summary: 'übersprungen, ein anderer Bewertungslauf ist aktiv', alarm: false };
  }
  if (fatal?.errorClass === 'cost_cap') {
    return { status: 'partial', summary: `Kostendeckel erreicht: ${tally}`, alarm: false };
  }
  if (fatal?.errorClass === 'aborted') {
    return { status: 'partial', summary: `abgebrochen: ${tally}`, alarm: false };
  }
  if (fatal) {
    return { status: 'failed', summary: `abgebrochen (${fatal.errorClass}: ${fatal.message}): ${tally}`, alarm: true };
  }
  if (c.candidates === 0) return { status: 'skipped', summary: 'keine Kandidaten', alarm: false };

  const clean = c.scored === c.candidates && c.failed === 0 && c.haikuRejected === 0 && c.lektoratFlags === 0;
  return { status: clean ? 'ok' : 'partial', summary: tally, alarm: false };
}

const usd = (n: number) => `${n.toFixed(2).replace('.', ',')} USD`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** „62 Kandidaten, 60 bewertet, 2 Haikus verworfen, 1 Lektorat-Hinweis, 9,80 USD". */
function summarize(c: ScoringRunCounts): string {
  const parts = [plural(c.candidates, 'Kandidat', 'Kandidaten'), `${c.scored} bewertet`];
  if (c.failed > 0) parts.push(`${c.failed} fehlgeschlagen`);
  if (c.skipped > 0) parts.push(`${c.skipped} übersprungen`);
  if (c.haikuRejected > 0) parts.push(`${plural(c.haikuRejected, 'Haiku', 'Haikus')} verworfen`);
  if (c.lektoratFlags > 0) parts.push(plural(c.lektoratFlags, 'Lektorat-Hinweis', 'Lektorat-Hinweise'));
  parts.push(c.costCapHit ? `${usd(c.costUsd)} von ${usd(c.costCapUsd)}` : usd(c.costUsd));
  return parts.join(', ');
}

/** Fehlernamen, die die Transporte und der Kern setzen (lib/server/llm-types.ts,
 *  lib/server/run-lock.ts, AbortController). Über den Namen statt über
 *  `instanceof`, weil lib/shared keine Server-Klassen importieren darf. */
const CLASS_BY_NAME: Record<string, ScoringErrorClass> = {
  RunLockBusyError: 'lock_busy',
  AbortError: 'aborted',
  LlmRefusalError: 'refusal',
  LlmMaxTokensError: 'max_tokens',
};

const isErrorClass = (v: unknown): v is ScoringErrorClass =>
  typeof v === 'string' && (SCORING_ERROR_CLASSES as readonly string[]).includes(v);

/**
 * Fehlerklasse für Journal und Sentry-Tag. Reihenfolge: eine explizite
 * `errorClass`-Eigenschaft (die typisierten Fehler aus lib/server/scoring/errors.ts
 * tragen sie), dann der Fehlername, dann die Meldung.
 */
export function errorClassFor(err: unknown): ScoringErrorClass {
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    errorClass?: unknown;
    name?: unknown;
    message?: unknown;
    code?: unknown;
    severity?: unknown;
  };
  if (isErrorClass(e.errorClass)) return e.errorClass;
  if (typeof e.name === 'string' && Object.hasOwn(CLASS_BY_NAME, e.name)) return CLASS_BY_NAME[e.name];
  // Postgres-Fehler (postgres-js, node-pg) tragen SQLSTATE und Severity.
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) && typeof e.severity === 'string') return 'db';

  const message = typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : '';
  const fatal = fatalLlmErrorClass(message);
  if (fatal) return fatal;
  if (/\brefusal\b|abgelehnt/i.test(message)) return 'refusal';
  if (/max_tokens/i.test(message)) return 'max_tokens';
  if (/parse .*JSON|JSON\.parse|Unexpected token .* JSON/i.test(message)) return 'json_parse';
  if (/Failed query|PostgresError|duplicate key|violates|relation .* does not exist/i.test(message)) return 'db';
  // Netz, Überlast und Ratenlimit: nach den SDK-Retries immer noch nicht durch.
  if (
    /ECONNRESET|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network|overloaded|rate.?limit|\b(429|5\d\d)\b/i.test(
      message,
    )
  ) {
    return 'transport';
  }
  if (/\babort/i.test(message)) return 'aborted';
  return 'unknown';
}
