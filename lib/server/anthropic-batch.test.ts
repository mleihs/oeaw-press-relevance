import { describe, it, expect, vi } from 'vitest';
import { isFatalLlmError } from './llm-client';
import { LlmMaxTokensError, LlmRefusalError } from './llm-types';
import { MessageBatcher, MessageBatchError, type BatchClient, type MessageBatchInfo } from './anthropic-batch';

vi.mock('@/lib/server/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Geprüft wird, was der Batcher hinschickt und wie er Ergebnisse auf die
// wartenden Aufrufe verteilt; das SDK ist eine Attrappe mit Ergebnisliste.
type Entry = { custom_id: string; result: Record<string, unknown> };

function message(text: string, overrides: Record<string, unknown> = {}) {
  return {
    stop_reason: 'end_turn',
    stop_details: null,
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 900 },
    ...overrides,
  };
}

function fakeClient(opts: {
  /** Ergebnisse je Batch, aus den angefragten custom_ids gebaut. */
  results: (ids: string[]) => Entry[];
  /** So oft `in_progress`, bevor `ended` kommt. */
  pollsUntilEnded?: number;
  createError?: unknown;
}) {
  const created: Array<{ requests: Array<{ custom_id: string; params: Record<string, unknown> }> }> = [];
  let polls = 0;
  const ids = new Map<string, string[]>();
  const batches = {
    create: vi.fn(async (body: (typeof created)[number]) => {
      if (opts.createError) throw opts.createError;
      created.push(body);
      const id = `msgbatch_${created.length}`;
      ids.set(id, body.requests.map((r) => r.custom_id));
      return { id, processing_status: 'in_progress' };
    }),
    retrieve: vi.fn(async () => ({
      processing_status: polls++ >= (opts.pollsUntilEnded ?? 0) ? 'ended' : 'in_progress',
    })),
    results: vi.fn(async (id: string) => {
      const entries = opts.results(ids.get(id) ?? []);
      return (async function* () {
        yield* entries;
      })();
    }),
    cancel: vi.fn(async () => ({ processing_status: 'canceling' })),
  };
  return { client: { messages: { batches } } as unknown as BatchClient, batches, created };
}

const call = { system: 'sys', user: 'usr', model: 'anthropic/claude-opus-5.5', effort: 'max' as const };
const FAR = () => Date.now() + 60_000;

