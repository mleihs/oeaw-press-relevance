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
      max_tokens: 1500 * publications.length,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(60000),
  });

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

  // Parse JSON response
  let parsed: LLMResponse;
  try {
    parsed = JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  if (!parsed.evaluations || !Array.isArray(parsed.evaluations)) {
    throw new Error('LLM response missing evaluations array');
  }

  return { results: parsed.evaluations, tokensUsed, cost };
}
