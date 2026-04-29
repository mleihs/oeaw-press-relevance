import { describe, it, expect } from 'vitest';
import { bayesSmooth, computePressScore } from './scoring';
import { SCORE_WEIGHTS, SCORE_DIMENSIONS, type ScoreDimension } from './constants';

describe('SCORE_WEIGHTS', () => {
  it('weights sum to 1.0', () => {
    const total = SCORE_DIMENSIONS.reduce((s, d) => s + SCORE_WEIGHTS[d], 0);
    expect(total).toBeCloseTo(1.0, 10);
  });
});

describe('computePressScore', () => {
  it('returns 1.0 when every dimension is 1.0 (weights sum to 1)', () => {
    const all1: Record<ScoreDimension, number> = {
      public_accessibility: 1,
      societal_relevance: 1,
      novelty_factor: 1,
      storytelling_potential: 1,
      media_timeliness: 1,
    };
    expect(computePressScore(all1)).toBeCloseTo(1.0, 10);
  });

  it('matches the documented weighted formula for a mixed input', () => {
    const mixed: Record<ScoreDimension, number> = {
      public_accessibility: 1.0,
      societal_relevance: 0.8,
      novelty_factor: 0.5,
      storytelling_potential: 0.6,
      media_timeliness: 0.4,
    };
    // 0.20·1 + 0.25·0.8 + 0.20·0.5 + 0.20·0.6 + 0.15·0.4 = 0.68
    const expected =
      0.20 * 1.0 +
      0.25 * 0.8 +
      0.20 * 0.5 +
      0.20 * 0.6 +
      0.15 * 0.4;
    expect(computePressScore(mixed)).toBeCloseTo(expected, 10);
  });
});

describe('bayesSmooth', () => {
  it('pulls a 1-pub-wonder strongly toward the prior', () => {
    // 1 pub at 0.72, prior 0.25, k=3
    // → (1·0.72 + 3·0.25) / (1+3) = (0.72 + 0.75) / 4 = 0.3675
    expect(bayesSmooth(1, 0.72, 0.25)).toBeCloseTo(0.3675, 10);
  });

  it('lets many pubs converge toward the persons own avg', () => {
    // 10 pubs at 0.55, prior 0.25, k=3
    // → (10·0.55 + 3·0.25) / 13 = (5.5 + 0.75) / 13 ≈ 0.4808
    expect(bayesSmooth(10, 0.55, 0.25)).toBeCloseTo(6.25 / 13, 10);
  });
});
