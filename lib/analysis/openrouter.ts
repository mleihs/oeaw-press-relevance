import { Publication, AnalysisResult, LLMResponse } from '../types';
import { SCORE_WEIGHTS, COST_PER_MILLION_TOKENS } from '../constants';
import { SYSTEM_PROMPT, buildEvaluationPrompt } from './prompts';

export function calculatePressScore(result: AnalysisResult): number {
  let score = 0;
  for (const [dim, weight] of Object.entries(SCORE_WEIGHTS)) {
    const val = result[dim as keyof AnalysisResult];
    if (typeof val === 'number') {
      score += val * weight;
    }
  }
  return Math.round(score * 10000) / 10000;
}

export function estimateCost(tokenCount: number, model: string): number {
  const costPerMillion = COST_PER_MILLION_TOKENS[model] ?? 5.0;
  return (tokenCount / 1_000_000) * costPerMillion;
}

export async function analyzePublications(
  publications: Publication[],
  apiKey: string,
  model: string
): Promise<{ results: AnalysisResult[]; tokensUsed: number; cost: number }> {
  const prompt = buildEvaluationPrompt(publications);

  // Real output is ~300-500 tokens per publication. Use 700/pub for headroom.
  // Don't cap too low — truncated JSON is worse than a 402 retry.
  let maxTokens = 700 * publications.length;

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://oeaw-press-relevance.vercel.app',
        'X-Title': 'OeAW Press Relevance Analysis',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (response.status === 402) {
      const errorBody = await response.text();

      // "Prompt tokens limit exceeded" → credits too low even for the prompt, no retry possible
      if (errorBody.includes('Prompt tokens limit exceeded')) {
        throw new Error(`OpenRouter: Credits reichen nicht für den Prompt. Bitte Key-Limit erhöhen auf openrouter.ai/settings/keys. (${errorBody})`);
      }

      // "can only afford N" → retry with lower max_tokens
      const match = errorBody.match(/can only afford (\d+)/);
      if (match) {
        const affordable = parseInt(match[1], 10);
        if (affordable > 300) {
          maxTokens = affordable - 50;
          console.warn(`[Analysis] 402: retrying with max_tokens=${maxTokens} (attempt ${attempt + 1})`);
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
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('No content in LLM response');
    }

    const tokensUsed = data.usage?.total_tokens || 0;
    const cost = estimateCost(tokensUsed, model);

    let parsed: LLMResponse;
    try {
      parsed = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1]);
      } else {
        // Log truncated response for debugging
        console.error('[Analysis] Failed to parse JSON. Response length:', content.length, 'First 200 chars:', content.slice(0, 200));
        throw new Error('Failed to parse LLM response as JSON');
      }
    }

    if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
      throw new Error('LLM response missing evaluations array');
    }

    return { results: parsed.evaluations, tokensUsed, cost };
  }

  throw new Error(`OpenRouter API error 402 (nach 3 Versuchen): ${lastError}`);
}
