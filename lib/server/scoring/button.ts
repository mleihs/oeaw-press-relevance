// Der Bewerten-Knopf: ein Lauf des Bewertungskerns für EINE Entität, mit
// SSE-Frames für das Modal (components/scoring-modal.tsx). Kern, Gates,
// Journal und Kostendeckel sind dieselben wie nachts; anders sind nur der
// Auslöser (`button`), der Umfang (Auswahl oder Kandidaten) und das Protokoll.
// Rein: kennt weder Request noch Stream, nur `emit` (Route:
// lib/server/scoring-route.ts).
//
// Frames, Namen und Felder wie vor dem Kern, ergänzt um das Neue:
//   init       Kandidaten geladen: total, model, effort
//   progress   vor jedem Batch: processed, total, current_title, batch_index, …
//   error      je gescheitertem Batch (fatal: true beendet den Lauf); am Ende
//              noch einmal fatal, wenn der Lauf `failed` endet
//   skipped    nichts zu tun: kein Kandidat (reason no_candidates) oder ein
//              anderer Lauf hält den Lock (reason lock_busy); kein complete
//   cancelled  Abbruch durch den Client; kein complete
//   complete   Bilanz samt verworfenen Haikus, Lektorat-Hinweisen, Deckel

import { DEFAULT_LLM_MODEL } from '@/lib/shared/constants';
import { describeError } from '@/lib/server/ingest/describe-error';
import { SCORING_ADAPTERS } from './adapters';
import { runScoring } from './run';
import type { AnyScoringAdapter, EntityRunResult, ScoringEntity, ScoringHooks } from './types';

export type SseEmit = (type: string, data: unknown) => void;

export interface ButtonRun {
  entity: ScoringEntity;
  /** Einzel-/Auswahl-Bewertung: genau diese Einträge, sofern sie die Gates passieren. */
  ids?: string[];
  force: boolean;
  limit: number;
  batchSize: number;
  concurrency: number;
  costCapUsd: number;
  abortSignal: AbortSignal;
  emit: SseEmit;
}

/** Die Batch-Hooks des Kerns als SSE-Frames, mit den Feldnamen, die das Modal liest. */
function sseHooks(emit: SseEmit, costCapUsd: number, onFatal: () => void): ScoringHooks {
  return {
    onCandidates: (p) => {
      if (p.total > 0) {
        emit('init', { total: p.total, model: DEFAULT_LLM_MODEL, effort: 'max', cost_cap_usd: costCapUsd });
      }
    },
    onBatchStart: (p) =>
      emit('progress', {
        processed: p.processed,
        total: p.total,
        current_title: p.batch[0]?.title ?? '',
        batch_index: p.batchIndex,
        total_batches: p.totalBatches,
        tokens_used: p.tokensUsed,
        cost: p.cost,
      }),
    onError: (e) => {
      if (e.fatal) onFatal();
      emit('error', { message: e.message, batch_start: e.batchStartIndex, fatal: e.fatal });
    },
    onCancelled: (p) => emit('cancelled', { processed: p.processed, successful: p.successful, total: p.total }),
  };
}

/** Die abschließenden Frames eines Laufs; leer, wenn `cancelled` schon alles gesagt hat. */
export function finalFrames(run: EntityRunResult, fatalSent: boolean): Array<[string, unknown]> {
  const { counts } = run;
  if (run.errorClass === 'lock_busy') {
    return [['skipped', { reason: 'lock_busy', message: 'Es läuft bereits eine Bewertung (Nacht, Knopf oder CLI).' }]];
  }
  if (counts.candidates === 0) {
    return [['skipped', { reason: 'no_candidates', skipped: counts.skipped }]];
  }
  // Abbruch: das Frame `cancelled` kam schon aus onCancelled.
  if (run.errorClass === 'aborted') return [];

  const frames: Array<[string, unknown]> = [];
  if (run.status === 'failed' && !fatalSent) {
    frames.push(['error', { message: run.errorMessage ?? run.summary, fatal: true }]);
  }
  frames.push([
    'complete',
    {
      processed: counts.scored + counts.failed,
      total: counts.candidates,
      successful: counts.scored,
      failed: counts.failed,
      tokens_used: run.tokensUsed,
      cost: counts.costUsd,
      status: run.status,
      summary: run.summary,
      ...(counts.skipped ? { skipped: counts.skipped } : {}),
      // Nur gesetzt, wenn es welche gab; sonst stünde im Modal eine stumme Null.
      ...(counts.haikuRejected ? { haiku_rejected: counts.haikuRejected } : {}),
      ...(counts.lektoratFlags ? { lektorat_flags: counts.lektoratFlags } : {}),
      ...(counts.lektoratChanges ? { lektorat_changes: counts.lektoratChanges } : {}),
      ...(counts.costCapHit ? { cost_cap_hit: true, cost_cap_usd: counts.costCapUsd } : {}),
    },
  ]);
  return frames;
}

/**
 * Ein Knopf-Lauf. Wirft nicht: was vor dem Kern scheitert (ein Gate, das die
 * Route nicht schon geprüft hat), geht als fatales error-Frame hinaus.
 */
export async function runScoringButton(
  run: ButtonRun,
  adapters: readonly AnyScoringAdapter[] = SCORING_ADAPTERS,
): Promise<void> {
  const { entity, emit } = run;
  let fatalSent = false;
  let result: EntityRunResult | undefined;
  try {
    const out = await runScoring(
      {
        entities: [entity],
        trigger: 'button',
        model: DEFAULT_LLM_MODEL,
        write: true,
        force: run.force,
        ids: run.ids,
        limit: { [entity]: run.limit },
        batchSize: run.batchSize,
        concurrency: run.concurrency,
        // Am Knopf wartet jemand: direkt, nicht über die Batch-API.
        transport: 'direct',
        costCapUsd: run.costCapUsd,
        abortSignal: run.abortSignal,
        hooks: sseHooks(emit, run.costCapUsd, () => {
          fatalSent = true;
        }),
      },
      adapters,
    );
    result = out[entity];
  } catch (err) {
    emit('error', { message: describeError(err), fatal: true });
    return;
  }
  if (!result) return;
  for (const [type, data] of finalFrames(result, fatalSent)) emit(type, data);
}
