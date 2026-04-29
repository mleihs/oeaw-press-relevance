// Single source of truth for the MeisterTask integration constants.
// Threshold is checked server-side by /api/meistertask/push and mirrored
// in the UI button's disabled state — both must read from here.

export const PRESS_SCORE_PUSH_THRESHOLD = 0.7;
export const SCORE_HIGH_THRESHOLD = 0.85;

export const MEISTERTASK_API_BASE = 'https://www.meistertask.com/api';
export const MEISTERTASK_RPS_LIMIT = 5;
