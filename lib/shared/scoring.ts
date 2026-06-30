import {
  SCORE_WEIGHTS,
  type ScoreDimension,
  EVENT_SCORE_WEIGHTS,
  type EventScoreDimension,
} from '@/lib/shared/constants';

/**
 * Bayesian smoothing matching the PG function `weighted_avg` in
 * `supabase/migrations/20260428000008_researchers_weighted_avg.sql`.
 *
 * Pulls a person's raw average toward the global prior, weighted by
 * how many observations they have. With k = 3, a researcher needs
 * roughly 3 publications before their own avg outweighs the prior.
 */
export function bayesSmooth(n: number, avg: number, prior: number, k = 3): number {
  return (n * avg + k * prior) / (n + k);
}

/**
 * Generic weighted sum: Σ dimensions[k]·weights[k] over the weight keys.
 * Single source of truth for every "dimensions → score" computation
 * (publication press_score, event relevance score). Missing dims count as 0
 * (the `?? 0` also defends against a stray null reaching it at runtime).
 */
export function weightedScore<K extends string>(
  dimensions: Partial<Record<K, number>>,
  weights: Record<K, number>,
): number {
  let sum = 0;
  for (const k of Object.keys(weights) as K[]) {
    sum += (dimensions[k] ?? 0) * weights[k];
  }
  return sum;
}

/**
 * Compute press_score from the 5 publication dimensions via SCORE_WEIGHTS.
 * THE single press-score formula: the server entry `calculatePressScore`
 * (lib/server/analysis/score.ts) delegates here and only adds storage rounding,
 * and this stays the JS mirror of the PG `press_score` formula — one path when
 * SCORE_WEIGHTS changes. Unrounded by design (rounding is a persistence concern).
 */
export function computePressScore(dimensions: Record<ScoreDimension, number>): number {
  return weightedScore(dimensions, SCORE_WEIGHTS);
}

/**
 * Compute the event relevance score from the 4 event dimensions
 * (Veranstaltungsbetrieb-Eignung, not press potential). Weights default to the
 * static EVENT_SCORE_WEIGHTS; callers that have user-configured weights (the DB
 * history) pass them in so the stored score reflects the current weighting.
 */
export function computeEventScore(
  dimensions: Record<EventScoreDimension, number>,
  weights: Record<EventScoreDimension, number> = EVENT_SCORE_WEIGHTS,
): number {
  return weightedScore(dimensions, weights);
}
