/** Social-media monitoring ("Lagebild" — /social). Wire DTOs (snake_case + ISO
 *  strings), mapped from Drizzle rows in lib/server/social/to-api.ts. */

export interface SocialChannel {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  url: string;
  active: boolean;
  /** Per-channel look-back override (days); null = inherit the global default. */
  lookback_days: number | null;
  created_at: string;
}

export interface SocialPost {
  id: string;
  channel_id: string;
  external_id: string;
  url: string | null;
  posted_at: string | null;
  caption: string | null;
  like_count: number | null;
  comment_count: number | null;
  media_type: string | null;
  image_url: string | null;
  topic: string | null;
  keywords: string[];
  summary_de: string | null;
  analysis_status: string;
  llm_model: string | null;
  analyzed_at: string | null;
}

/** One aggregated topic in a snapshot's `themes` array. */
export interface SocialTheme {
  theme: string;
  description: string;
  channels: string[];
  post_count: number;
  keywords: string[];
  /** IDs of the posts the LLM assigned to this theme. Optional: snapshots
   *  created before this field shipped won't have it (UI falls back to
   *  keyword matching). */
  post_ids?: string[];
}

export interface SocialThemeSnapshot {
  id: string;
  created_at: string;
  window_days: number;
  post_count: number;
  channel_count: number;
  themes: SocialTheme[];
  narrative_de: string | null;
  llm_model: string | null;
}

/** A channel with its recent posts — the shape the /social page renders. */
export interface SocialChannelWithPosts extends SocialChannel {
  posts: SocialPost[];
}

/** Global team-wide social-monitor settings (singleton). */
export interface SocialSettings {
  /** Posts newer than this show by default; older sit behind a control. */
  fresh_window_days: number;
  /** Window of posts fed to the LLM theme snapshot on refresh. */
  theme_window_days: number;
  /** null = keep everything; else prune posts older than this on refresh. */
  retention_days: number | null;
  updated_at: string;
}

/** Accumulated feature cost, from social_refresh_runs. */
export interface SocialCostSummary {
  total_usd: number;
  apify_usd: number;
  llm_usd: number;
  llm_tokens: number;
  runs: number;
  last_run_at: string | null;
}
