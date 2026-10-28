// Anthropic-Batch-Transport (Message Batches API): derselbe Aufruf wie
// messagesJson (lib/server/anthropic.ts), nur asynchron und zum halben Preis.
// Gedacht für die Nachtbewertung und das CLI, wo niemand auf die Antwort
// wartet. Bei Opus mit Effort max sind fast alle Tokens Ausgabe (Denken),
// und die Hälfte davon spart die Batch-API ohne jeden Unterschied im Ergebnis:
// gleiches Modell, gleiche Parameter.
//
// Ein MessageBatcher sammelt, was der Bewertungskern in einer Phase gleichzeitig
// anfragt (die Bewertungen eines Chunks, eine Runde Haiku-Nachforderungen, das
// Lektorat), und schickt es als EINE Batch-Anfrage. Jede Promise löst mit genau
// dem auf, was messagesJson geliefert hätte, oder wirft denselben Fehler
// (Ablehnung, abgeschnitten, API-Fehler mit Status). Der Kern merkt davon nur
// die Wartezeit; Gates, Kostendeckel und das Zerlegen abgelehnter Batches
// bleiben, wie sie sind.
//
// Abgeschickt wird SETTLE_MS nach dem letzten neuen Aufruf: der Kern stellt die
// Aufrufe einer Phase im selben Takt (Worker-Pool, mapPool), sie landen also
// zusammen in einem Batch. Gewartet wird im Abstand von POLL_MS bis zur Frist
// des Laufs. Läuft sie ab, wird der Batch storniert; was bis dahin fertig war,
// ist bezahlt und wird noch abgeholt, der Rest scheitert mit MessageBatchError.
// Bei Abbruch (AbortSignal) wird storniert und sofort abgewiesen.

import Anthropic from '@anthropic-ai/sdk';
import { anthropicApiError, completionOf, messageParams, type MessagesJsonOptions } from '@/lib/server/anthropic';
import type { JsonCompletion } from '@/lib/server/llm-types';
import { log } from '@/lib/server/log';

/** Anthropic berechnet Aufrufe über die Batch-API zum halben Listenpreis. */
export const BATCH_PRICE_FACTOR = 0.5;

const SETTLE_MS = 1_000;
const POLL_MS = 30_000;
/** Nach dem Stornieren so lange auf `ended` warten, um Fertiges noch abzuholen. */
const CANCEL_GRACE_MS = 10 * 60_000;

/**
 * Ein Batch-Aufruf kam nicht zurück: Frist abgelaufen, storniert, von Anthropic
 * verworfen (`expired`) oder ohne Ergebnis. Fehlerklasse `transport`: die
 * Einträge bleiben offen und kommen im nächsten Lauf wieder.
 */
export class MessageBatchError extends Error {
  readonly errorClass = 'transport' as const;
  constructor(message: string) {
    super(message);
    this.name = 'MessageBatchError';
  }
}

/** Ein abgeschickter Batch, für den Laufbericht. */
export interface MessageBatchInfo {
  id: string;
  size: number;
  /** Vom Abschicken bis zum letzten Ergebnis, Warten eingeschlossen. */
  durationMs: number;
  succeeded: number;
  errored: number;
  /** Storniert, abgelaufen oder ohne Ergebnis. */
  missing: number;
}

type Batches = Anthropic['messages']['batches'];

/** Was der Batcher vom SDK braucht; Tests reichen eine Attrappe herein. */
export interface BatchClient {
  messages: { batches: Pick<Batches, 'create' | 'retrieve' | 'results' | 'cancel'> };
}

export interface MessageBatcherOptions {
  apiKey: string;
  /** Spätestens bis hierhin (ms seit Epoch) wird auf einen Batch gewartet. */
  deadline: number;
  signal?: AbortSignal;
  onBatch?: (info: MessageBatchInfo) => void;
  /** Nur für Tests: Takt und Client. */
  settleMs?: number;
  pollMs?: number;
  client?: BatchClient;
}

interface Pending {
  customId: string;
  params: Anthropic.MessageCreateParamsNonStreaming;
  resolve: (completion: JsonCompletion) => void;
  reject: (err: unknown) => void;
}

type Outcome = { value: JsonCompletion } | { error: unknown };

/** HTTP-Status je Fehlertyp, damit isFatalLlmError dieselbe Meldung sieht wie beim direkten Aufruf. */
const STATUS_BY_ERROR_TYPE: Record<string, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  billing_error: 402,
  permission_error: 403,
  not_found_error: 404,
  rate_limit_error: 429,
  api_error: 500,
  timeout_error: 504,
  overloaded_error: 529,
};

function requestError(error: Anthropic.Messages.MessageBatchErroredResult['error']): Error {
  const type = error.error?.type ?? 'error';
  return new Error(`Anthropic API error ${STATUS_BY_ERROR_TYPE[type] ?? '?'}: ${type}: ${error.error?.message ?? ''}`);
}

function abortError(): DOMException {
  return new DOMException('Bewertung abgebrochen', 'AbortError');
}

const isAbortError = (err: unknown): boolean => err instanceof DOMException && err.name === 'AbortError';

