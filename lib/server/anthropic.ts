// Anthropic-Transport (SDK @anthropic-ai/sdk 1.x): der einzige Ort, der mit
// der Anthropic-API spricht. Aufrufer gehen an lib/server/llm-client.ts; dort
// fällt die Wahl des Anbieters, dort werden Kosten gerechnet. Seit 2026-10-24
// läuft die plattforminterne Bewertung (Publikationen + Events) hierüber.
//
// Die App führt Modelle im OpenRouter-Format (`anthropic/claude-opus-5.5`):
// so stimmen llm_model in der DB, der Modell-Picker und die Live-Preisliste
// (lib/server/llm-pricing.ts), und der In-Chat-Tag
// `anthropic/claude-opus-5.5-session` passt dazu. Übersetzt wird nur hier.

import Anthropic from '@anthropic-ai/sdk';
import type { JsonCompletion } from '@/lib/server/llm-types';

const MODEL_PREFIX = 'anthropic/';

/**
 * Obergrenze je Aufruf. Bei Opus 5.5 ist Thinking immer an und zählt in
 * max_tokens hinein; die 500 Tokens je Publikation, mit denen der
 * OpenRouter-Pfad rechnet, reichen bei Effort max nicht einmal fürs Denken.
 * Bezahlt wird nur, was tatsächlich erzeugt wird. Ein so hoher Wert verlangt
 * Streaming (das SDK verweigert sonst den Aufruf), daher `messages.stream`.
 */
const MAX_TOKENS = 64_000;

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** `anthropic/claude-opus-5.5` → `claude-opus-5-5`; null für andere Anbieter. */
export function anthropicModelId(model: string): string | null {
  if (!model.startsWith(MODEL_PREFIX)) return null;
  return model.slice(MODEL_PREFIX.length).replace(/\./g, '-');
}

export interface MessagesJsonOptions {
  system: string;
  user: string;
  apiKey: string;
  /** App-Format, z. B. `anthropic/claude-opus-5.5`. */
  model: string;
  effort: AnthropicEffort;
}

/**
 * Ein Aufruf, Antwort als JSON-Text. Kein `temperature` (seit API-Version
 * 2026-10-21 auf jedem Modell ein 400) und kein Prefill; das JSON-Format
 * erzwingen die Prompts, geparst wird wie beim OpenRouter-Pfad.
 *
 * Bewusst ohne Server-Fallbacks bei Refusals: ein Ersatzmodell trüge unter dem
 * Opus-Tag ein zweites Kalibrierungs-Regime ins Korpus (s. LLM_MODELS in
 * lib/shared/constants.ts). Eine Ablehnung lässt den Batch scheitern; die
 * Einträge bleiben für den nächsten Lauf offen.
 */
export async function messagesJson(opts: MessagesJsonOptions): Promise<JsonCompletion> {
  const model = anthropicModelId(opts.model);
  if (!model) throw new Error(`Kein Anthropic-Modell: ${opts.model}`);

  // maxRetries 2 (SDK-Default) wiederholt 429/5xx/Verbindungsfehler selbst.
  const client = new Anthropic({ apiKey: opts.apiKey });

  let message: Anthropic.Message;
  try {
    message = await client.messages
      .stream({
        model,
        max_tokens: MAX_TOKENS,
        output_config: { effort: opts.effort },
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      })
      .finalMessage();
  } catch (err) {
    // Status voranstellen, damit isFatalLlmError 401 und leeres Guthaben
    // erkennt und den Lauf stoppt, statt Batch um Batch weiterzuversuchen.
    if (err instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error ${err.status ?? '?'}: ${err.message}`);
    }
    throw err;
  }

  if (message.stop_reason === 'refusal') {
    const category = message.stop_details?.category ?? 'ohne Kategorie';
    throw new Error(`Anthropic: Anfrage abgelehnt (refusal, ${category})`);
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error(`Anthropic: Antwort bei max_tokens=${MAX_TOKENS} abgeschnitten`);
  }

  const content = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!content) throw new Error('No content in LLM response');

  // Cache-Tokens zählen als Eingabe; Thinking steckt in output_tokens.
  const u = message.usage;
  return {
    content,
    usage: {
      promptTokens:
        u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      completionTokens: u.output_tokens,
    },
  };
}
