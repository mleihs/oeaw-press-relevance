// Per-channel look-back resolution. A channel's `lookback_days` overrides the
// global default (SOCIAL_WINDOW_DAYS); null inherits it.

import { isWithinDays } from '@/lib/shared/social-filter';

export function effectiveLookbackDays(
  channelLookback: number | null | undefined,
  globalDefault: number,
): number {
  return channelLookback ?? globalDefault;
}

/** Is an ISO timestamp within the last `days`? Single source of truth for the
 *  dated-post predicate lives in lib/shared/social-filter (client + server). */
export const withinLookback = isWithinDays;
