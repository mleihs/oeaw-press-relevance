import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatCompletionJson, checkKeyBalance } from './openrouter';

// Keep the logger quiet + decoupled from env during the back-off tests.
vi.mock('@/lib/server/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Minimal Response-like stub for the global.fetch mock.
function mockResponse(opts: {
  status?: number;
  ok?: boolean;
  json?: unknown;
  text?: string;
}): Response {
  const status = opts.status ?? 200;
  return {
    status,
    ok: opts.ok ?? (status >= 200 && status < 300),
    json: async () => opts.json,
    text: async () => opts.text ?? '',
  } as unknown as Response;
}

describe('chatCompletionJson', () => {
  const baseOpts = {
    system: 'sys',
    user: 'usr',
    apiKey: 'k',
    model: 'anthropic/claude-opus-5.5',
    maxTokens: 1000,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns content + the reported token split on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          json: {
            choices: [{ message: { content: '{"ok":true}' } }],
            usage: { total_tokens: 1000, prompt_tokens: 800, completion_tokens: 200 },
          },
        }),
      ),
    );
    const res = await chatCompletionJson(baseOpts);
    expect(res.content).toBe('{"ok":true}');
    // Die gemeldete Aufteilung wird verwendet, nicht die Gesamtzahl.
    expect(res.usage).toEqual({ promptTokens: 800, completionTokens: 200 });
  });

  it('teilt die Gesamtzahl hälftig, wenn OpenRouter keine Aufteilung meldet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({
          json: { choices: [{ message: { content: '{}' } }], usage: { total_tokens: 1000 } },
        }),
      ),
    );
    const res = await chatCompletionJson(baseOpts);
    expect(res.usage).toEqual({ promptTokens: 500, completionTokens: 500 });
  });

  it('backs off max_tokens on a 402 "can only afford N" then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockResponse({ status: 402, ok: false, text: 'can only afford 500' }))
      .mockResolvedValueOnce(
        mockResponse({ json: { choices: [{ message: { content: '{}' } }], usage: { total_tokens: 10 } } }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await chatCompletionJson(baseOpts);
    expect(res.content).toBe('{}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second attempt must request fewer tokens than the affordable amount.
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondBody.max_tokens).toBe(450); // 500 - 50
  });

  it('throws (no retry) on a 402 prompt-tokens-limit error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse({ status: 402, ok: false, text: 'Prompt tokens limit exceeded' }),
      ),
    );
    await expect(chatCompletionJson(baseOpts)).rejects.toThrow(/Guthaben aufgebraucht/);
  });

  it('throws on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ status: 500, ok: false, text: 'boom' })),
    );
    await expect(chatCompletionJson(baseOpts)).rejects.toThrow(/error 500/);
  });

  it('throws when the response carries no content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse({ json: { choices: [{ message: {} }] } })),
    );
    await expect(chatCompletionJson(baseOpts)).rejects.toThrow(/No content/);
  });

  it('gives up after 3 affordable-402 retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ status: 402, ok: false, text: 'can only afford 500' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(chatCompletionJson(baseOpts)).rejects.toThrow(/nach 3 Versuchen/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('checkKeyBalance', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  function stubBalanceFetch(keyData: unknown, creditsData: unknown | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('/auth/key')) return Promise.resolve(mockResponse({ json: keyData }));
        if (url.includes('/credits')) {
          return creditsData === null
            ? Promise.reject(new Error('no credits endpoint'))
            : Promise.resolve(mockResponse({ json: creditsData }));
        }
        return Promise.resolve(mockResponse({ status: 404, ok: false }));
      }),
    );
  }

  it('takes min(limitRemaining, accountBalance) as the effective budget', async () => {
    stubBalanceFetch(
      { data: { limit_remaining: 8, usage: 2, limit: 10 } },
      { data: { total_credits: 20, total_usage: 15 } }, // balance = 5
    );
    const r = await checkKeyBalance('k');
    expect(r.limitRemaining).toBe(8);
    expect(r.accountBalance).toBe(5);
    expect(r.effectiveBudget).toBe(5); // min(8, 5)
  });

  it('falls back to accountBalance when no limit is set', async () => {
    stubBalanceFetch(
      { data: { limit_remaining: null, usage: 1, limit: null } },
      { data: { total_credits: 12, total_usage: 3 } }, // balance = 9
    );
    const r = await checkKeyBalance('k');
    expect(r.effectiveBudget).toBe(9);
  });

  it('falls back to limitRemaining when the credits endpoint fails', async () => {
    stubBalanceFetch({ data: { limit_remaining: 4, usage: 1, limit: 5 } }, null);
    const r = await checkKeyBalance('k');
    expect(r.accountBalance).toBeNull();
    expect(r.effectiveBudget).toBe(4);
  });

  it('returns the null fallback when the key lookup is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse({ status: 401, ok: false })));
    const r = await checkKeyBalance('bad');
    expect(r).toEqual({
      limitRemaining: null,
      usage: 0,
      limit: null,
      accountBalance: null,
      effectiveBudget: null,
    });
  });
});
