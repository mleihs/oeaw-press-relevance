import { describe, it, expect, vi, beforeEach } from 'vitest';
import { anthropicModelId, messagesJson } from './anthropic';

// Das SDK wird gestubbt: geprüft wird, was dieser Transport hinschickt und wie
// er die Antwort abbildet, nicht das SDK selbst.
const { stream, finalMessage, APIError } = vi.hoisted(() => {
  class APIError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  const finalMessage = vi.fn();
  const stream = vi.fn(() => ({ finalMessage }));
  return { stream, finalMessage, APIError };
});
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    static APIError = APIError;
    messages = { stream };
  }
  return { default: Anthropic };
});

const opts = {
  system: 'sys',
  user: 'usr',
  apiKey: 'sk-ant-x',
  model: 'anthropic/claude-opus-5.5',
  effort: 'max' as const,
};

function message(overrides: Record<string, unknown> = {}) {
  return {
    stop_reason: 'end_turn',
    stop_details: null,
    content: [
      { type: 'thinking', thinking: '' },
      { type: 'text', text: '{"evaluations":' },
      { type: 'text', text: '[]}' },
    ],
    usage: {
      input_tokens: 700,
      cache_creation_input_tokens: 50,
      cache_read_input_tokens: 50,
      output_tokens: 3000,
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('anthropicModelId', () => {
  it('übersetzt das App-Format in die API-ID', () => {
    expect(anthropicModelId('anthropic/claude-opus-5.5')).toBe('claude-opus-5-5');
    expect(anthropicModelId('anthropic/claude-sonnet-5')).toBe('claude-sonnet-5');
  });

  it('gibt für andere Anbieter null', () => {
    expect(anthropicModelId('deepseek/deepseek-chat')).toBeNull();
  });
});

describe('messagesJson', () => {
  it('schickt API-ID, Effort und Prompts, aber kein temperature', async () => {
    finalMessage.mockResolvedValue(message());
    await messagesJson(opts);
    const body = (stream.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'claude-opus-5-5',
      output_config: { effort: 'max' },
      system: 'sys',
      messages: [{ role: 'user', content: 'usr' }],
    });
    expect(body).not.toHaveProperty('temperature');
  });

  it('fügt die Textblöcke zusammen und zählt Cache-Tokens als Eingabe', async () => {
    finalMessage.mockResolvedValue(message());
    await expect(messagesJson(opts)).resolves.toEqual({
      content: '{"evaluations":[]}',
      usage: { promptTokens: 800, completionTokens: 3000 },
    });
  });

  it('wirft bei einer Ablehnung mit Kategorie', async () => {
    finalMessage.mockResolvedValue(
      message({ stop_reason: 'refusal', stop_details: { category: 'bio' }, content: [] }),
    );
    await expect(messagesJson(opts)).rejects.toThrow(/abgelehnt \(refusal, bio\)/);
  });

  it('wirft bei abgeschnittener Antwort', async () => {
    finalMessage.mockResolvedValue(message({ stop_reason: 'max_tokens' }));
    await expect(messagesJson(opts)).rejects.toThrow(/abgeschnitten/);
  });

  it('wirft ohne Textblock', async () => {
    finalMessage.mockResolvedValue(message({ content: [{ type: 'thinking', thinking: '' }] }));
    await expect(messagesJson(opts)).rejects.toThrow(/No content/);
  });

  it('stellt API-Fehlern den Status voran, damit isFatalLlmError greift', async () => {
    finalMessage.mockRejectedValue(new APIError(401, 'invalid x-api-key'));
    await expect(messagesJson(opts)).rejects.toThrow('Anthropic API error 401: invalid x-api-key');
  });

  it('lehnt Nicht-Anthropic-Modelle ab, ohne das SDK zu rufen', async () => {
    await expect(messagesJson({ ...opts, model: 'deepseek/deepseek-chat' })).rejects.toThrow(
      /Kein Anthropic-Modell/,
    );
    expect(stream).not.toHaveBeenCalled();
  });
});
