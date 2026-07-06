import 'server-only';
import type { AnalysisResult, LLMResponse } from '@/lib/shared/types';
import { SYSTEM_PROMPT, buildEvaluationPrompt, type PublicationForPrompt } from './prompts';
import { chatCompletionJson, parseJsonContent } from '@/lib/server/openrouter';

// Publications relevance analysis via the shared OpenRouter client — the
// publications counterpart to lib/server/events/analyze.ts. Builds the
// evaluation prompt, asks the model for JSON, and returns parsed
// AnalysisResults + token/cost. Used by runAnalysisBatch (batch.ts) as the
// per-batch `analyze` callback passed to runLLMBatch.
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
