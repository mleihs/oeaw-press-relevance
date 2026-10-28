// Der Bewertungskern: EIN Ablauf für Nacht, Bewerten-Knopf und CLI, für
// Publikationen und Events (Plan §3, §5.5). Die Unterschiede der Entitäten
// stecken in den Adaptern; hier steht, was für beide gleich ist und vorher nur
// beim In-Chat-Bewerten von Hand passierte: Text-Gates, Haiku-Nachforderung,
// Lektorat, Journal, Kostendeckel.
//
// Ablauf je Entität:
//   Journal-Zeile, Lock, Kandidaten, Chunks à 25 (Zwillinge bleiben zusammen).
//   Je Chunk: Bewertung in Batches à 5, zwei gleichzeitig; abgelehnte Batches
//   einzeln nachgereicht. Dann bereinigen und prüfen, Haiku nachfordern (bis zu
//   zweimal), Lektorat (immer; abgeschnitten wird halbiert), erneut prüfen,
//   Laufgedächtnis fortschreiben, Gedankenstrich-Fallback, schreiben,
//   Zwischenstand ins Journal.
//   Am Ende: Status nach run-classify, Journal schließen, Lock freigeben,
//   Sentry nur bei `failed`.
//
// Effort ist für Bewertung und Haiku-Nachforderung `max` und kommt aus gate.ts,
// nicht aus der Env (ScoringCall trägt ihn als Literal-Typ). Das Lektorat läuft
// mit LEKTORAT_EFFORT (config.ts, high): es ändert nur Texte, nie Scores.
//
// ABLEHNUNGEN. Lehnt das Modell einen Batch ab (stop_reason refusal), liegt das
// fast immer an EINEM Eintrag. Der Batch wird deshalb einzeln nachgereicht: der
// eine Eintrag bleibt offen und steht im Bericht, die anderen werden bewertet.
// Erst ab REFUSAL_LIMIT abgelehnten Einzelaufrufen gilt die Ablehnung als
// systematisch und beendet den Lauf mit Alarm. Ohne diese Zerlegung bliebe ein
// problematischer Eintrag als Kandidat stehen (failed wird wiederholt), riss
// jede Nacht vier Nachbarn mit und alarmierte jede Nacht.
//
// KOSTEN. Der Deckel gilt für den ganzen Lauf, beide Entitäten zusammen. Er
// wird vor jedem neuen Batch und jedem neuen Chunk geprüft; ein angefangener
// Chunk wird noch fertig lektoriert und geschrieben, sonst wäre bezahlte Arbeit
// verloren. Gezählt wird, was die Transporte als abgerechnet zurückmelden,
// auch für abgelehnte und abgeschnittene Antworten (LlmBilledError); nur
// Aufrufe ohne Antwort (Netz, 5xx) kennen keine Kosten.
//
// TRANSPORT. Mit `transport: 'batch'` (Nacht, CLI) gehen die Modellaufrufe über
// die Message Batches API (lib/server/anthropic-batch.ts): gleiches Modell,
// gleiche Parameter, halber Preis, dafür Minuten Wartezeit je Runde. Damit die
// Aufrufe einer Phase in EINER Batch-Anfrage landen, laufen sie dann alle
// gleichzeitig (Bewertungen eines Chunks, Haiku-Nachforderungen, Lektorat-
// Hälften). Der Deckel greift dann je Chunk statt je Batch, denn die Kosten
// eines Batches kennt man erst mit seinem Ergebnis. Gewartet wird höchstens bis
// BATCH_DEADLINE_MINUTES nach dem Start des Laufs.

