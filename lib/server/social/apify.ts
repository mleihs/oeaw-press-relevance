// Apify adapter for the social-media monitor. Fetches recent posts of public
// Instagram profiles via the public store actor `apify~instagram-scraper`
// (run-sync-get-dataset-items: runs the actor and returns the dataset in one
// call). Output shape verified live 2026-06-15 against quarks.de — the fields
// mapped below are stable, but the actor schema drifts occasionally, so the
// mapper is defensive (string|number coercion, missing-field tolerant).
//
// This module is intentionally free of getEnv()/NextRequest so the CLI
// (scripts/sync-social.ts) can call it without dragging in the app's env
// validator — token/actor are passed explicitly, mirroring events/sync.ts.

import { InvalidInstagramHandleError } from './errors';

const APIFY_BASE = 'https://api.apify.com/v2/acts';

/** IG path segments that are not profile handles. */
const RESERVED_HANDLES = new Set([
  'p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts', 'about',
]);

/**
 * Normalize a bare handle ("quarks.de", "@quarks.de") or a full/partial
 * profile URL ("https://www.instagram.com/quarks.de/") to the lowercase
 * handle. Throws on anything that isn't a plausible profile handle.
 */
export function parseInstagramHandle(input: string): string {
  let s = input.trim();
  const urlMatch = s.match(/instagram\.com\/([^/?#]+)/i);
  if (urlMatch) s = urlMatch[1];
  s = s.replace(/^@/, '').replace(/\/+$/, '').trim().toLowerCase();
  if (!/^[a-z0-9._]+$/.test(s) || RESERVED_HANDLES.has(s)) {
    throw new InvalidInstagramHandleError(input);
  }
  return s;
}

/** Build the canonical profile URL for a handle. */
export function instagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`;
}

export interface NormalizedSocialPost {
  externalId: string;
  url: string | null;
  postedAt: string | null;
  caption: string | null;
  likeCount: number | null;
  commentCount: number | null;
  mediaType: string | null;
  imageUrl: string | null;
  /** Lowercased owner username, used to map a post back to its channel. */
  ownerUsername: string | null;
  raw: Record<string, unknown>;
}

export interface FetchInstagramOptions {
  token: string;
  /** Defaults to `apify~instagram-scraper`. */
  actor?: string;
  /** Hard cap on posts per profile (bounds cost). */
  resultsLimit?: number;
  /** Best-effort time window: only fetch posts newer than this many days. The
   *  caller still re-filters by date on store, so this is an optimization, not
   *  the source of truth. */
  onlyPostsNewerThanDays?: number;
  /** Actor run timeout (seconds). */
  timeoutSecs?: number;
}

function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function toStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Drop the bulky nested arrays before persisting `raw` (keeps rows small). */
function trimRaw(item: Record<string, unknown>): Record<string, unknown> {
  const {
    latestComments: _lc,
    childPosts: _cp,
    images: _img,
    ...rest
  } = item;
  void _lc; void _cp; void _img;
  return rest;
}

export function normalizeApifyPost(
  item: Record<string, unknown>,
): NormalizedSocialPost | null {
  const externalId = toStr(item.shortCode) ?? toStr(item.id);
  if (!externalId) return null; // can't dedup without a stable key — skip
  const owner = toStr(item.ownerUsername);
  return {
    externalId,
    url: toStr(item.url),
    postedAt: toStr(item.timestamp),
    caption: toStr(item.caption),
    likeCount: toNum(item.likesCount),
    commentCount: toNum(item.commentsCount),
    mediaType: toStr(item.type),
    imageUrl: toStr(item.displayUrl),
    ownerUsername: owner ? owner.toLowerCase() : null,
    raw: trimRaw(item),
  };
}

/**
 * Fetch recent posts for the given handles. Returns a flat list across all
 * profiles; each post carries `ownerUsername` so the caller maps it back to a
 * channel. Throws with a German, actionable message on the common Apify
 * failure modes (no credits, bad token, run timeout).
 */
export async function fetchInstagramPosts(
  handles: string[],
  opts: FetchInstagramOptions,
): Promise<NormalizedSocialPost[]> {
  if (handles.length === 0) return [];

  const actor = opts.actor || 'apify~instagram-scraper';
  const resultsLimit = opts.resultsLimit ?? 12;
  const timeoutSecs = opts.timeoutSecs ?? 180;

  const url =
    `${APIFY_BASE}/${actor}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(opts.token)}&timeout=${timeoutSecs}`;

  const body: Record<string, unknown> = {
    directUrls: handles.map(instagramUrl),
    resultsType: 'posts',
    resultsLimit,
    addParentData: false,
  };
  if (opts.onlyPostsNewerThanDays && opts.onlyPostsNewerThanDays > 0) {
    body.onlyPostsNewerThan = `${opts.onlyPostsNewerThanDays} days`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Give the HTTP layer headroom over the actor run timeout.
    signal: AbortSignal.timeout((timeoutSecs + 30) * 1000),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    if (res.status === 401 || res.status === 403) {
      throw new Error('Apify-Token ungültig oder ohne Berechtigung. Bitte APIFY_TOKEN prüfen.');
    }
    if (res.status === 402) {
      throw new Error('Apify-Guthaben aufgebraucht. Bitte das Apify-Konto aufladen.');
    }
    if (res.status === 408 || res.status === 504) {
      throw new Error('Apify-Lauf hat das Zeitlimit überschritten. Bitte erneut versuchen.');
    }
    throw new Error(`Apify-Fehler ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('Unerwartete Apify-Antwort (kein Array).');
  }

  // The actor emits an error object as a dataset item when a profile can't be
  // scraped (private/blocked); those have no shortCode and are skipped.
  return data
    .map((item) => normalizeApifyPost(item as Record<string, unknown>))
    .filter((p): p is NormalizedSocialPost => p !== null);
}
