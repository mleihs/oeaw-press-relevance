import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLM_MODELS, UNKNOWN_MODEL_PRICING } from '@/lib/shared/constants';
import {
  completeJson,
  costFromUsage,
  estimateCost,
  getKeyBalance,
  isFatalLlmError,
  parseJsonContent,
  providerFor,
} from './llm-client';
import { messagesJson } from './anthropic';
import { chatCompletionJson, checkKeyBalance } from './openrouter';
import { UNKNOWN_BALANCE } from './llm-types';

vi.mock('@/lib/server/log', () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const OPUS = 'anthropic/claude-opus-5.5';

// Die Preisquelle ist hier NICHT unter Test (das macht llm-pricing.test.ts) —
// ein fester Live-Preis macht die Kostenerwartungen unabhängig davon, was
// OpenRouter gerade listet.
const LIVE_PROMPT = 3;
const LIVE_COMPLETION = 12;
vi.mock('@/lib/server/llm-pricing', () => ({
  getLiveModelPricing: vi.fn(async () => ({
    'anthropic/claude-opus-5.5': { promptUsd: 3, completionUsd: 12, stale: false },
  })),
}));

// Transporte stubben; anthropicModelId bleibt echt, weil providerFor daran hängt.
vi.mock('./anthropic', async (orig) => ({
  ...(await orig<typeof import('./anthropic')>()),
  messagesJson: vi.fn(),
}));
vi.mock('./openrouter', () => ({
  chatCompletionJson: vi.fn(),
  checkKeyBalance: vi.fn(),
}));

const mockMessages = vi.mocked(messagesJson);
const mockChat = vi.mocked(chatCompletionJson);
const mockBalance = vi.mocked(checkKeyBalance);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
afterEach(() => vi.unstubAllEnvs());

describe('providerFor', () => {
  it('schickt anthropic/* mit gesetztem Key an Anthropic', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    expect(providerFor(OPUS)).toBe('anthropic');
  });

  it('bleibt ohne Anthropic-Key bei OpenRouter', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(providerFor(OPUS)).toBe('openrouter');
  });

  it('schickt andere Anbieter immer an OpenRouter', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    expect(providerFor('deepseek/deepseek-v4-flash')).toBe('openrouter');
  });
});

describe('completeJson', () => {
  const opts = { system: 's', user: 'u', apiKey: 'k', model: OPUS, maxTokens: 1000, temperature: 0.4 };
  const usage = { promptTokens: 800, completionTokens: 200 };

  it('nimmt den Anthropic-Transport mit Effort max als Default', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    mockMessages.mockResolvedValue({ content: '{}', usage });
    const res = await completeJson(opts);
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockMessages).toHaveBeenCalledWith(expect.objectContaining({ model: OPUS, effort: 'max' }));
    expect(res.tokensUsed).toBe(1000);
    expect(res.cost).toBeCloseTo((800 * LIVE_PROMPT + 200 * LIVE_COMPLETION) / 1_000_000, 12);
  });

  it('reicht ANTHROPIC_EFFORT durch und ignoriert ungültige Werte', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    mockMessages.mockResolvedValue({ content: '{}', usage });
    vi.stubEnv('ANTHROPIC_EFFORT', 'high');
    await completeJson(opts);
    expect(mockMessages).toHaveBeenLastCalledWith(expect.objectContaining({ effort: 'high' }));
    vi.stubEnv('ANTHROPIC_EFFORT', 'turbo');
    await completeJson(opts);
    expect(mockMessages).toHaveBeenLastCalledWith(expect.objectContaining({ effort: 'max' }));
  });

  it('nimmt ohne Anthropic-Key den OpenRouter-Transport', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    mockChat.mockResolvedValue({ content: '{"ok":true}', usage });
    const res = await completeJson(opts);
    expect(mockMessages).not.toHaveBeenCalled();
    expect(mockChat).toHaveBeenCalledWith(opts);
    expect(res.content).toBe('{"ok":true}');
    expect(res.tokensUsed).toBe(1000);
  });
});

describe('getKeyBalance', () => {
  it('fragt bei Anthropic nichts ab und meldet den Stand als unbekannt', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    await expect(getKeyBalance('sk-ant-x', OPUS)).resolves.toEqual(UNKNOWN_BALANCE);
    expect(mockBalance).not.toHaveBeenCalled();
  });

  it('fragt bei OpenRouter dessen Guthaben ab', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-x');
    const balance = { ...UNKNOWN_BALANCE, effectiveBudget: 5 };
    mockBalance.mockResolvedValue(balance);
    await expect(getKeyBalance('sk-or-x', 'deepseek/deepseek-chat')).resolves.toEqual(balance);
    expect(mockBalance).toHaveBeenCalledWith('sk-or-x');
  });
});

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
    const opus = LLM_MODELS.find((m) => m.value === OPUS)!;
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

  it('treats Anthropic\'s empty-balance 400 as fatal', () => {
    expect(
      isFatalLlmError(
        'Anthropic API error 400: Your credit balance is too low to access the Anthropic API.',
      ),
    ).toBe(true);
  });

  it('treats 401 + unauthorized/invalid as fatal', () => {
    expect(isFatalLlmError('401 unauthorized: invalid api key')).toBe(true);
    expect(isFatalLlmError('HTTP 401 invalid token')).toBe(true);
    expect(isFatalLlmError('Anthropic API error 401: invalid x-api-key')).toBe(true);
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