import * as Sentry from '@sentry/nextjs';
import { MessageBatcher } from '@/lib/server/anthropic-batch';
import { describeError } from '@/lib/server/ingest/describe-error';
import { runLLMBatch } from '@/lib/server/llm-batch';
import { isFatalLlmError } from '@/lib/server/llm-client';
import { LlmBilledError, LlmMaxTokensError, LlmRefusalError } from '@/lib/server/llm-types';
import { log } from '@/lib/server/log';
import { acquireRunLock, RUN_LOCK_KEYS, type RunLockHandle } from '@/lib/server/run-lock';
import { mapPool } from '@/lib/shared/concurrency';
import { joinHaikuLines } from '@/lib/shared/haiku';
import { checkHaiku } from '@/lib/shared/scoring/haiku-syllables';
import { autoModelTag } from '@/lib/shared/scoring/model-tag';
import {
  classifyScoringRun,
  errorClassFor,
  type ScoringFatal,
  type ScoringRunCounts,
} from '@/lib/shared/scoring/run-classify';
import {
  AUDIT_CODES,
  TEXT_FIELDS,
  auditBatch,
  auditItem,
  countFindings,
  type AuditCode,
  type AuditFinding,
  type TextField,
} from '@/lib/shared/scoring/text-audit';
import { replaceEmDashesFallback, sanitizeText } from '@/lib/shared/scoring/text-sanitize';
import { oneOfEachGroup, pairResults, partitionKeepingGroups, twinPositions } from './batching';
import { BATCH_DEADLINE_MINUTES, HAIKU_RETRIES, MAX_TOKENS_LIMIT, REFUSAL_LIMIT, SCORING_DEFAULTS } from './config';
import { CostCapError } from './errors';
import { assertScoringPreconditions } from './gate';
import { requestHaiku, type HaikuAttempt } from './haiku-retry';
import { finishRun, progressRun, startRun } from './journal';
import { LEKTORAT_WINDOW, emptyRunMemory, lektorat, rememberChunk, type RunMemory } from './lektorat';
import type {
  AnyScoringAdapter,
  EntityRunResult,
  RunOptions,
  ScoringCall,
  ScoringEntity,
  ScoringOutcome,
  ScoringRunReport,
} from './types';

type Item = { id: string; title: string };

const LOCK_KEY: Record<ScoringEntity, string> = {
  publications: RUN_LOCK_KEYS.scorePublications,
  events: RUN_LOCK_KEYS.scoreEvents,
};

/** Der geteilte Kostenzähler eines Laufs, über beide Entitäten. */
interface Budget {
  spent: number;
  cap: number;
}

/** Zustand einer Entität während des Laufs. */
interface EntityState {
  adapter: AnyScoringAdapter;
  opts: RunOptions;
  call: ScoringCall;
  budget: Budget;
  modelTag: string;
  runId: string | null;
  counts: ScoringRunCounts;
  report: ScoringRunReport;
  outcomes: ScoringOutcome[];
  memory: RunMemory;
  /** Position jedes Kandidaten im Lauf (Feld batch_start der SSE-Frames). */
  position: Map<string, number>;
  totalBatches: number;
  batchesStarted: number;
  batchCounter: number;
  /** Einträge mit Modellantwort oder Fehler, und davon die brauchbaren (Fortschritt). */
  settled: Set<string>;
  succeeded: Set<string>;
  tokens: number;
  refusedSingles: number;
  maxTokensStreak: number;
  /** Fehler, der den Lauf beenden soll (von runLLMBatch als fatal gemeldet). */
  fatalError: unknown;
  /** Zuletzt aufgetretener Fehler, für die Regel „nichts bewertet". */
  lastError: unknown;
}

/** Ein Datensatz zwischen Modellantwort und Schreiben. */
interface Working {
  item: Item;
  result: unknown;
  texts: Record<TextField, string>;
  rawHaiku: string | undefined;
  haiku: string | null;
  haikuAttempts: number;
  cost: number;
  lektoratFields: TextField[];
}

