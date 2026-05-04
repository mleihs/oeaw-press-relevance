import { SCORE_BAND_HIGH, SCORE_BAND_MID, SCORE_BAND_LOW } from './constants';

/**
 * Five-band classification of a 0..1 press-score:
 *
 *   none      score is null
 *   very_low  0    ≤ score < 0.3 (below SCORE_BAND_LOW)
 *   low       0.3  ≤ score < 0.5 (below SCORE_BAND_MID)
 *   mid       0.5  ≤ score < 0.7 (below SCORE_BAND_HIGH)
 *   high      0.7  ≤ score
 *
 * The bands are conceptually distinct but two visual variants collapse them
 * differently (`getScoreBandClass`):
 *   - "badge"  highlights the `low` band in orange (signal that a 0.4 is
 *              meaningfully different from a 0.1, even if neither is in the
 *              pitch zone). Used in PressScoreBadge.
 *   - "hero"   merges low + very_low into neutral. Used in the detail-page
 *              hero where the orange step adds noise.
 */
export type ScoreBand = 'high' | 'mid' | 'low' | 'very_low' | 'none';
export type ScoreBandVariant = 'badge' | 'hero';

export function getScoreBand(score: number | null): ScoreBand {
  if (score === null) return 'none';
  if (score >= SCORE_BAND_HIGH) return 'high';
  if (score >= SCORE_BAND_MID) return 'mid';
  if (score >= SCORE_BAND_LOW) return 'low';
  return 'very_low';
}

const BAND_CLASSES: Record<ScoreBandVariant, Record<ScoreBand, string>> = {
  badge: {
    high: 'bg-brand text-white',
    mid: 'bg-amber-100 text-amber-800',
    low: 'bg-orange-100 text-orange-800',
    very_low: 'bg-neutral-100 text-neutral-600',
    none: 'bg-neutral-100 text-neutral-600',
  },
  hero: {
    high: 'bg-brand text-white',
    mid: 'bg-amber-100 text-amber-800',
    low: 'bg-neutral-100 text-neutral-600',
    very_low: 'bg-neutral-100 text-neutral-600',
    none: 'bg-neutral-100 text-neutral-600',
  },
};

export function getScoreBandClass(score: number | null, variant: ScoreBandVariant): string {
  return BAND_CLASSES[variant][getScoreBand(score)];
}

const STORY_LABELS: Record<ScoreBand, string> = {
  high: 'Hohes Story-Potenzial',
  mid: 'Mittleres Story-Potenzial',
  low: 'Geringes Story-Potenzial',
  very_low: 'Geringes Story-Potenzial',
  none: 'Keine Bewertung',
};

export function getScoreBandStoryLabel(score: number | null): string {
  return STORY_LABELS[getScoreBand(score)];
}
