import { SCORE_BAND_HIGH, SCORE_BAND_MID, SCORE_BAND_LOW } from './constants';

export type ScoreBand = 'high' | 'mid' | 'low' | 'very_low' | 'none';

/**
 * Map a 0..1 press-score to a UI band. NULL → 'none'. Thresholds live in
 * `lib/constants.ts` (SCORE_BAND_HIGH/MID/LOW).
 *
 * Two visual variants exist:
 *  - `BAND_BADGE_CLASSES` — four-step (high / mid / low / very_low+none),
 *    used in tight contexts where 'low' (orange) is meaningful (PressScoreBadge).
 *  - `BAND_HERO_CLASSES`  — three-step (high / mid / low+very_low+none),
 *    used in the detail-page hero donut where the orange step adds noise.
 */
export function getScoreBand(score: number | null): ScoreBand {
  if (score === null) return 'none';
  if (score >= SCORE_BAND_HIGH) return 'high';
  if (score >= SCORE_BAND_MID) return 'mid';
  if (score >= SCORE_BAND_LOW) return 'low';
  return 'very_low';
}

export const SCORE_BAND_STORY_LABEL: Record<ScoreBand, string> = {
  high: 'Hohes Story-Potenzial',
  mid: 'Mittleres Story-Potenzial',
  low: 'Geringes Story-Potenzial',
  very_low: 'Geringes Story-Potenzial',
  none: 'Keine Bewertung',
};

export const BAND_BADGE_CLASSES: Record<ScoreBand, string> = {
  high: 'bg-brand text-white',
  mid: 'bg-amber-100 text-amber-800',
  low: 'bg-orange-100 text-orange-800',
  very_low: 'bg-neutral-100 text-neutral-600',
  none: 'bg-neutral-100 text-neutral-600',
};

export const BAND_HERO_CLASSES: Record<ScoreBand, string> = {
  high: 'bg-brand text-white',
  mid: 'bg-amber-100 text-amber-800',
  low: 'bg-neutral-100 text-neutral-600',
  very_low: 'bg-neutral-100 text-neutral-600',
  none: 'bg-neutral-100 text-neutral-600',
};
