// Press-score formula and dimension weights — shared by every scoring engine
// (OpenRouter route, session-based scorer in scripts/session-score.mjs, future
// engines). Keep this file engine-agnostic so the scoring is one canonical
// computation regardless of which model produced the dimension values.

import 'server-only';
import { computePressScore } from '@/lib/shared/scoring';
import sessionModel from '@/lib/shared/session-model.json';
import type { AnalysisResult } from '@/lib/shared/types';

export type DimensionScores = Pick<
  AnalysisResult,
  | 'public_accessibility'
  | 'societal_relevance'
  | 'novelty_factor'
  | 'storytelling_potential'
  | 'media_timeliness'
>;

// Persisted press_score. The weighted-sum formula lives in `computePressScore`
// → `weightedScore` (lib/shared/scoring) — one path, shared with the PG mirror.
// This server entry only adds the 4-decimal storage rounding so stored scores
// don't carry IEEE-754 drift (e.g. 0.6100000000000001 → 0.61). Bit-identical to
// the previous hand-rolled loop for all numeric/null dimension inputs.
export function calculatePressScore(dims: DimensionScores): number {
  return Math.round(computePressScore(dims) * 10000) / 10000;
}

// Tag written to publications.llm_model when this Claude Code session is the
// scoring engine (distinguishes from OpenRouter runs). Single source of truth:
// lib/shared/session-model.json — shared verbatim with scripts/session-pipeline.mjs
// so the writer tag can never drift between the two scoring entry points (the
// drift that once mislabeled 4.8 output as 4.7). Historical scores carry the
// 4.7-generation tag; match `anthropic/claude-opus-%-session` to detect a
// session score across model generations.
export const SESSION_MODEL_TAG = sessionModel.tag;
