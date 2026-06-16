import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runLLMBatch, type RunLLMBatchOptions } from './llm-batch';

vi.mock('@/lib/server/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

interface Item { id: string }
interface Res { ok: boolean }

const items = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `i${i}` }));

// Base options: analyze echoes one result per item, applyResults writes all,
// near-zero delay so tests are fast.
function baseOpts(
  overrides: Partial<RunLLMBatchOptions<Item, Res>> = {},
): RunLLMBatchOptions<Item, Res> {
  return {
    items: items(5),
    apiKey: 'k',
    model: 'm',
    batchSize: 2,
    batchDelayMs: 0,
    analyze: vi.fn(async (batch: Item[]) => ({
      results: batch.map(() => ({ ok: true })),
      tokensUsed: 10,
      cost: 0.01,
    })),
    applyResults: vi.fn(async (batch: Item[], results: Res[]) => results.length),
    markFailed: vi.fn(async () => {}),
    ...overrides,
  };
}

describe('runLLMBatch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('processes every batch and tallies success + tokens + cost', async () => {
    const opts = baseOpts();
    const r = await runLLMBatch(opts);
    expect(r).toMatchObject({ processed: 5, successful: 5, failed: 0, total: 5, cancelled: false });
    expect(r.tokensUsed).toBe(30); // 3 batches × 10
    expect(r.cost).toBeCloseTo(0.03, 10);
    expect((opts.analyze as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3); // 2+2+1
    expect((opts.markFailed as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('counts items without a usable result as failed (rows left untouched)', async () => {
    // applyResults writes only 1 of each 2-item batch.
    const opts = baseOpts({ applyResults: vi.fn(async () => 1) });
    const r = await runLLMBatch(opts);
    // batches: [2]->1ok+1fail, [2]->1ok+1fail, [1]->1ok+0fail
    expect(r.successful).toBe(3);
    expect(r.failed).toBe(2);
    expect(r.processed).toBe(5);
  });

  it('marks a batch failed and continues on a non-fatal error', async () => {
    let call = 0;
    const opts = baseOpts({
      analyze: vi.fn(async (batch: Item[]) => {
        call++;
        if (call === 1) throw new Error('OpenRouter API error 500: upstream timeout');
        return { results: batch.map(() => ({ ok: true })), tokensUsed: 10, cost: 0.01 };
      }),
    });
    const onError = vi.fn();
    const r = await runLLMBatch({ ...opts, hooks: { onError } });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ fatal: false }));
    expect((opts.markFailed as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect(r.failed).toBe(2); // the first batch
    expect(r.successful).toBe(3); // the other two batches kept going
    expect(r.cancelled).toBe(false);
  });

  it('stops the whole run on a fatal billing/auth error', async () => {
    const opts = baseOpts({
      analyze: vi.fn(async () => {
        throw new Error('OpenRouter API error 402: can only afford 0, not enough credits');
      }),
    });
    const onError = vi.fn();
    const r = await runLLMBatch({ ...opts, hooks: { onError } });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ fatal: true }));
    // First batch fails, loop breaks → analyze called exactly once.
    expect((opts.analyze as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect(r.failed).toBe(2);
    expect(r.successful).toBe(0);
  });

  it('cancels before any work when the signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    const opts = baseOpts({ abortSignal: ac.signal });
    const onCancelled = vi.fn();
    const r = await runLLMBatch({ ...opts, hooks: { onCancelled } });
    expect(r.cancelled).toBe(true);
    expect(onCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ processed: 0, successful: 0, failed: 0, total: 5 }),
    );
    expect((opts.analyze as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('aborts mid-run and reports the partial tally', async () => {
    const ac = new AbortController();
    // Abort during the first batch's analyze → second batch sees it and cancels.
    const opts = baseOpts({
      analyze: vi.fn(async (batch: Item[]) => {
        ac.abort();
        return { results: batch.map(() => ({ ok: true })), tokensUsed: 10, cost: 0.01 };
      }),
      abortSignal: ac.signal,
    });
    const r = await runLLMBatch(opts);
    expect(r.cancelled).toBe(true);
    expect(r.successful).toBe(2); // only the first batch completed
    expect((opts.analyze as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('fires onBatchStart with the running counters before each batch', async () => {
    const onBatchStart = vi.fn();
    const opts = baseOpts();
    await runLLMBatch({ ...opts, hooks: { onBatchStart } });
    expect(onBatchStart).toHaveBeenCalledTimes(3);
    expect(onBatchStart.mock.calls[0][0]).toMatchObject({ processed: 0, batchIndex: 1, totalBatches: 3, total: 5 });
    expect(onBatchStart.mock.calls[1][0]).toMatchObject({ processed: 2, batchIndex: 2 });
    expect(onBatchStart.mock.calls[2][0]).toMatchObject({ processed: 4, batchIndex: 3 });
  });
});
