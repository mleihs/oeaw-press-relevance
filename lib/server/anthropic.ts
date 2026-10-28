// Anthropic-Transport (SDK @anthropic-ai/sdk 1.x): der einzige Ort, der mit
// der Anthropic-API spricht. Aufrufer gehen an lib/server/llm-client.ts; dort
// fällt die Wahl des Anbieters, dort werden Kosten gerechnet. Seit 2026-10-24
// läuft die plattforminterne Bewertung (Publikationen + Events) hierüber.
//
// Die App führt Modelle im OpenRouter-Format (`anthropic/claude-opus-5.5`):
// so stimmen llm_model in der DB, der Modell-Picker und die Live-Preisliste
// (lib/server/llm-pricing.ts), und der In-Chat-Tag
// `anthropic/claude-opus-5.5-session` passt dazu. Übersetzt wird nur hier.
//
// Request-Body (messageParams) und Abbildung der Antwort (completionOf) teilt
// sich dieser Transport mit der Batch-API (lib/server/anthropic-batch.ts):
// ein Aufruf liefert auf beiden Wegen dasselbe oder wirft denselben Fehler.

import Anthropic from '@anthropic-ai/sdk';
import {
  LlmMaxTokensError,
  LlmRefusalError,
  type JsonCompletion,
  type TokenUsage,
} from '@/lib/server/llm-types';

const MODEL_PREFIX = 'anthropic/';

/**
 * Obergrenze je Aufruf: das dokumentierte Maximum von Opus 5.5 (128K). Bei
 * Opus 5.5 ist Thinking immer an und zählt in max_tokens hinein, und das
 * Modell kennt die Grenze nicht; mit Effort max denkt es, bis es fertig ist.
 * Mit 64K lief das Lektorat im lokalen Lauf vom 2026-10-27 bei Publikationen
 * und Events im ersten Versuch ab, schon bei drei Datensätzen. Bezahlt wird
 * nur, was tatsächlich erzeugt wird. Ein so hoher Wert verlangt Streaming
 * (das SDK verweigert sonst den Aufruf), daher `messages.stream`.
 */
export const MAX_TOKENS = 128_000;

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
 * Der Request-Body eines Aufrufs. Kein `temperature` (seit API-Version
 * 2026-10-21 auf jedem Modell ein 400) und kein Prefill; das JSON-Format
 * erzwingen die Prompts, geparst wird wie beim OpenRouter-Pfad.
 *
 * Bewusst ohne Server-Fallbacks bei Refusals: ein Ersatzmodell trüge unter dem
 * Opus-Tag ein zweites Kalibrierungs-Regime ins Korpus (s. LLM_MODELS in
 * lib/shared/constants.ts). Eine Ablehnung lässt den Batch scheitern; die
 * Einträge bleiben für den nächsten Lauf offen.
 */
export function messageParams(opts: Omit<MessagesJsonOptions, 'apiKey'>): Anthropic.MessageCreateParamsNonStreaming {
  const model = anthropicModelId(opts.model);
  if (!model) throw new Error(`Kein Anthropic-Modell: ${opts.model}`);
  return {
    model,
    max_tokens: MAX_TOKENS,
    output_config: { effort: opts.effort },
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  };
}

/**
 * SDK-Fehler mit vorangestelltem Status, damit isFatalLlmError 401 und leeres
 * Guthaben erkennt und den Lauf stoppt, statt Batch um Batch weiterzuversuchen.
 * Andere Fehler unverändert.
 */
export function anthropicApiError(err: unknown): unknown {
  return err instanceof Anthropic.APIError ? new Error(`Anthropic API error ${err.status ?? '?'}: ${err.message}`) : err;
}

/** Ein Aufruf, Antwort als JSON-Text. */
export async function messagesJson(opts: MessagesJsonOptions): Promise<JsonCompletion> {
  const params = messageParams(opts);
  // maxRetries 2 (SDK-Default) wiederholt 429/5xx/Verbindungsfehler selbst.
  const client = new Anthropic({ apiKey: opts.apiKey });

  let message: Anthropic.Message;
  try {
    message = await client.messages.stream(params).finalMessage();
  } catch (err) {
    throw anthropicApiError(err);
  }
  return completionOf(message);
}

/**
 * Bildet eine fertige Antwort ab: der Text als JSON-String, oder der passende
 * Fehler. Abgelehnt oder abgeschnitten ist trotzdem bezahlt: die Nutzung reist
 * mit dem Fehler, damit die Fassade den Preis daran hängen kann.
 */
export function completionOf(message: Anthropic.Message): JsonCompletion {
  if (message.stop_reason === 'refusal') {
    throw new LlmRefusalError(message.stop_details?.category ?? 'ohne Kategorie', usageOf(message));
  }
  if (message.stop_reason === 'max_tokens') {
    throw new LlmMaxTokensError(MAX_TOKENS, usageOf(message));
  }

  const content = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!content) throw new Error('No content in LLM response');

  return { content, usage: usageOf(message) };
}

/** Cache-Tokens zählen als Eingabe; Thinking steckt in output_tokens. */
function usageOf(message: Anthropic.Message): TokenUsage {
  const u = message.usage;
  return {
    promptTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
    completionTokens: u.output_tokens,
  };
}
