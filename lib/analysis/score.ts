// Press-score formula and dimension weights — shared by every scoring engine
// (OpenRouter route, session-based scorer in scripts/session-score.mjs, future
// engines). Keep this file engine-agnostic so the scoring is one canonical
// computation regardless of which model produced the dimension values.

import { SCORE_WEIGHTS } from '../constants';
import type { AnalysisResult } from '../types';

export type DimensionScores = Pick<
  AnalysisResult,
  | 'public_accessibility'
  | 'societal_relevance'
  | 'novelty_factor'
  | 'storytelling_potential'
  | 'media_timeliness'
>;

export function calculatePressScore(dims: DimensionScores): number {
  let score = 0;
  for (const [dim, weight] of Object.entries(SCORE_WEIGHTS)) {
    const val = dims[dim as keyof DimensionScores];
    if (typeof val === 'number') {
      score += val * weight;
    }
  }
  return Math.round(score * 10000) / 10000;
}

// Tag written to publications.llm_model when this Claude Code session
// (claude-opus-4.7) is the scoring engine — distinguishes from OpenRouter runs.
export const SESSION_MODEL_TAG = 'anthropic/claude-opus-4.7-session';
