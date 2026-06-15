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

export class SocialSyncConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SocialSyncConfigError';
  }
}

export interface SocialSyncOptions {
  /** APIFY_TOKEN. Falsy → SocialSyncConfigError (route maps to 503). */
  apifyToken: string | undefined;
  /** Store actor id; defaults to apify~instagram-scraper. */
  actor?: string;
  /** Hard cap on posts fetched per channel (bounds cost). */
  resultsLimit?: number;
  /** Global default look-back (days) for channels with no per-channel override. */
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

  // Resolve each channel's effective window; fetch up to the widest one (one
  // batched Apify run), then enforce each channel's own window on store.
  const channelByHandle = new Map(
    channels.map((c) => [
      c.handle.toLowerCase(),
      { id: c.id, lookback: effectiveLookbackDays(c.lookbackDays, opts.windowDays) },
    ]),
  );
  const maxLookback = Math.max(...channels.map((c) => effectiveLookbackDays(c.lookbackDays, opts.windowDays)));

  const posts = await fetchInstagramPosts(
    channels.map((c) => c.handle),
    {
      token: opts.apifyToken,
      actor: opts.actor,
      resultsLimit: opts.resultsLimit,
      onlyPostsNewerThanDays: maxLookback,
    },
  );

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

  return {
    channels: channels.length,
    fetched: posts.length,
    created,
    updated: upserted.length - created,
    unmatched,
    ms: Date.now() - startedAt,
  };
}
