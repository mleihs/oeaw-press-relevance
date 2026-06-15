// Per-channel look-back resolution. A channel's `lookback_days` overrides the
// global default (SOCIAL_WINDOW_DAYS); null inherits it. Pure helpers, shared
// by sync (fetch/store filter), list (display filter), and analyze (overview
// window) so the "effective window" rule lives in exactly one place.

export function effectiveLookbackDays(
  channelLookback: number | null | undefined,
  globalDefault: number,
): number {
  return channelLookback ?? globalDefault;
}

/** Epoch ms for "now − days". */
export function cutoffMs(days: number): number {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

/** Is an ISO timestamp within the last `days`? Null/absent timestamps pass
 *  (we can't place them, so we don't drop them). */
export function withinLookback(
  postedAt: string | null,
  days: number,
): boolean {
  if (!postedAt) return true;
  return new Date(postedAt).getTime() >= cutoffMs(days);
}
