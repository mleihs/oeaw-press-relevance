import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityRunResult, RunOptions } from './types';

// Der Knopf-Wrapper ohne Kern: runScoring gemockt, geprüft wird nur, welche
// SSE-Frames aus Hooks und Ergebnis werden. Das Modal (components/scoring-modal.tsx)
// liest genau diese Namen und Felder.
const h = vi.hoisted(() => ({ runScoring: vi.fn() }));
vi.mock('./run', () => ({ runScoring: h.runScoring }));
vi.mock('./adapters', () => ({ SCORING_ADAPTERS: [] }));

const { finalFrames, runScoringButton } = await import('./button');

function result(over: Partial<EntityRunResult> = {}, counts: Partial<EntityRunResult['counts']> = {}): EntityRunResult {
  return {
    runId: 'run-1',
    status: 'ok',
    summary: '3 Kandidaten, 3 bewertet',
    alarm: false,
    counts: {
      candidates: 3,
      scored: 3,
      failed: 0,
      skipped: 0,
      haikuRejected: 0,
      lektoratFlags: 0,
      lektoratChanges: 0,
      costUsd: 0.42,
      costCapUsd: 25,
      costCapHit: false,
      ...counts,
    },
    tokensUsed: 1234,
    errorClass: null,
    errorMessage: null,
    report: {} as EntityRunResult['report'],
    outcomes: [],
    ...over,
  };
}

const run = (emit = vi.fn()) => ({
  entity: 'publications' as const,
  force: false,
  limit: 200,
  batchSize: 5,
  concurrency: 2,
  costCapUsd: 25,
  abortSignal: new AbortController().signal,
  emit,
});

beforeEach(() => vi.clearAllMocks());

describe('finalFrames', () => {
  it('meldet einen belegten Lock als skipped, ohne complete', () => {
    expect(finalFrames(result({ status: 'skipped', errorClass: 'lock_busy' }, { candidates: 0 }), false)).toEqual([
      ['skipped', { reason: 'lock_busy', message: expect.stringContaining('läuft bereits') }],
    ]);
  });

  it('meldet eine leere Kandidatenmenge als skipped samt aussortierten ids', () => {
    expect(finalFrames(result({ status: 'skipped' }, { candidates: 0, skipped: 1 }), false)).toEqual([
      ['skipped', { reason: 'no_candidates', skipped: 1 }],
    ]);
  });

  it('schweigt nach einem Abbruch (cancelled kam schon)', () => {
    expect(finalFrames(result({ status: 'partial', errorClass: 'aborted' }), false)).toEqual([]);
  });

  it('schließt mit complete und nennt Haikus, Lektorat und Deckel nur, wenn es sie gab', () => {
    const [[type, data]] = finalFrames(result(), false);
    expect(type).toBe('complete');
    expect(data).toEqual({
      processed: 3,
      total: 3,
      successful: 3,
      failed: 0,
      tokens_used: 1234,
      cost: 0.42,
      status: 'ok',
      summary: '3 Kandidaten, 3 bewertet',
    });
    const [, partial] = finalFrames(
      result({ status: 'partial', errorClass: 'cost_cap' }, { haikuRejected: 1, lektoratFlags: 2, lektoratChanges: 3, costCapHit: true, skipped: 1 }),
      false,
    )[0];
    expect(partial).toMatchObject({
      haiku_rejected: 1,
      lektorat_flags: 2,
      lektorat_changes: 3,
      cost_cap_hit: true,
      cost_cap_usd: 25,
      skipped: 1,
    });
  });

  it('schickt bei failed ein fatales error vor dem complete, außer es kam schon eines', () => {
    const failed = result({ status: 'failed', errorClass: 'refusal', errorMessage: 'abgelehnt' }, { scored: 0, failed: 3 });
    expect(finalFrames(failed, false).map(([t]) => t)).toEqual(['error', 'complete']);
    expect(finalFrames(failed, false)[0][1]).toEqual({ message: 'abgelehnt', fatal: true });
    expect(finalFrames(failed, true).map(([t]) => t)).toEqual(['complete']);
  });
});

describe('runScoringButton', () => {
  it('startet den Kern als Knopf-Lauf mit dem Bewertungsmodell und übersetzt die Hooks', async () => {
    const emit = vi.fn();
    h.runScoring.mockImplementation(async (opts: RunOptions) => {
      opts.hooks?.onCandidates?.({ entity: 'publications', total: 3, skipped: 0 });
      opts.hooks?.onBatchStart?.({
        batch: [{ id: 'a', title: 'Titel A' }],
        processed: 0,
        successful: 0,
        failed: 0,
        total: 3,
        batchIndex: 1,
        totalBatches: 1,
        tokensUsed: 0,
        cost: 0,
      });
      return { publications: result() };
    });
    await runScoringButton(run(emit));

    const opts = h.runScoring.mock.calls[0][0] as RunOptions;
    expect(opts).toMatchObject({
      entities: ['publications'],
      trigger: 'button',
      model: 'anthropic/claude-opus-5.5',
      write: true,
      limit: { publications: 200 },
      batchSize: 5,
      concurrency: 2,
      costCapUsd: 25,
    });
    expect(emit.mock.calls.map(([t]) => t)).toEqual(['init', 'progress', 'complete']);
    expect(emit.mock.calls[0][1]).toEqual({ total: 3, model: 'anthropic/claude-opus-5.5', effort: 'max', cost_cap_usd: 25 });
    expect(emit.mock.calls[1][1]).toMatchObject({ current_title: 'Titel A', batch_index: 1, total_batches: 1 });
  });

  it('meldet einen fatalen Batch-Fehler nur einmal', async () => {
    const emit = vi.fn();
    h.runScoring.mockImplementation(async (opts: RunOptions) => {
      opts.hooks?.onError?.({ message: 'Guthaben leer', fatal: true, batchStartIndex: 0, batch: [], error: new Error('x') });
      return { publications: result({ status: 'failed', errorClass: 'credits', errorMessage: 'Guthaben leer' }, { scored: 0, failed: 3 }) };
    });
    await runScoringButton(run(emit));
    expect(emit.mock.calls.filter(([t, d]) => t === 'error' && (d as { fatal: boolean }).fatal)).toHaveLength(1);
  });

  it('wirft nicht: was vor dem Kern scheitert, wird ein fatales error-Frame', async () => {
    const emit = vi.fn();
    h.runScoring.mockRejectedValue(Object.assign(new Error('ANTHROPIC_EFFORT=high'), { errorClass: 'effort_gate' }));
    await expect(runScoringButton(run(emit))).resolves.toBeUndefined();
    expect(emit).toHaveBeenCalledWith('error', { message: expect.stringContaining('ANTHROPIC_EFFORT=high'), fatal: true });
  });
});
