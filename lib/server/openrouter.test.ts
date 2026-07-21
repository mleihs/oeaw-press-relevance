import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLM_MODELS, UNKNOWN_MODEL_PRICING } from '@/lib/shared/constants';
import {
  costFromUsage,
  estimateCost,
  isFatalLlmError,
  parseJsonContent,
  chatCompletionJson,
  checkKeyBalance,
} from './openrouter';

// Keep the logger quiet + decoupled from env during the back-off tests.
vi.mock('@/lib/server/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Die Preisquelle ist hier NICHT unter Test (das macht llm-pricing.test.ts) —
// und sie würde sonst am global gestubbten fetch hängen. Ein fester Live-Preis
// macht die Kostenerwartungen unabhängig davon, was OpenRouter gerade listet.
const LIVE_PROMPT = 3;
const LIVE_COMPLETION = 12;
vi.mock('@/lib/server/llm-pricing', () => ({
  getLiveModelPricing: vi.fn(async () => ({
    'anthropic/claude-opus-4.8': {
      promptUsd: LIVE_PROMPT,
      completionUsd: LIVE_COMPLETION,
      stale: false,
    },
  })),
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

describe('costFromUsage', () => {
  const pricing = { promptUsd: 3, completionUsd: 12 };

  it('rechnet beide Richtungen getrennt ab', () => {
    // 1M Prompt + 1M Completion = 3 + 12, NICHT 2 * Mischpreis 7,5.
    expect(costFromUsage({ promptTokens: 1_000_000, completionTokens: 1_000_000 }, pricing))
      .toBeCloseTo(15, 10);
  });

  it('gewichtet eine prompt-lastige Aufteilung entsprechend niedriger', () => {
    // Der reale Scoring-Fall: viel Abstract rein, wenig Pitch raus. Der alte
    // 50/50-Mischpreis hätte hier 7,5 statt 3,9 verlangt.
    expect(costFromUsage({ promptTokens: 900_000, completionTokens: 100_000 }, pricing))
      .toBeCloseTo(0.9 * 3 + 0.1 * 12, 10);
  });

  it('skaliert linear und ist bei null Tokens null', () => {
    expect(costFromUsage({ promptTokens: 0, completionTokens: 0 }, pricing)).toBe(0);
    expect(costFromUsage({ promptTokens: 500_000, completionTokens: 0 }, pricing))
      .toBeCloseTo(1.5, 10);
  });
});

describe('estimateCost', () => {
  it('nimmt den LIVE-Preis, nicht den statischen Fallback des Modells', async () => {
    const opus = LLM_MODELS.find((m) => m.value === 'anthropic/claude-opus-4.8')!;
    // Vorbedingung des Tests: live != statisch, sonst prüft er nichts.
    expect(opus.fallbackPricing.promptUsd).not.toBe(LIVE_PROMPT);
    await expect(
      estimateCost({ promptTokens: 1_000_000, completionTokens: 0 }, opus.value),
    ).resolves.toBeCloseTo(LIVE_PROMPT, 10);
  });

  it('fällt für ein unbekanntes Modell auf die konservative Annahme zurück', async () => {
    await expect(
      estimateCost({ promptTokens: 1_000_000, completionTokens: 0 }, 'totally/unknown-model'),
    ).resolves.toBeCloseTo(UNKNOWN_MODEL_PRICING.promptUsd, 10);
  });
});

describe('isFatalLlmError', () => {
  it('treats 402 + credit/afford/budget wording as fatal (stop the batch)', () => {
    expect(isFatalLlmError('OpenRouter API error 402: can only afford 10')).toBe(true);
    expect(isFatalLlmError('402 — Guthaben aufgebraucht')).toBe(true);
    expect(isFatalLlmError('error 402: not enough credits')).toBe(true);
    expect(isFatalLlmError('402 max_tokens too high for Budget')).toBe(true);
  });

  it('treats 401 + unauthorized/invalid as fatal', () => {
    expect(isFatalLlmError('401 unauthorized: invalid api key')).toBe(true);
    expect(isFatalLlmError('HTTP 401 invalid token')).toBe(true);
  });

  it('treats a bare 402 with no credit wording as transient', () => {
    expect(isFatalLlmError('error 402: something else entirely')).toBe(false);
  });

  it('treats transient/server errors as non-fatal', () => {
    expect(isFatalLlmError('OpenRouter API error 500: upstream timeout')).toBe(false);
    expect(isFatalLlmError('No content in LLM response')).toBe(false);
    expect(isFatalLlmError('429 rate limited')).toBe(false);
  });
});

describe('parseJsonContent', () => {
  it('parses a plain JSON object', () => {
    expect(parseJsonContent('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('parses JSON wrapped in a fenced code block', () => {
    expect(parseJsonContent('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('throws a generic error on unparseable content', () => {
    expect(() => parseJsonContent('not json at all')).toThrow(/Failed to parse/);
  });
});

describe('chatCompletionJson', () => {
  const baseOpts = {
    system: 'sys',
    user: 'usr',
    apiKey: 'k',
    model: 'anthropic/claude-opus-4.8',
    maxTokens: 1000,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns content + tokensUsed + cost on success', async () => {
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
    expect(res.tokensUsed).toBe(1000);
    // Die gemeldete Aufteilung wird verwendet, nicht die Gesamtzahl.
    expect(res.cost).toBeCloseTo(
      (800 * LIVE_PROMPT + 200 * LIVE_COMPLETION) / 1_000_000,
      12,
    );
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
    expect(res.cost).toBeCloseTo((500 * LIVE_PROMPT + 500 * LIVE_COMPLETION) / 1_000_000, 12);
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