/** Ergebnis einer Anfrage im Batch: dasselbe, was messagesJson geliefert oder geworfen hätte. */
function outcomeOf(batchId: string, result: Anthropic.Messages.MessageBatchResult): Outcome {
  if (result.type === 'succeeded') {
    try {
      return { value: completionOf(result.message) };
    } catch (error) {
      return { error };
    }
  }
  if (result.type === 'errored') return { error: requestError(result.error) };
  return { error: new MessageBatchError(`Anthropic-Batch ${batchId}: Anfrage ${result.type}`) };
}

/** Wartet `ms`, endet bei Abbruch früher. */
function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
  });
}

/** 401, 403 und 404 beim Abfragen wiederholen sich nicht von selbst; alles andere schon. */
function isPermanent(err: unknown): boolean {
  return err instanceof Anthropic.APIError && [401, 403, 404].includes(err.status ?? 0);
}

export class MessageBatcher {
  private readonly client: BatchClient;
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;

  constructor(private readonly opts: MessageBatcherOptions) {
    this.client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
  }

  /** Ein Aufruf über die Batch-API: Optionen wie messagesJson, nur ohne Key. */
  request(opts: Omit<MessagesJsonOptions, 'apiKey'>): Promise<JsonCompletion> {
    const params = messageParams(opts);
    return new Promise<JsonCompletion>((resolve, reject) => {
      if (this.opts.signal?.aborted) return reject(abortError());
      this.queue.push({ customId: `r${++this.seq}`, params, resolve, reject });
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.flush(this.queue.splice(0));
      }, this.opts.settleMs ?? SETTLE_MS);
    });
  }

  /**
   * Schickt die gesammelten Aufrufe ab, wartet und verteilt die Ergebnisse.
   * Erst wenn alle eingesammelt sind und der Bericht (onBatch) steht, werden
   * die Promises erfüllt: der Kern findet den Batch dann schon im Bericht.
   */
  private async flush(requests: Pending[]): Promise<void> {
    if (requests.length === 0) return;
    const t0 = Date.now();
    const outcomes = new Map<string, Outcome>();
    let batchId: string | null = null;
    let failure: unknown = null;
    let succeeded = 0;
    let errored = 0;
    try {
      const batch = await this.client.messages.batches.create({
        requests: requests.map((r) => ({ custom_id: r.customId, params: r.params })),
      });
      batchId = batch.id;
      log.info('anthropic_batch_submitted', { batchId, size: requests.length });
      await this.waitUntilEnded(batch.id);
      const wanted = new Set(requests.map((r) => r.customId));
      for await (const entry of await this.client.messages.batches.results(batch.id)) {
        if (!wanted.has(entry.custom_id) || outcomes.has(entry.custom_id)) continue;
        outcomes.set(entry.custom_id, outcomeOf(batch.id, entry.result));
        if (entry.result.type === 'succeeded') succeeded++;
        else if (entry.result.type === 'errored') errored++;
      }
    } catch (err) {
      failure = err instanceof MessageBatchError || isAbortError(err) ? err : anthropicApiError(err);
    }

    if (batchId) {
      const info = { id: batchId, size: requests.length, durationMs: Date.now() - t0, succeeded, errored, missing: requests.length - succeeded - errored };
      log.info('anthropic_batch_finished', info);
      try {
        this.opts.onBatch?.(info);
      } catch (err) {
        log.warn('anthropic_batch_report_failed', { batchId, message: err instanceof Error ? err.message : String(err) });
      }
    }
    for (const r of requests) {
      const outcome = outcomes.get(r.customId);
      if (outcome && 'value' in outcome) r.resolve(outcome.value);
      else if (outcome) r.reject(outcome.error);
      else r.reject(failure ?? new MessageBatchError(`Anthropic-Batch ${batchId ?? 'ohne id'}: kein Ergebnis für ${r.customId}`));
    }
  }

  /**
   * Wartet, bis der Batch `ended` ist. Nach Ablauf der Frist wird storniert und
   * noch bis CANCEL_GRACE_MS gewartet, damit Fertiges abholbar bleibt; bei
   * Abbruch wird storniert und sofort geworfen.
   */
  private async waitUntilEnded(id: string): Promise<void> {
    const { signal, deadline } = this.opts;
    let canceled = false;
    for (;;) {
      try {
        const batch = await this.client.messages.batches.retrieve(id);
        if (batch.processing_status === 'ended') return;
      } catch (err) {
        if (isPermanent(err)) throw err;
        log.warn('anthropic_batch_poll_failed', { batchId: id, message: err instanceof Error ? err.message : String(err) });
      }
      if (signal?.aborted) {
        await this.cancelQuietly(id);
        throw abortError();
      }
      if (!canceled && Date.now() >= deadline) {
        canceled = true;
        log.warn('anthropic_batch_deadline', { batchId: id });
        await this.cancelQuietly(id);
      }
      if (canceled && Date.now() >= deadline + CANCEL_GRACE_MS) {
        throw new MessageBatchError(`Anthropic-Batch ${id}: Frist abgelaufen, storniert, nicht beendet`);
      }
      await pause(this.opts.pollMs ?? POLL_MS, signal);
    }
  }

  private async cancelQuietly(id: string): Promise<void> {
    try {
      await this.client.messages.batches.cancel(id);
    } catch (err) {
      log.warn('anthropic_batch_cancel_failed', { batchId: id, message: err instanceof Error ? err.message : String(err) });
    }
  }
}
