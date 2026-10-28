// OpenRouter-Transport: der einzige Ort, der HTTP mit OpenRouter spricht.
//
// Aufrufer gehen nicht hierher, sondern an lib/server/llm-client.ts. Dort
// fällt die Wahl des Anbieters, dort werden Kosten gerechnet und Fehler
// klassifiziert. Hier liegt nur, was OpenRouter-spezifisch und fragil ist:
//   - der 402-„can only afford N"-Back-off auf max_tokens,
//   - der JSON-Mode-Aufruf (response_format) samt Reasoning-Abschaltung.

import type { JsonCompletion, TokenUsage } from '@/lib/server/llm-types';
import { log } from '@/lib/server/log';

const COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const REQUEST_HEADERS = {
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://oeaw-press-relevance.vercel.app',
  'X-Title': 'Story Scout',
};

export interface ChatCompletionJsonOptions {
  system: string;
  user: string;
  apiKey: string;
  model: string;
  /** Upper bound on completion tokens; the 402 back-off may lower it. */
  maxTokens: number;
  temperature?: number;
}

/**
 * Single JSON-mode chat completion with the OpenRouter 402 "can only afford N"
 * back-off (retry at a lower max_tokens up to 3 times). Returns raw content so
 * each caller validates its own response shape. Throws an actionable German
 * message on exhausted-credit / non-OK responses.
 */
export async function chatCompletionJson(
  opts: ChatCompletionJsonOptions,
): Promise<JsonCompletion> {
  let maxTokens = opts.maxTokens;
  let lastError = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(COMPLETIONS_URL, {
      method: 'POST',
      headers: { ...REQUEST_HEADERS, Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
        temperature: opts.temperature ?? 0.4,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        // Kein Reasoning. Jeder Aufrufer hier will ein JSON-Objekt, niemand
        // liest den Denkweg. Ohne das Flag verbrennt ein Reasoning-Modell das
        // gesamte max_tokens-Budget im `reasoning`-Feld und liefert
        // `content: null` bei `finish_reason: "length"` — gemessen am
        // 2026-09-04 mit deepseek/deepseek-v4-flash, drei von drei Aufrufen
        // bei max_tokens=200, quer ueber drei Provider. Das sieht wie ein
        // Parsing-Fehler aus, ist aber eine leere Antwort, fuer die wir
        // trotzdem zahlen. Fuer Modelle ohne Reasoning ist das Feld ein No-op.
        reasoning: { enabled: false },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (response.status === 402) {
      const errorBody = await response.text();
      if (errorBody.includes('Prompt tokens limit exceeded')) {
        throw new Error(`OpenRouter: Guthaben aufgebraucht — nicht genug Credits für den Prompt. Bitte Credits aufladen auf openrouter.ai/settings/credits. (${errorBody})`);
      }
      const match = errorBody.match(/can only afford (\d+)/);
      if (match) {
        const affordable = parseInt(match[1], 10);
        if (affordable > 150) {
          maxTokens = affordable - 50;
          log.warn('openrouter_402_retry', { maxTokens, attempt: attempt + 1 });
          lastError = errorBody;
          continue;
        }
      }
      throw new Error(`OpenRouter API error 402: ${errorBody}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const content: string | undefined = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('No content in LLM response');

    // Nicht-gestreamte Completions liefern die Aufteilung mit. Fehlt sie, wird
    // die Gesamtzahl hälftig geteilt — das reproduziert exakt den früheren
    // Mischpreis, statt eine Richtung stillschweigend zu verschlucken.
    const usage = data.usage ?? {};
    const total: number = usage.total_tokens || 0;
    const split: TokenUsage =
      typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number'
        ? { promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens }
        : { promptTokens: total / 2, completionTokens: total / 2 };
    return { content, usage: split };
  }

  throw new Error(`OpenRouter API error 402 (nach 3 Versuchen): ${lastError}`);
}
