// The push threshold reuses SCORE_BAND_HIGH from lib/constants — same
// semantic ("press-worthy band"), single source mirrored to PG functions.
// SCORE_HIGH_THRESHOLD is a within-band sub-classifier for the 2-label
// split (Hoch vs. Mittel) and is local to this integration.

export { SCORE_BAND_HIGH as PRESS_SCORE_PUSH_THRESHOLD } from '../constants';
export const SCORE_HIGH_THRESHOLD = 0.85;

export const MEISTERTASK_API_BASE = 'https://www.meistertask.com/api';
export const MEISTERTASK_RPS_LIMIT = 5;
