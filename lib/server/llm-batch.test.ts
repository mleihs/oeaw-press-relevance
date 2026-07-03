import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runLLMBatch,
  preflightBalance,
  type RunLLMBatchOptions,
} from './llm-batch';
import { checkKeyBalance } from '@/lib/server/openrouter';

vi.mock('@/lib/server/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

// Keep the REAL isFatalLlmError (the runLLMBatch error-classification tests
// depend on it); stub only the network-touching checkKeyBalance.
vi.mock('@/lib/server/openrouter', async (orig) => ({
  ...(await orig<typeof import('@/lib/server/openrouter')>()),
  checkKeyBalance: vi.fn(),
}));

const mockBalance = vi.mocked(checkKeyBalance);

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

describe('preflightBalance', () => {
  // A fully-funded key (the common happy case).
  const HEALTHY = {
    limitRemaining: 10,
    usage: 1,
    limit: 20,
    accountBalance: 8,
    effectiveBudget: 8,
  };

  type Ev = { type: string; data: Record<string, unknown> };
  function collectEvents() {
    const events: Ev[] = [];
    const emit = vi.fn((type: string, data: unknown) => {
      events.push({ type, data: data as Record<string, unknown> });
    });
    return { events, emit };
  }
  const ofType = (events: Ev[], type: string) =>
    events.filter((e) => e.type === type);

  beforeEach(() => vi.clearAllMocks());

  it('emits a single init frame and returns true when funded', async () => {
    mockBalance.mockResolvedValue(HEALTHY);
    const { events, emit } = collectEvents();

    const ok = await preflightBalance({
      apiKey: 'abcdefghijklmnop',
      total: 7,
      model: 'deepseek/deepseek-chat',
      emit,
    });

    expect(ok).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['init']);
    expect(ofType(events, 'init')[0].data).toEqual({
      total: 7,
      model: 'deepseek/deepseek-chat',
      api_key_hint: '...ijklmnop',
      key_balance: HEALTHY,
    });
  });

  it('masks a short key as *** in the init frame', async () => {
    mockBalance.mockResolvedValue(HEALTHY);
    const { events, emit } = collectEvents();
    await preflightBalance({ apiKey: 'short', total: 1, model: 'm', emit });
    expect(ofType(events, 'init')[0].data.api_key_hint).toBe('***');
  });

  it('on an exhausted budget emits fatal error + zero complete and returns false', async () => {
    mockBalance.mockResolvedValue({
      limitRemaining: 0.002,
      usage: 5,
      limit: 5,
      accountBalance: 0.001,
      effectiveBudget: 0.001,
    });
    const { events, emit } = collectEvents();

    const ok = await preflightBalance({
      apiKey: 'abcdefghijklmnop',
      total: 4,
      model: 'm',
      emit,
    });

    expect(ok).toBe(false);
    // The exact frame order the analysis/event modals consume.
    expect(events.map((e) => e.type)).toEqual(['init', 'error', 'complete']);

    const err = ofType(events, 'error')[0].data;
    expect(err.fatal).toBe(true);
    expect(err.message).toBe(
      'OpenRouter-Budget aufgebraucht: $0.0010 verfügbar ' +
        '(Key-Limit: $0.0020 verbleibend, Account-Guthaben: $0.0010). ' +
        'Bitte Credits aufladen auf openrouter.ai/settings/credits.',
    );

    expect(ofType(events, 'complete')[0].data).toEqual({
      processed: 0,
      total: 4,
      successful: 0,
      failed: 4,
      tokens_used: 0,
      cost: 0,
    });
  });

  it('omits an absent figure from the budget-exhausted detail', async () => {
    // Only the key-limit is known (account balance unavailable) -> a single
    // parenthetical part. With NEITHER known the parenthetical disappears
    // entirely, which is exactly the legacy event-runner message.
    mockBalance.mockResolvedValue({
      limitRemaining: 0.005,
      usage: 0,
      limit: 1,
      accountBalance: null,
      effectiveBudget: 0.005,
    });
    const { events, emit } = collectEvents();

    await preflightBalance({ apiKey: 'k', total: 2, model: 'm', emit });

    expect(ofType(events, 'error')[0].data.message).toBe(
      'OpenRouter-Budget aufgebraucht: $0.0050 verfügbar ' +
        '(Key-Limit: $0.0050 verbleibend). ' +
        'Bitte Credits aufladen auf openrouter.ai/settings/credits.',
    );
  });

  it('proceeds (returns true) when the budget is unknown (all null)', async () => {
    // checkKeyBalance's fallback: no budget data at all. We can't prove
    // exhaustion, so the run is allowed to start (only 'init' fires).
    mockBalance.mockResolvedValue({
      limitRemaining: null,
      usage: 0,
      limit: null,
      accountBalance: null,
      effectiveBudget: null,
    });
    const { events, emit } = collectEvents();

    const ok = await preflightBalance({ apiKey: 'k', total: 3, model: 'm', emit });

    expect(ok).toBe(true);
    expect(events.map((e) => e.type)).toEqual(['init']);
  });
});
