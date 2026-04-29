import { SCORE_WEIGHTS, SCORE_DIMENSIONS, type ScoreDimension } from './constants';

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
 * Compute press_score from 5 dimension values via SCORE_WEIGHTS.
 * Mirrors the SQL aggregation in the analysis batch route — useful for
 * client-side preview, tests, and verifying that the JS and PG paths
 * stay in lockstep when SCORE_WEIGHTS changes.
 */
export function computePressScore(dimensions: Record<ScoreDimension, number>): number {
  let sum = 0;
  for (const dim of SCORE_DIMENSIONS) {
    sum += dimensions[dim] * SCORE_WEIGHTS[dim];
  }
  return sum;
}
