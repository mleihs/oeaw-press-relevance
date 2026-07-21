// Fetch recent posts for the active channels via Apify and UPSERT them.
//
// Mirrors lib/server/events/sync.ts: the function takes explicit config (no
// getEnv()/NextRequest) so the HTTP route and the CLI feed it from different
// sources. The UPSERT updates only fetch-sourced columns — the LLM analysis
// columns (topic, keywords, summary_de, analysis_status, llm_model,
// analyzed_at) are preserved on re-sync, so a post is analyzed exactly once
// and re-fetching never re-spends LLM tokens.

import { eq, sql } from 'drizzle-orm';
import { db, socialChannels, socialPosts } from '@/lib/server/db';
import { fetchInstagramPosts, type NormalizedSocialPost } from './apify';
import { effectiveLookbackDays, withinLookback } from './window';
import { SocialSyncConfigError } from './errors';

export interface SocialSyncOptions {
  /** APIFY_TOKEN. Falsy → SocialSyncConfigError (route maps to 503). */
  apifyToken: string | undefined;
  /** Store actor id; defaults to apify~instagram-scraper. */
  actor?: string;
  /** Hard cap on posts fetched per channel (bounds cost). */
  resultsLimit?: number;
  /** Abrufzeitraum (Tage) für Kanäle ohne eigene Übersteuerung. Kommt aus
   *  social_settings.fetch_window_days (lib/server/social/settings.ts). */
  windowDays: number;
}

export interface SocialSyncResult {
  channels: number;
  fetched: number;
  created: number;
  updated: number;
  unmatched: number;
  ms: number;
}

export async function syncSocialPosts(
  opts: SocialSyncOptions,
): Promise<SocialSyncResult> {
  const startedAt = Date.now();

  if (!opts.apifyToken) {
    throw new SocialSyncConfigError(
      'APIFY_TOKEN ist nicht gesetzt. Der Social-Media-Sync ist deaktiviert. Setze die Variable in .env.local (oder den Vercel-Secrets), um Posts zu laden.',
    );
  }
  // Capture the narrowed token so the per-group fetch closures below see `string`
  // (TS doesn't carry property narrowing into nested closures).
  const apifyToken = opts.apifyToken;

  const channels = await db
    .select({
      id: socialChannels.id,
      handle: socialChannels.handle,
      lookbackDays: socialChannels.lookbackDays,
    })
    .from(socialChannels)
    .where(eq(socialChannels.active, true));

  if (channels.length === 0) {
    return { channels: 0, fetched: 0, created: 0, updated: 0, unmatched: 0, ms: Date.now() - startedAt };
  }

  // Resolve each channel's effective window, then group channels by it so each
  // profile is scraped to exactly its own window. Apify bills per result, and
  // `onlyPostsNewerThan` is a single run-wide value, so fetching every profile
  // to the widest window would make a short-window channel pay to re-scrape
  // posts that get discarded again on store. Channels sharing a window are still
  // batched into one actor run; the common case (all channels on the global
  // default) collapses to a single group — identical to one batched run. Groups
  // run concurrently, so wall-clock stays the slowest single run, not the sum.
  const channelByHandle = new Map(
    channels.map((c) => [
      c.handle.toLowerCase(),
      { id: c.id, lookback: effectiveLookbackDays(c.lookbackDays, opts.windowDays) },
    ]),
  );

  const handlesByLookback = new Map<number, string[]>();
  for (const c of channels) {
    const lookback = effectiveLookbackDays(c.lookbackDays, opts.windowDays);
    const group = handlesByLookback.get(lookback);
    if (group) group.push(c.handle);
    else handlesByLookback.set(lookback, [c.handle]);
  }

  const batches = await Promise.all(
    [...handlesByLookback.entries()].map(([lookback, handles]) =>
      fetchInstagramPosts(handles, {
        token: apifyToken,
        actor: opts.actor,
        resultsLimit: opts.resultsLimit,
        onlyPostsNewerThanDays: lookback,
      }),
    ),
  );
  const posts = batches.flat();

  // Map each post to its channel via ownerUsername; skip posts with no matching
  // active channel, or older than that channel's window (authoritative filter).
  let unmatched = 0;
  const values = posts
    .map((p: NormalizedSocialPost) => {
      const channel = p.ownerUsername ? channelByHandle.get(p.ownerUsername) : undefined;
      if (!channel) {
        unmatched++;
        return null;
      }
      if (!withinLookback(p.postedAt, channel.lookback)) return null;
      const channelId = channel.id;
      return {
        channelId,
        externalId: p.externalId,
        url: p.url,
        postedAt: p.postedAt,
        caption: p.caption,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        mediaType: p.mediaType,
        imageUrl: p.imageUrl,
        raw: p.raw,
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (values.length === 0) {
    return { channels: channels.length, fetched: posts.length, created: 0, updated: 0, unmatched, ms: Date.now() - startedAt };
  }

  // Single bulk UPSERT. The SET list deliberately omits the LLM analysis
  // columns; `xmax = 0` distinguishes a freshly inserted row from an updated
  // one (same marker used by events/sync.ts).
  const upserted = await db
    .insert(socialPosts)
    .values(values)
    .onConflictDoUpdate({
      target: [socialPosts.channelId, socialPosts.externalId],
      set: {
        url: sql`excluded.url`,
        postedAt: sql`excluded.posted_at`,
        caption: sql`excluded.caption`,
        likeCount: sql`excluded.like_count`,
        commentCount: sql`excluded.comment_count`,
        mediaType: sql`excluded.media_type`,
        imageUrl: sql`excluded.image_url`,
        raw: sql`excluded.raw`,
        fetchedAt: sql`NOW()`,
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });

  const created = upserted.reduce((n, r) => n + (r.inserted ? 1 : 0), 0);

  // KEIN Retention-Prune mehr (Audit 2026-07-21): der Schalter war nie
  // eingeschaltet, hätte bei 91 Posts / 792 kB nach sechs Wochen auch nichts
  // begrenzt — der Abrufzeitraum tut das schon — und war ohne Kopplung an die
  // anderen Fenster validiert: eine Retention unterhalb des
  // Auswertungszeitraums hätte dem Lagebild bei jedem Refresh kommentarlos
  // die Datenbasis gelöscht. Migration 20260721000003.

  return {
    channels: channels.length,
    fetched: posts.length,
    created,
    updated: upserted.length - created,
    unmatched,
    ms: Date.now() - startedAt,
  };
}
