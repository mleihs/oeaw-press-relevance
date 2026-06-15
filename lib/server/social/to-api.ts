// Drizzle row → wire DTO mappers for the social monitor (ADR 0003: per-feature
// toApi). A column rename surfaces here as a tsc error.

import type {
  SocialChannel,
  SocialPost,
  SocialTheme,
  SocialThemeSnapshot,
} from '@/lib/shared/types';
import {
  socialChannels as socialChannelsTable,
  socialPosts as socialPostsTable,
  socialThemeSnapshots as socialThemeSnapshotsTable,
} from '@/lib/server/db';

export function socialChannelToApi(
  row: typeof socialChannelsTable.$inferSelect,
): SocialChannel {
  return {
    id: row.id,
    platform: row.platform,
    handle: row.handle,
    display_name: row.displayName,
    url: row.url,
    active: row.active,
    lookback_days: row.lookbackDays,
    created_at: row.createdAt,
  };
}

export function socialPostToApi(
  row: typeof socialPostsTable.$inferSelect,
): SocialPost {
  return {
    id: row.id,
    channel_id: row.channelId,
    external_id: row.externalId,
    url: row.url,
    posted_at: row.postedAt,
    caption: row.caption,
    like_count: row.likeCount,
    comment_count: row.commentCount,
    media_type: row.mediaType,
    image_url: row.imageUrl,
    topic: row.topic,
    keywords: row.keywords ?? [],
    summary_de: row.summaryDe,
    analysis_status: row.analysisStatus,
    llm_model: row.llmModel,
    analyzed_at: row.analyzedAt,
  };
}

export function socialThemeSnapshotToApi(
  row: typeof socialThemeSnapshotsTable.$inferSelect,
): SocialThemeSnapshot {
  return {
    id: row.id,
    created_at: row.createdAt,
    window_days: row.windowDays,
    post_count: row.postCount,
    channel_count: row.channelCount,
    // `themes` is a jsonb column typed as `unknown` by Drizzle; it is written
    // only by regenerateThemeSnapshot() in the documented SocialTheme shape.
    themes: (row.themes as SocialTheme[] | null) ?? [],
    narrative_de: row.narrativeDe,
    llm_model: row.llmModel,
  };
}
