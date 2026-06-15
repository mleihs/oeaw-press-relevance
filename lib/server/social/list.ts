// Read layer for the social monitor. Pure SELECTs — the /social page and the
// settings channel card read through here; no external calls, no cost.

import { asc, eq, ne, sql } from 'drizzle-orm';
import {
  db,
  socialChannels,
  socialPosts,
  socialThemeSnapshots,
  socialRefreshRuns,
  descNullsLast,
} from '@/lib/server/db';
import type {
  SocialChannel,
  SocialChannelWithPosts,
  SocialCostSummary,
  SocialThemeSnapshot,
} from '@/lib/shared/types';
import {
  socialChannelToApi,
  socialPostToApi,
  socialThemeSnapshotToApi,
} from './to-api';
import { effectiveLookbackDays, withinLookback } from './window';

/** Max posts shown per channel on the overview page. */
const POSTS_PER_CHANNEL = 24;

/**
 * Active channels with their recent posts (newest first), each trimmed to the
 * channel's effective look-back window. `globalDefaultDays` is the fallback for
 * channels with no per-channel override.
 */
export async function listChannelsWithRecentPosts(
  globalDefaultDays: number,
): Promise<SocialChannelWithPosts[]> {
  const rows = await db.query.socialChannels.findMany({
    where: eq(socialChannels.active, true),
    orderBy: asc(socialChannels.handle),
    with: {
      socialPosts: {
        orderBy: descNullsLast(socialPosts.postedAt),
        limit: POSTS_PER_CHANNEL,
      },
    },
  });

  return rows.map((row) => {
    const days = effectiveLookbackDays(row.lookbackDays, globalDefaultDays);
    const posts = (row.socialPosts ?? [])
      .filter((p) => withinLookback(p.postedAt, days))
      .map(socialPostToApi);
    return { ...socialChannelToApi(row), posts };
  });
}

/** All channels (active + inactive), for the settings management card. */
export async function listChannels(): Promise<SocialChannel[]> {
  const rows = await db.query.socialChannels.findMany({
    orderBy: asc(socialChannels.handle),
  });
  return rows.map(socialChannelToApi);
}

/** The most recent theme snapshot, or null if none has been generated yet. */
export async function getLatestThemeSnapshot(): Promise<SocialThemeSnapshot | null> {
  const row = await db.query.socialThemeSnapshots.findFirst({
    orderBy: descNullsLast(socialThemeSnapshots.createdAt),
  });
  return row ? socialThemeSnapshotToApi(row) : null;
}

/** Accumulated feature cost across all real (non-skipped) refresh runs. */
export async function getRefreshCostSummary(): Promise<SocialCostSummary> {
  const [agg] = await db
    .select({
      total: sql<string>`coalesce(sum(${socialRefreshRuns.apifyCostUsd} + ${socialRefreshRuns.llmCostUsd}), 0)`,
      apify: sql<string>`coalesce(sum(${socialRefreshRuns.apifyCostUsd}), 0)`,
      llm: sql<string>`coalesce(sum(${socialRefreshRuns.llmCostUsd}), 0)`,
      tokens: sql<string>`coalesce(sum(${socialRefreshRuns.llmTokens}), 0)`,
      runs: sql<string>`count(*)`,
      lastRunAt: sql<string | null>`max(${socialRefreshRuns.createdAt})`,
    })
    .from(socialRefreshRuns)
    .where(ne(socialRefreshRuns.status, 'skipped'));

  return {
    total_usd: Number(agg?.total ?? 0),
    apify_usd: Number(agg?.apify ?? 0),
    llm_usd: Number(agg?.llm ?? 0),
    llm_tokens: Number(agg?.tokens ?? 0),
    runs: Number(agg?.runs ?? 0),
    last_run_at: agg?.lastRunAt ?? null,
  };
}

/** Timestamp of the last successful refresh, for the throttle. Null if none. */
export async function getLastCompletedRefreshAt(): Promise<string | null> {
  const [row] = await db
    .select({ at: sql<string | null>`max(${socialRefreshRuns.createdAt})` })
    .from(socialRefreshRuns)
    .where(eq(socialRefreshRuns.status, 'complete'));
  return row?.at ?? null;
}
