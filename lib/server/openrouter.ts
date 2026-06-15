// Shared OpenRouter client — the single place that talks HTTP to OpenRouter.
//
// Feature layers (publication scoring in lib/server/analysis/, social-media
// topic extraction in lib/server/social/) build their own prompts and parse
// their own response shapes, but the request/retry/cost/balance machinery
// lives here so there is exactly one implementation of the fragile bits:
//   - the 402 "can only afford N" max_tokens back-off,
//   - the JSON-mode call + fenced-JSON fallback,
//   - cost estimation and account-balance lookup.

import { COST_PER_MILLION_TOKENS } from '@/lib/shared/constants';
import { parseLooseJson } from '@/lib/shared/json';
import { log } from '@/lib/server/log';

const COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';

const REQUEST_HEADERS = {
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://oeaw-press-relevance.vercel.app',
  'X-Title': 'Story Scout',
};

/** Estimate USD cost for a token count under a model's blended rate. Unknown
 *  models fall back to a conservative $5/M. */
export function estimateCost(tokenCount: number, model: string): number {
  const costPerMillion = COST_PER_MILLION_TOKENS[model] ?? 5.0;
  return (tokenCount / 1_000_000) * costPerMillion;
}

export async function checkKeyBalance(apiKey: string): Promise<{
  limitRemaining: number | null;
  usage: number;
  limit: number | null;
  accountBalance: number | null;
  effectiveBudget: number | null;
}> {
  const fallback = { limitRemaining: null, usage: 0, limit: null, accountBalance: null, effectiveBudget: null };
  try {
    const headers = { Authorization: `Bearer ${apiKey}` };
    const opts = { headers, signal: AbortSignal.timeout(10000) };

    const [keyRes, creditsRes] = await Promise.all([
      fetch('https://openrouter.ai/api/v1/auth/key', opts),
      fetch('https://openrouter.ai/api/v1/credits', opts).catch(() => null),
    ]);

    if (!keyRes.ok) return fallback;
    const keyData = await keyRes.json();

    const limitRemaining: number | null = keyData.data?.limit_remaining ?? null;
    const usage: number = keyData.data?.usage ?? 0;
    const limit: number | null = keyData.data?.limit ?? null;

    let accountBalance: number | null = null;
    if (creditsRes && creditsRes.ok) {
      const creditsData = await creditsRes.json();
      const totalCredits = creditsData.data?.total_credits ?? null;
      const totalUsage = creditsData.data?.total_usage ?? null;
      if (totalCredits !== null && totalUsage !== null) {
        accountBalance = totalCredits - totalUsage;
      }
    }

    let effectiveBudget: number | null = null;
    if (limitRemaining !== null && accountBalance !== null) {
      effectiveBudget = Math.min(limitRemaining, accountBalance);
    } else if (accountBalance !== null) {
      effectiveBudget = accountBalance;
    } else if (limitRemaining !== null) {
      effectiveBudget = limitRemaining;
    }

    return { limitRemaining, usage, limit, accountBalance, effectiveBudget };
  } catch {
    return fallback;
  }
}

export interface ChatCompletionJsonOptions {
  system: string;
  user: string;
  apiKey: string;
  model: string;
  /** Upper bound on completion tokens; the 402 back-off may lower it. */
  maxTokens: number;
  temperature?: number;
}

export interface ChatCompletionJsonResult {
  /** Raw assistant message content (a JSON string — parse with parseJsonContent). */
  content: string;
  tokensUsed: number;
  cost: number;
}

/**
 * Single JSON-mode chat completion with the OpenRouter 402 "can only afford N"
 * back-off (retry at a lower max_tokens up to 3 times). Returns raw content so
 * each caller validates its own response shape. Throws an actionable German
 * message on exhausted-credit / non-OK responses.
 */
export async function chatCompletionJson(
  opts: ChatCompletionJsonOptions,
): Promise<ChatCompletionJsonResult> {
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

    const tokensUsed = data.usage?.total_tokens || 0;
    return { content, tokensUsed, cost: estimateCost(tokensUsed, opts.model) };
  }

  throw new Error(`OpenRouter API error 402 (nach 3 Versuchen): ${lastError}`);
}

/** Classify an OpenRouter error message: fatal (stop the batch to save credits)
 *  vs. transient (skip the item, keep going). Shared by the publication-scoring
 *  and social-analysis pipelines so the rule lives in one place. */
export function isFatalLlmError(message: string): boolean {
  return (
    (/\b402\b/.test(message) && /credits|afford|max_tokens|Budget|Guthaben/i.test(message)) ||
    (/\b401\b/.test(message) && /unauthorized|invalid/i.test(message))
  );
}

/** Parse a JSON object out of an assistant message via the hardened shared
 *  parser (fences, surrounding prose, trailing commas, truncation). Logs +
 *  rethrows a generic error so the batch loop surfaces it like any other. */
export function parseJsonContent<T>(content: string): T {
  try {
    return parseLooseJson<T>(content);
  } catch {
    log.error('openrouter_json_parse_failed', {
      responseLength: content.length,
      head: content.slice(0, 200),
    });
    throw new Error('Failed to parse LLM response as JSON');
  }
}
