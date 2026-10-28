// Ein Bewertungsaufruf für einen Batch Events, das Gegenstück zu
// analyzePublications in lib/server/analysis/analyze.ts: Prompt bauen, JSON
// verlangen, Bewertungen samt Tokens und Kosten zurückgeben. Aufrufer ist der
// Adapter des Bewertungskerns (lib/server/events/scoring-adapter.ts); dort
// stehen auch Scope und Zwillingsregel. Effort kommt aus dem Gate (`max`) und
// wird ausdrücklich durchgereicht. Keine `temperature`: Anthropic lehnt
// Sampling-Parameter ab, und ein anderer Transport kommt durch das Gate nicht.

import { completeJson, parseJsonContent } from '@/lib/server/llm-client';
import type { ScoringCall } from '@/lib/server/scoring/types';
import {
  SYSTEM_PROMPT,
  buildEventEvaluationPrompt,
  type EventAnalysisResult,
  type EventForPrompt,
} from './prompts';

/** Wirft bei einer Antwort ohne `evaluations`; der Kern verbucht den Batch dann als gescheitert. */
export async function analyzeEvents(
  events: EventForPrompt[],
  call: ScoringCall,
  opts: { twins?: readonly (readonly number[])[] } = {},
): Promise<{ results: EventAnalysisResult[]; tokensUsed: number; cost: number }> {
  const { content, tokensUsed, cost } = await completeJson({
    system: SYSTEM_PROMPT,
    user: buildEventEvaluationPrompt(events, { twins: opts.twins }),
    apiKey: call.apiKey,
    model: call.model,
    effort: call.effort,
    batch: call.batch,
    // Nur für OpenRouter von Belang; der Anthropic-Transport rechnet mit
    // eigener Obergrenze, Thinking zählt mit.
    maxTokens: 350 * events.length + 200,
  });
  const parsed = parseJsonContent<{ evaluations?: EventAnalysisResult[] }>(content);
  if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
    throw new Error('LLM response missing evaluations array');
  }
  return { results: parsed.evaluations, tokensUsed, cost };
}
