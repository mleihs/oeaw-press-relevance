import { describe, it, expect } from 'vitest';
import { calculatePressScore, type DimensionScores } from './score';
import { computePressScore } from '@/lib/shared/scoring';

// V2 weights (lib/shared/score-weights.json): novelty 0.40, storytelling 0.30,
// accessibility 0.15, timeliness 0.10, societal 0.05.
//
// These assertions are a regression snapshot of the PRE-unification rounding of
// `calculatePressScore` (the hand-rolled loop + `Math.round(x*10000)/10000`).
// The values must stay bit-identical so already-persisted press_scores never
// need re-computing — that is the acceptance criterion for audit item 1.1.
describe('calculatePressScore', () => {
  it('returns 1.0 when every dimension is 1.0 (weights sum to 1)', () => {
    expect(
      calculatePressScore({
        public_accessibility: 1,
        societal_relevance: 1,
        novelty_factor: 1,
        storytelling_potential: 1,
        media_timeliness: 1,
      }),
    ).toBe(1);
  });

  it('rounds the weighted sum to 4 decimals (cleans IEEE-754 drift)', () => {
    // 0.40·0.5 + 0.30·0.6 + 0.15·1.0 + 0.10·0.4 + 0.05·0.8 = 0.61
    // The unrounded float sum is 0.6100000000000001; rounding yields exactly 0.61.
    expect(
      calculatePressScore({
        public_accessibility: 1.0,
        societal_relevance: 0.8,
        novelty_factor: 0.5,
        storytelling_potential: 0.6,
        media_timeliness: 0.4,
      }),
    ).toBe(0.61);
  });

  it('rounds a >4-decimal product down to 4 decimals', () => {
    // 0.40 · 0.12345 = 0.04938 → round(493.8)/10000 = 0.0494
    expect(
      calculatePressScore({
        public_accessibility: 0,
        societal_relevance: 0,
        novelty_factor: 0.12345,
        storytelling_potential: 0,
        media_timeliness: 0,
      }),
    ).toBe(0.0494);
  });

  it('is exactly the 4-decimal rounding of the shared computePressScore formula', () => {
    const dims: DimensionScores = {
      public_accessibility: 0.37,
      societal_relevance: 0.91,
      novelty_factor: 0.13,
      storytelling_potential: 0.66,
      media_timeliness: 0.28,
    };
    expect(calculatePressScore(dims)).toBe(
      Math.round(computePressScore(dims) * 10000) / 10000,
    );
  });
});