describe('MessageBatcher', () => {
  it('sammelt gleichzeitige Aufrufe in EINEM Batch und ordnet die Ergebnisse über custom_id zu', async () => {
    // Ergebnisse absichtlich in umgekehrter Reihenfolge: zugeordnet wird nie nach Position.
    const { client, batches, created } = fakeClient({
      results: (ids) => [...ids].reverse().map((id) => ({ custom_id: id, result: { type: 'succeeded', message: message(`{"id":"${id}"}`) } })),
      pollsUntilEnded: 2,
    });
    const infos: MessageBatchInfo[] = [];
    const b = new MessageBatcher({ apiKey: 'k', deadline: FAR(), client, settleMs: 5, pollMs: 1, onBatch: (i) => infos.push(i) });
    const [a, c] = await Promise.all([b.request({ ...call, user: 'eins' }), b.request({ ...call, user: 'zwei' })]);

    expect(batches.create).toHaveBeenCalledTimes(1);
    expect(created[0].requests).toHaveLength(2);
    expect(created[0].requests[0].params).toMatchObject({
      model: 'claude-opus-5-5',
      max_tokens: 128_000,
      output_config: { effort: 'max' },
      system: 'sys',
      messages: [{ role: 'user', content: 'eins' }],
    });
    expect(created[0].requests[0].params).not.toHaveProperty('temperature');
    expect(JSON.parse(a.content).id).toBe(created[0].requests[0].custom_id);
    expect(JSON.parse(c.content).id).toBe(created[0].requests[1].custom_id);
    expect(a.usage).toEqual({ promptTokens: 100, completionTokens: 900 });
    expect(batches.retrieve).toHaveBeenCalledTimes(3);
    expect(infos).toEqual([expect.objectContaining({ id: 'msgbatch_1', size: 2, succeeded: 2, errored: 0, missing: 0 })]);
  });

  it('schickt einen Nachzügler nach dem Sammelfenster in einem eigenen Batch', async () => {
    const { client, batches } = fakeClient({
      results: (ids) => ids.map((id) => ({ custom_id: id, result: { type: 'succeeded', message: message('{}') } })),
    });
    const b = new MessageBatcher({ apiKey: 'k', deadline: FAR(), client, settleMs: 5, pollMs: 1 });
    await b.request(call);
    await b.request(call);
    expect(batches.create).toHaveBeenCalledTimes(2);
  });

  it('bildet Ablehnung und Abschneiden ab wie der direkte Aufruf, mit Nutzung für den Preis', async () => {
    const { client } = fakeClient({
      results: ([r1, r2]) => [
        { custom_id: r1, result: { type: 'succeeded', message: message('', { stop_reason: 'refusal', stop_details: { category: 'cyber' } }) } },
        { custom_id: r2, result: { type: 'succeeded', message: message('{"x', { stop_reason: 'max_tokens' }) } },
      ],
    });
    const b = new MessageBatcher({ apiKey: 'k', deadline: FAR(), client, settleMs: 5, pollMs: 1 });
    const [refused, cut] = await Promise.allSettled([b.request(call), b.request(call)]);
    expect(refused.status === 'rejected' && refused.reason).toBeInstanceOf(LlmRefusalError);
    expect(refused.status === 'rejected' && (refused.reason as LlmRefusalError).usage).toEqual({ promptTokens: 100, completionTokens: 900 });
    expect(cut.status === 'rejected' && cut.reason).toBeInstanceOf(LlmMaxTokensError);
  });

  it('meldet einen Fehler je Anfrage mit HTTP-Status, damit Auth und Guthaben den Lauf stoppen', async () => {
    const { client } = fakeClient({
      results: ([r1, r2, r3]) => [
        { custom_id: r1, result: { type: 'errored', error: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } } } },
        { custom_id: r2, result: { type: 'errored', error: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } } },
        { custom_id: r3, result: { type: 'expired' } },
      ],
    });
    const b = new MessageBatcher({ apiKey: 'k', deadline: FAR(), client, settleMs: 5, pollMs: 1 });
    const [auth, overloaded, expired] = await Promise.allSettled([b.request(call), b.request(call), b.request(call)]);
    const reason = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason as Error) : null);
    expect(reason(auth)?.message).toBe('Anthropic API error 401: authentication_error: invalid x-api-key');
    expect(isFatalLlmError(reason(auth)?.message ?? '')).toBe(true);
    expect(reason(overloaded)?.message).toMatch(/^Anthropic API error 529: overloaded_error/);
    expect(isFatalLlmError(reason(overloaded)?.message ?? '')).toBe(false);
    expect(reason(expired)).toBeInstanceOf(MessageBatchError);
    expect((reason(expired) as MessageBatchError).errorClass).toBe('transport');
  });

  it('weist jeden Aufruf ab, wenn das Abschicken scheitert', async () => {
    const { client } = fakeClient({ results: () => [], createError: new Error('fetch failed') });
    const b = new MessageBatcher({ apiKey: 'k', deadline: FAR(), client, settleMs: 5, pollMs: 1 });
    const settled = await Promise.allSettled([b.request(call), b.request(call)]);
    expect(settled.map((s) => s.status === 'rejected' && (s.reason as Error).message)).toEqual(['fetch failed', 'fetch failed']);
  });

  it('storniert nach der Frist und holt trotzdem ab, was schon fertig war', async () => {
    const { client, batches } = fakeClient({
      results: ([r1, r2]) => [
        { custom_id: r1, result: { type: 'succeeded', message: message('{"ok":1}') } },
        { custom_id: r2, result: { type: 'canceled' } },
      ],
      pollsUntilEnded: 3,
    });
    const b = new MessageBatcher({ apiKey: 'k', deadline: Date.now() - 1, client, settleMs: 5, pollMs: 1 });
    const [done, canceled] = await Promise.allSettled([b.request(call), b.request(call)]);
    expect(batches.cancel).toHaveBeenCalledTimes(1);
    expect(done.status === 'fulfilled' && done.value.content).toBe('{"ok":1}');
    expect(canceled.status === 'rejected' && canceled.reason).toBeInstanceOf(MessageBatchError);
  });

  it('weist nach einem Abbruch sofort ab und storniert den Batch', async () => {
    const { client, batches } = fakeClient({ results: () => [], pollsUntilEnded: 1_000 });
    const ctrl = new AbortController();
    const b = new MessageBatcher({ apiKey: 'k', deadline: FAR(), client, settleMs: 5, pollMs: 5, signal: ctrl.signal });
    const pending = b.request(call);
    setTimeout(() => ctrl.abort(), 20);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(batches.cancel).toHaveBeenCalledTimes(1);
    await expect(b.request(call)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('weist einen Aufruf ab, für den der Batch kein Ergebnis liefert', async () => {
    const { client } = fakeClient({ results: () => [] });
    const b = new MessageBatcher({ apiKey: 'k', deadline: FAR(), client, settleMs: 5, pollMs: 1 });
    await expect(b.request(call)).rejects.toBeInstanceOf(MessageBatchError);
  });
});