interface ChunkScratch {
  collected: Map<string, { item: Item; result: unknown; cost: number }>;
  /** Versuchte Einträge ohne brauchbares Ergebnis, mit Grund. */
  failures: Map<string, string>;
  /** Einträge abgelehnter Batches, die einzeln nachgereicht werden. */
  isolate: Item[];
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

function abortError(): DOMException {
  return new DOMException('Bewertung abgebrochen', 'AbortError');
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError();
}

function emptyReport(): ScoringRunReport {
  const zero = () => Object.fromEntries(AUDIT_CODES.map((c) => [c, 0])) as Record<AuditCode, number>;
  return {
    haiku_rejected: [],
    haiku_stats: { checked: 0, first_try_ok: 0, retried_ok: 0 },
    lektorat_flags: [],
    lektorat_changes: [],
    failed_items: [],
    batches: [],
    audit_before: zero(),
    audit_after: zero(),
    scores: [],
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function addCounts(into: Record<AuditCode, number>, add: Record<AuditCode, number>): void {
  for (const code of AUDIT_CODES) into[code] += add[code];
}

/** Eine Kohorte neu zu bewerten heißt überschreiben; ohne force griffe der Schutz im WHERE. */
const forceOf = (opts: RunOptions): boolean => opts.force === true || Boolean(opts.rescoreTag);

/**
 * Bewertet die Kandidaten der gewünschten Entitäten nacheinander, mit einem
 * geteilten Kostendeckel. Wirft nur, wenn der Lauf gar nicht erst beginnen
 * darf (Gate, Aufruffehler); alles danach landet als Status im Ergebnis und,
 * bei `write`, im Journal.
 */
export async function runScoring(
  opts: RunOptions,
  adapters: readonly AnyScoringAdapter[],
): Promise<Partial<Record<ScoringEntity, EntityRunResult>>> {
  const call = assertScoringPreconditions({ model: opts.model, apiKey: opts.apiKey });
  if (opts.ids?.length && opts.entities.length !== 1) {
    throw new Error('Benannte ids gelten für genau eine Entität je Lauf.');
  }
  const budget: Budget = { spent: 0, cap: opts.costCapUsd ?? SCORING_DEFAULTS.costCapUsd };
  // Eine Frist für den ganzen Lauf: die zweite Entität bekommt, was übrig ist.
  const batchDeadline = Date.now() + BATCH_DEADLINE_MINUTES * 60_000;
  const results: Partial<Record<ScoringEntity, EntityRunResult>> = {};
  for (const entity of opts.entities) {
    const adapter = adapters.find((a) => a.entity === entity);
    if (!adapter) throw new Error(`Kein Bewertungsadapter für ${entity}.`);
    results[entity] = await runEntity(adapter, opts, call, budget, batchDeadline);
  }
  return results;
}

async function runEntity(
  adapter: AnyScoringAdapter,
  opts: RunOptions,
  call: ScoringCall,
  budget: Budget,
  batchDeadline: number,
): Promise<EntityRunResult> {
  const s: EntityState = {
    adapter,
    opts,
    call,
    budget,
    modelTag: autoModelTag(call.model),
    runId: null,
    counts: {
      candidates: 0,
      scored: 0,
      failed: 0,
      skipped: 0,
      haikuRejected: 0,
      lektoratFlags: 0,
      lektoratChanges: 0,
      costUsd: 0,
      costCapUsd: budget.cap,
      costCapHit: false,
    },
    report: emptyReport(),
    outcomes: [],
    memory: emptyRunMemory(),
    position: new Map(),
    totalBatches: 0,
    batchesStarted: 0,
    batchCounter: 0,
    settled: new Set(),
    succeeded: new Set(),
    tokens: 0,
    refusedSingles: 0,
    maxTokensStreak: 0,
    fatalError: null,
    lastError: null,
  };
  if (opts.transport === 'batch') {
    s.report.message_batches = [];
    const batch = new MessageBatcher({
      apiKey: call.apiKey,
      deadline: batchDeadline,
      signal: opts.abortSignal,
      onBatch: (info) => s.report.message_batches?.push(info),
    });
    s.call = { ...call, batch };
  }
  const entity = adapter.entity;
  let lock: RunLockHandle | null = null;

  try {
    let thrown: unknown = null;
    try {
      // Erst die Journal-Zeile, dann der Lock: auch ein übersprungener Lauf
      // (Lock belegt) soll im Journal stehen. Ohne `write` weder Journal noch
      // Lock: ein Dry-Run oder Vergleichslauf blockiert die Nacht nicht.
      if (opts.write) {
        s.runId =
          opts.runIds?.[entity] ??
          (await startRun({
            entity,
            trigger: opts.trigger,
            model: call.model,
            modelTag: s.modelTag,
            effort: call.effort,
            costCapUsd: budget.cap,
          }));
        lock = await acquireRunLock(LOCK_KEY[entity]);
      }
      await scoreCandidates(s);
    } catch (err) {
      thrown = err;
    }

    let fatalError = thrown;
    let fatal: ScoringFatal | null =
      thrown === null ? null : { errorClass: errorClassFor(thrown), message: describeError(thrown) };
    // Versucht, aber nichts bewertet: ein gescheiterter Lauf, auch wenn jeder
    // einzelne Fehler für sich vorübergehend war (Ausfall, kaputte Antworten).
    if (!fatal && s.counts.scored === 0 && s.counts.failed > 0) {
      fatalError = s.lastError ?? new Error(s.report.failed_items[0]?.reason ?? 'kein Eintrag bewertet');
      fatal = { errorClass: errorClassFor(fatalError), message: describeError(fatalError) };
    }
    if (fatal?.errorClass === 'cost_cap') s.counts.costCapHit = true;
    if (fatal?.errorClass === 'aborted') {
      opts.hooks?.onCancelled?.({
        processed: s.settled.size,
        successful: s.succeeded.size,
        failed: s.settled.size - s.succeeded.size,
        total: s.counts.candidates,
      });
    }

    const verdict = classifyScoringRun(s.counts, fatal);
    if (s.runId) {
      await finishRun(s.runId, {
        status: verdict.status,
        counts: s.counts,
        summary: verdict.summary,
        error: fatal,
        report: s.report,
        medianScore: median(s.report.scores),
      }).catch((err: unknown) => log.error('scoring_journal_finish_failed', { runId: s.runId, err }));
    }

    const fields = { entity, trigger: opts.trigger, runId: s.runId, status: verdict.status, summary: verdict.summary };
    if (verdict.alarm) {
      log.error('scoring_run_failed', { ...fields, errorClass: fatal?.errorClass });
      if (opts.write) {
        Sentry.captureException(fatalError ?? new Error(verdict.summary), {
          tags: { seam: 'scoring_run', entity, trigger: opts.trigger, error_class: fatal?.errorClass ?? 'unknown' },
        });
      }
    } else if (verdict.status === 'partial') {
      log.warn('scoring_run_partial', fields);
    } else {
      log.info('scoring_run_finished', fields);
    }

    return {
      runId: s.runId,
      status: verdict.status,
      summary: verdict.summary,
      alarm: verdict.alarm,
      counts: s.counts,
      tokensUsed: s.tokens,
      errorClass: fatal?.errorClass ?? null,
      errorMessage: fatal?.message ?? null,
      report: s.report,
      outcomes: s.outcomes,
    };
  } finally {
    await lock?.release();
  }
}

async function scoreCandidates(s: EntityState): Promise<void> {
  const { adapter, opts } = s;
  const entity = adapter.entity;
  const { items, skipped } = await adapter.fetchCandidates({
    limit: opts.limit?.[entity] ?? SCORING_DEFAULTS.limit[entity],
    ids: opts.ids,
    force: forceOf(opts),
    rescoreTag: opts.rescoreTag,
    since: opts.since,
  });
  s.counts.candidates = items.length;
  s.counts.skipped = skipped;
  items.forEach((item, i) => s.position.set(item.id, i));
  opts.hooks?.onCandidates?.({ entity, total: items.length, skipped });
  await saveProgress(s);
  if (items.length === 0) return;

  const groups = adapter.twinGroups?.(items) ?? [];
  const size = opts.batchSize ?? SCORING_DEFAULTS.batchSize;
  const chunks = partitionKeepingGroups(items, LEKTORAT_WINDOW, groups);
  s.totalBatches = chunks.reduce((n, chunk) => n + partitionKeepingGroups(chunk, size, groups).length, 0);

  for (const chunk of chunks) {
    throwIfAborted(opts.abortSignal);
    if (s.budget.spent >= s.budget.cap) throw new CostCapError(s.budget.spent, s.budget.cap);
    const stoppedReason = await scoreChunk(s, chunk, groups);
    await saveProgress(s);
    if (stoppedReason === 'cost_cap') throw new CostCapError(s.budget.spent, s.budget.cap);
  }
}

async function saveProgress(s: EntityState): Promise<void> {
  if (!s.runId) return;
  try {
    await progressRun(s.runId, s.counts, s.report);
  } catch (err) {
    // Ein verlorener Zwischenstand ist kein Grund, bezahlte Arbeit abzubrechen;
    // finishRun schreibt am Ende ohnehin den vollständigen Stand.
    log.warn('scoring_journal_progress_failed', { runId: s.runId, message: describeError(err) });
  }
}

function spend(s: EntityState, cost: number, tokens: number): void {
  s.budget.spent += cost;
  s.counts.costUsd += cost;
  s.tokens += tokens;
}

/**
 * Verbucht einen gescheiterten, aber abgerechneten Aufruf (abgelehnt,
 * abgeschnitten) und liefert seinen Preis; 0 für Fehler ohne Antwort.
 */
function chargeFailed(s: EntityState, err: unknown): number {
  if (!(err instanceof LlmBilledError) || err.cost <= 0) return 0;
  spend(s, err.cost, err.usage ? err.usage.promptTokens + err.usage.completionTokens : 0);
  return err.cost;
}

/** Ein Chunk von der Modellantwort bis zum Schreiben. Liefert den Stopp-Grund der Batches. */
async function scoreChunk(s: EntityState, chunk: Item[], groups: string[][]): Promise<string | null> {
  const { adapter, opts } = s;
  const scratch: ChunkScratch = { collected: new Map(), failures: new Map(), isolate: [] };

  const main = await modelPass(s, chunk, groups, scratch);
  let stoppedReason = main.stoppedReason;
  if (s.fatalError === null && scratch.isolate.length > 0) {
    const singles = await modelPass(s, scratch.isolate, [], scratch, true);
    stoppedReason ??= singles.stoppedReason;
  }
  if (s.fatalError !== null) throw s.fatalError;
  throwIfAborted(opts.abortSignal);

  let rows: Working[] = chunk.flatMap((item) => {
    const hit = scratch.collected.get(item.id);
    if (!hit) return [];
    const raw = adapter.textsOf(hit.result);
    const texts = Object.fromEntries(TEXT_FIELDS.map((f) => [f, sanitizeText(raw[f] ?? '')])) as Record<
      TextField,
      string
    >;
    return [
      { item, result: hit.result, texts, rawHaiku: raw.haiku, haiku: null, haikuAttempts: 0, cost: hit.cost, lektoratFields: [] },
    ];
  });

  if (adapter.requiresHaiku && rows.length > 0) {
    await mapPool(rows, inFlight(s, rows.length), (row) => settleHaiku(s, row));
    throwIfAborted(opts.abortSignal);
  }

  const entity = adapter.entity;
  const audit = (list: Working[]): AuditFinding[] => {
    const auditItems = list.map((r) => ({ id: r.item.id, texts: r.texts }));
    return [
      ...auditItems.flatMap((a) => auditItem(a, { entity })),
      ...auditBatch(oneOfEachGroup(auditItems, groups), { entity }),
    ];
  };

  if (rows.length > 0) {
    const before = audit(rows);
    addCounts(s.report.audit_before, countFindings(before));
    const failed = await runLektorat(s, rows, before);
    if (failed.size > 0) {
      for (const [id, reason] of failed) scratch.failures.set(id, `Lektorat gescheitert: ${reason}`);
      if (opts.write) await adapter.markFailed([...failed.keys()]);
      rows = rows.filter((r) => !failed.has(r.item.id));
    }
    throwIfAborted(opts.abortSignal);
  }

  if (rows.length > 0) {
    const after = audit(rows);
    addCounts(s.report.audit_after, countFindings(after));
    const titleOf = new Map(rows.map((r) => [r.item.id, r.item.title]));
    for (const f of after) {
      s.report.lektorat_flags.push({ id: f.id, title: titleOf.get(f.id) ?? '', field: f.field, code: f.code, detail: f.detail });
    }
    s.counts.lektoratFlags += after.length;

    // Ein Leck (Variablenname, Eingabe-Flag) bleibt nicht stehen: der Text
    // begründet dann aus den Metadaten statt aus dem Inhalt. Der Eintrag
    // bleibt offen und wird beim nächsten Lauf neu bewertet.
    const leaking = new Set(after.filter((f) => f.code === 'leak').map((f) => f.id));
    if (leaking.size > 0) {
      for (const id of leaking) scratch.failures.set(id, 'Metadaten im Text (leak), auch nach dem Lektorat');
      if (opts.write) await adapter.markFailed([...leaking]);
      rows = rows.filter((r) => !leaking.has(r.item.id));
    }
  }

  rememberChunk(s.memory, rows.map((r) => r.texts));

  for (const r of rows) {
    for (const field of TEXT_FIELDS) {
      const fixed = replaceEmDashesFallback(r.texts[field]);
      if (fixed !== r.texts[field]) {
        log.warn('scoring_em_dash_fallback', { entity, id: r.item.id, field });
        r.texts[field] = fixed;
      }
    }
  }

  const finals = rows.map((r) => adapter.withTexts(r.result, r.texts));
  const scores = rows.length > 0 ? await adapter.scores(finals) : [];

  let written = new Set<string>();
  if (opts.write && rows.length > 0) {
    throwIfAborted(opts.abortSignal);
    const pitchRevised = new Set(rows.filter((r) => r.lektoratFields.includes('pitch_suggestion')).map((r) => r.item.id));
    written = new Set(
      await adapter.write(
        rows.map((r, i) => ({ item: r.item, result: finals[i], haiku: r.haiku, cost: round4(r.cost) })),
        { modelTag: s.modelTag, force: forceOf(opts), pitchRevised },
      ),
    );
    // Inzwischen anderweitig bewertet (In-Chat, zweiter Knopf): der
    // Überschreibschutz im WHERE hat gegriffen.
    const guarded = rows.length - written.size;
    if (guarded > 0) {
      s.counts.skipped += guarded;
      log.info('scoring_rows_already_scored', { entity, guarded });
    }
  }
  const counted = opts.write ? written : new Set(rows.map((r) => r.item.id));
  s.counts.scored += counted.size;

  rows.forEach((r, i) => {
    if (counted.has(r.item.id)) s.report.scores.push(round4(scores[i]));
    s.outcomes.push({
      id: r.item.id,
      title: r.item.title,
      result: finals[i],
      haiku: r.haiku,
      haikuAttempts: r.haikuAttempts,
      lektoratFields: r.lektoratFields,
      score: scores[i],
      cost: round4(r.cost),
      written: written.has(r.item.id),
    });
  });

  const titleOf = new Map(chunk.map((item) => [item.id, item.title]));
  for (const [id, reason] of scratch.failures) {
    s.counts.failed++;
    s.report.failed_items.push({ id, title: titleOf.get(id) ?? '', reason });
  }

  opts.hooks?.onChunkWritten?.({ entity, written: counted.size, total: s.counts.candidates });
  return stoppedReason;
}

/**
 * Ein Durchgang Modellaufrufe über `items` (der ganze Chunk, oder die
 * Einzelaufrufe abgelehnter Batches). Sammelt brauchbare Bewertungen und
 * Fehlgründe in `scratch`; ein fataler Fehler landet in `s.fatalError`.
 */
async function modelPass(
  s: EntityState,
  items: Item[],
  groups: string[][],
  scratch: ChunkScratch,
  singles = false,
): Promise<{ stoppedReason: string | null }> {
  const { adapter, opts, call } = s;
  const size = singles ? 1 : (opts.batchSize ?? SCORING_DEFAULTS.batchSize);
  const hooks = opts.hooks;

  const result = await runLLMBatch<Item, unknown>({
    items,
    apiKey: call.apiKey,
    model: call.model,
    batchSize: size,
    concurrency: inFlight(s, items.length),
    // Kein Abstand zwischen Batches: die Höflichkeitspause war für OpenRouter,
    // das Anthropic-SDK wiederholt 429/5xx selbst.
    batchDelayMs: 0,
    partition: (list) => partitionKeepingGroups(list, size, groups),
    abortSignal: opts.abortSignal,
    shouldStop: () => (s.budget.spent >= s.budget.cap ? 'cost_cap' : null),
    isFatal: (err, batch) => isFatalForRun(s, err, batch),
    analyze: (batch) => timedAnalyze(s, batch, groups),
    applyResults: async (batch, results, { cost }) => collect(s, batch, results, cost, scratch),
    markFailed: async (batch) => {
      if (opts.write) await adapter.markFailed(batch.map((b) => b.id));
    },
    hooks: {
      // Fortschritt nur im ersten Durchgang; die Einzelaufrufe sind Nacharbeit
      // an Einträgen, die der Fortschritt schon gezählt hat.
      onBatchStart: singles
        ? undefined
        : (b) =>
            hooks?.onBatchStart?.({
              batch: b.batch,
              processed: s.settled.size,
              successful: s.succeeded.size,
              failed: s.settled.size - s.succeeded.size,
              total: s.counts.candidates,
              batchIndex: ++s.batchesStarted,
              totalBatches: s.totalBatches,
              tokensUsed: s.tokens,
              cost: s.counts.costUsd,
            }),
      onError: (e) => {
        s.lastError = e.error;
        if (e.fatal) s.fatalError = e.error;
        const reason = describeError(e.error);
        for (const item of e.batch) {
          scratch.failures.set(item.id, reason);
          s.settled.add(item.id);
        }
        if (!e.fatal && e.error instanceof LlmRefusalError && e.batch.length > 1) scratch.isolate.push(...e.batch);
        hooks?.onError?.({ ...e, batchStartIndex: s.position.get(e.batch[0]?.id ?? '') ?? e.batchStartIndex });
      },
    },
  });
  return { stoppedReason: result.stoppedReason };
}

/**
 * Wie viele Modellaufrufe gleichzeitig laufen dürfen. Direkt: die eingestellte
 * Parallelität. Über die Batch-API: alle (`all` ist eine obere Schranke), damit
 * sie in derselben Batch-Anfrage landen; dort wartet nur eine Promise je Aufruf.
 */
function inFlight(s: EntityState, all: number): number {
  return s.call.batch ? Math.max(1, all) : (s.opts.concurrency ?? SCORING_DEFAULTS.concurrency);
}

function isFatalForRun(s: EntityState, err: unknown, batch: Item[]): boolean {
  if (isFatalLlmError(messageOf(err))) return true;
  if (err instanceof LlmMaxTokensError) return ++s.maxTokensStreak >= MAX_TOKENS_LIMIT;
  // Ein abgelehnter Batch mit mehreren Einträgen wird zerlegt (onError), erst
  // abgelehnte Einzelaufrufe zählen.
  if (err instanceof LlmRefusalError && batch.length === 1) return ++s.refusedSingles >= REFUSAL_LIMIT;
  return false;
}

async function timedAnalyze(s: EntityState, batch: Item[], groups: string[][]) {
  const index = ++s.batchCounter;
  const t0 = Date.now();
  try {
    const r = await s.adapter.analyze(batch, s.call, { twins: twinPositions(batch, groups) });
    spend(s, r.cost, r.tokensUsed);
    s.maxTokensStreak = 0;
    s.report.batches.push({ index, size: batch.length, tokens: r.tokensUsed, cost: round4(r.cost), durationMs: Date.now() - t0 });
    return r;
  } catch (err) {
    const cost = chargeFailed(s, err);
    const tokens = err instanceof LlmBilledError && err.usage ? err.usage.promptTokens + err.usage.completionTokens : 0;
    s.report.batches.push({ index, size: batch.length, tokens, cost: round4(cost), durationMs: Date.now() - t0, error: describeError(err) });
    throw err;
  }
}

/** Ordnet die Antworten eines Batches zu und behält die brauchbaren. */
function collect(s: EntityState, batch: Item[], results: unknown[], cost: number, scratch: ChunkScratch): number {
  const { pairs, via } = pairResults(batch, results, (r) => s.adapter.resultIndex(r));
  if (via !== 'index') {
    log.warn('scoring_pairing_fallback', { entity: s.adapter.entity, via, batch: batch.length, results: results.length });
  }
  const share = pairs.length > 0 ? cost / pairs.length : 0;
  const paired = new Set(pairs.map((p) => p.item.id));
  for (const item of batch) {
    s.settled.add(item.id);
    if (!paired.has(item.id)) scratch.failures.set(item.id, 'keine Bewertung in der Modellantwort');
  }
  let ok = 0;
  for (const { item, result } of pairs) {
    const problems = s.adapter.problemsOf(result);
    if (problems.length > 0) {
      scratch.failures.set(item.id, `unbrauchbare Bewertung: ${problems.join('; ')}`);
      continue;
    }
    scratch.collected.set(item.id, { item, result, cost: share });
    scratch.failures.delete(item.id);
    s.succeeded.add(item.id);
    ok++;
  }
  return ok;
}

/** Prüft das Haiku eines Datensatzes und fordert bei Bedarf bis zu HAIKU_RETRIES neue an. */
async function settleHaiku(s: EntityState, row: Working): Promise<void> {
  let haiku = sanitizeText(joinHaikuLines(row.rawHaiku ?? ''));
  let check = checkHaiku(haiku);
  let lastIssue = check.issues[0]?.message ?? '';
  let attempts = 1;
  let fresh = true;
  const previous: HaikuAttempt[] = [];
  s.report.haiku_stats.checked++;
  if (check.ok) s.report.haiku_stats.first_try_ok++;

  while (!check.ok && attempts <= HAIKU_RETRIES) {
    if (fresh && haiku) previous.push({ haiku, issues: check.issues.map((i) => i.message) });
    attempts++;
    try {
      throwIfAborted(s.opts.abortSignal);
      const r = await requestHaiku({ title: row.item.title, content: s.adapter.contentOf(row.item), previous, call: s.call });
      spend(s, r.cost, r.tokensUsed);
      row.cost += r.cost;
      haiku = sanitizeText(joinHaikuLines(r.haiku));
      check = checkHaiku(haiku);
      lastIssue = check.issues[0]?.message ?? lastIssue;
      fresh = true;
    } catch (err) {
      // Guthaben, Auth und Abbruch beenden den Lauf; alles andere kostet nur
      // diesen Versuch.
      if (isFatalLlmError(messageOf(err)) || errorClassFor(err) === 'aborted') throw err;
      row.cost += chargeFailed(s, err);
      lastIssue = `Nachforderung gescheitert: ${describeError(err)}`;
      fresh = false;
    }
  }

  row.haikuAttempts = attempts;
  if (check.ok) {
    row.haiku = haiku;
    if (attempts > 1) s.report.haiku_stats.retried_ok++;
    return;
  }
  row.haiku = null;
  s.counts.haikuRejected++;
  s.report.haiku_rejected.push({ id: row.item.id, title: row.item.title, attempts, last_issue: lastIssue });
}

/**
 * Lektorat des Chunks. Liefert die Einträge, deren Lektorat scheiterte, mit
 * Grund (leer bei Erfolg); sie werden nicht geschrieben, denn die Texte sind
 * das, was die Redaktion liest.
 *
 * Ein abgeschnittener Aufruf (max_tokens: mit Effort max hat das Denken das
 * ganze Budget gebraucht) wird nicht identisch wiederholt, sondern halbiert:
 * zwei kleinere Aufrufe kommen eher durch, und ein zu großer Chunk blockiert
 * nicht jede Nacht dieselben bezahlten Bewertungen. Ein einzelner Eintrag und
 * jeder andere vorübergehende Fehler bekommen einen zweiten Versuch. Was ein
 * gescheiterter Aufruf gekostet hat, zählt mit.
 */
async function runLektorat(s: EntityState, rows: Working[], findings: AuditFinding[]): Promise<Map<string, string>> {
  const failed = new Map<string, string>();
  const entity = s.adapter.entity;
  const charge = (part: Working[], cost: number) => {
    for (const r of part) r.cost += cost / part.length;
  };

  const run = async (part: Working[]): Promise<void> => {
    const items = part.map((r) => ({ id: r.item.id, title: r.item.title, content: s.adapter.contentOf(r.item), texts: r.texts }));
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await lektorat({ entity, items, findings, memory: s.memory, call: s.call });
        spend(s, res.cost, res.tokensUsed);
        charge(part, res.cost);
        for (const change of res.changes) {
          const row = part.find((r) => r.item.id === change.id);
          if (!row) continue;
          const fields = TEXT_FIELDS.filter((f) => change.texts[f] !== undefined);
          for (const f of fields) row.texts[f] = change.texts[f] as string;
          row.lektoratFields = fields;
          s.report.lektorat_changes.push({ id: change.id, fields });
          s.counts.lektoratChanges++;
        }
        for (const r of res.rejected) {
          log.warn('scoring_lektorat_change_rejected', { entity, ...r });
        }
        return;
      } catch (err) {
        if (isFatalLlmError(messageOf(err)) || errorClassFor(err) === 'aborted') throw err;
        charge(part, chargeFailed(s, err));
        s.lastError = err;
        log.warn('scoring_lektorat_failed', { entity, attempt, size: part.length, message: describeError(err) });
        if (err instanceof LlmMaxTokensError && part.length > 1) {
          // Beide Hälften gleichzeitig: über die Batch-API landen sie so in
          // einer Runde statt in zweien.
          const mid = Math.ceil(part.length / 2);
          await Promise.all([run(part.slice(0, mid)), run(part.slice(mid))]);
          return;
        }
        if (attempt >= 2) {
          for (const r of part) failed.set(r.item.id, describeError(err));
          return;
        }
      }
    }
  };

  await run(rows);
  return failed;
}
