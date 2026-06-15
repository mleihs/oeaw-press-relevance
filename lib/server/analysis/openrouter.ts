import { AnalysisResult, LLMResponse } from '@/lib/shared/types';
import { SYSTEM_PROMPT, buildEvaluationPrompt, PublicationForPrompt } from './prompts';
import { calculatePressScore } from './score';
import {
  chatCompletionJson,
  parseJsonContent,
  checkKeyBalance,
  estimateCost,
} from '@/lib/server/openrouter';

// Back-compat re-exports: batch.ts imports these from this module, and the
// HTTP/cost/balance primitives now live in the shared client.
export { calculatePressScore, checkKeyBalance, estimateCost };

export async function analyzePublications(
  publications: PublicationForPrompt[],
  apiKey: string,
  model: string
): Promise<{ results: AnalysisResult[]; tokensUsed: number; cost: number }> {
  const prompt = buildEvaluationPrompt(publications);

  // Real output is ~300-400 tokens per publication. Use 500/pub for headroom —
  // the shared client's 402 back-off lowers it if the budget can't cover it.
  const { content, tokensUsed, cost } = await chatCompletionJson({
    system: SYSTEM_PROMPT,
    user: prompt,
    apiKey,
    model,
    maxTokens: 500 * publications.length,
    temperature: 0.4,
  });

  const parsed = parseJsonContent<LLMResponse>(content);
  if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
    throw new Error('LLM response missing evaluations array');
  }

  return { results: parsed.evaluations, tokensUsed, cost };
}
