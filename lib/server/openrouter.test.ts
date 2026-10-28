import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatCompletionJson } from './openrouter';

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
