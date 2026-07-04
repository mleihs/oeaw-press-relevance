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

// Bands map onto the design-system state tokens (docs/design/DESIGN_SYSTEM.md
// §2.3) rather than ad-hoc tailwind colors, so score badges stay on-token and
// dark-mode-capable: high = solid brand, mid = warning tint, low = "soon" tint,
// very_low/none = neutral fill. Light appearance is near-identical to the prior
// amber-100/orange-100/neutral-100 values.
const BAND_CLASSES: Record<ScoreBandVariant, Record<ScoreBand, string>> = {
  // Toolkit-Redesign-Comp `scoreBadge`: getönter Kasten, NICHT satt gefüllt —
  // hoch = hellblau/blau (#eef4ff/#0047bb), mittel = amber-Tint, niedrig/keine
  // = neutral. So liest das Badge toolkit-weit wie im Entwurf.
  badge: {
    high: 'bg-brand-50 text-brand',
    mid: 'bg-warning-tint text-warning-ink',
    low: 'bg-soon-tint text-soon',
    very_low: 'bg-fill text-ink-subtle',
    none: 'bg-fill text-ink-subtle',
  },
  hero: {
    high: 'bg-brand-500 text-white',
    mid: 'bg-warning-tint text-warning-ink',
    low: 'bg-fill text-ink-subtle',
    very_low: 'bg-fill text-ink-subtle',
    none: 'bg-fill text-ink-subtle',
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
