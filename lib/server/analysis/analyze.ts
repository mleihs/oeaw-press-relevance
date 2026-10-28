// Ohne `import 'server-only'`: der Bewertungskern (lib/server/scoring/) und das
// CLI laden dieses Modul unter tsx, wo der Marker nicht auflösbar ist. Den
// Client-Schutz leisten die eslint-boundaries (lib/server ist für Client-Code
// gesperrt) und der 'use client'-Guard in eslint.config.mjs.
import type { AnalysisResult, LLMResponse } from '@/lib/shared/types';
import type { ScoringCall } from '@/lib/server/scoring/types';
import { SYSTEM_PROMPT, buildEvaluationPrompt, type PublicationForPrompt } from './prompts';
import { completeJson, parseJsonContent } from '@/lib/server/llm-client';

// Ein Bewertungsaufruf für einen Batch Publikationen, das Gegenstück zu
// analyzeEvents in lib/server/events/analyze.ts: Prompt bauen, JSON verlangen,
// Bewertungen samt Tokens und Kosten zurückgeben. Aufrufer ist der Adapter des
// Bewertungskerns (lib/server/analysis/scoring-adapter.ts); Effort kommt aus
// dem Gate (`max`) und wird ausdrücklich durchgereicht, nicht aus der Env
// gelesen. Keine `temperature`: Anthropic lehnt Sampling-Parameter ab, und ein
// anderer Transport kommt durch das Gate nicht durch.
export async function analyzePublications(
  publications: PublicationForPrompt[],
  call: ScoringCall,
): Promise<{ results: AnalysisResult[]; tokensUsed: number; cost: number }> {
  const { content, tokensUsed, cost } = await completeJson({
    system: SYSTEM_PROMPT,
    user: buildEvaluationPrompt(publications),
    apiKey: call.apiKey,
    model: call.model,
    effort: call.effort,
    batch: call.batch,
    // Nur für OpenRouter von Belang (rund 300 bis 400 Tokens je Publikation);
    // der Anthropic-Transport rechnet mit eigener Obergrenze, Thinking zählt mit.
    maxTokens: 500 * publications.length,
  });

  const parsed = parseJsonContent<LLMResponse>(content);
  if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
    throw new Error('LLM response missing evaluations array');
  }

  return { results: parsed.evaluations, tokensUsed, cost };
}
