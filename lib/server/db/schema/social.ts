import { pgTable, index, unique, check, uuid, text, timestamp, foreignKey, integer, boolean, doublePrecision, jsonb, smallint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// ===========================================================================
// Social-media monitoring ("Lagebild" — /social). Channels are maintained via
// Settings; posts are fetched from Apify and analyzed once by the LLM (topic /
// keywords / summary). The page is a pure DB read — fetching + analysis cost
// only on an explicit refresh, logged in social_refresh_runs (cost + throttle).
// Migration: supabase/migrations/20260615000001_social_media.sql. Tables are
// hand-mirrored here (NOT db:introspect — it renames existing relations).
// ===========================================================================

export const socialChannels = pgTable("social_channels", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	platform: text().default('instagram').notNull(),
	handle: text().notNull(),
	displayName: text("display_name"),
	url: text().notNull(),
	active: boolean().default(true).notNull(),
	// Per-channel look-back override (days) for the fetch + display/aggregation
	// window. NULL = inherit the global default (social_settings.fetch_window_days); cadences
	// differ, so a specific channel can widen/narrow its own window.
	lookbackDays: integer("lookback_days"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("social_channels_platform_handle_key").on(table.platform, table.handle),
	check("social_channels_platform_check", sql`platform = 'instagram'::text`),
	check("social_channels_lookback_days_check", sql`(lookback_days IS NULL) OR (lookback_days >= 1 AND lookback_days <= 365)`),
]);

export const socialPosts = pgTable("social_posts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	channelId: uuid("channel_id").notNull(),
	externalId: text("external_id").notNull(),
	url: text(),
	postedAt: timestamp("posted_at", { withTimezone: true, mode: 'string' }),
	caption: text(),
	likeCount: integer("like_count"),
	commentCount: integer("comment_count"),
	mediaType: text("media_type"),
	imageUrl: text("image_url"),
	imagePath: text("image_path"),
	raw: jsonb().default({}).notNull(),
	fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	topic: text(),
	keywords: text().array().default([]).notNull(),
	summaryDe: text("summary_de"),
	analysisStatus: text("analysis_status").default('pending').notNull(),
	llmModel: text("llm_model"),
	analyzedAt: timestamp("analyzed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_social_posts_posted_at").using("btree", table.postedAt.desc().nullsLast().op("timestamptz_ops")),
	index("idx_social_posts_analysis_status").using("btree", table.analysisStatus.asc().nullsLast().op("text_ops")),
	index("idx_social_posts_channel").using("btree", table.channelId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
		columns: [table.channelId],
		foreignColumns: [socialChannels.id],
		name: "social_posts_channel_id_fkey"
	}).onDelete("cascade"),
	unique("social_posts_channel_external_key").on(table.channelId, table.externalId),
	check("social_posts_analysis_status_check", sql`analysis_status = ANY (ARRAY['pending'::text, 'analyzed'::text, 'failed'::text])`),
]);

export const socialThemeSnapshots = pgTable("social_theme_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	windowDays: integer("window_days").notNull(),
	postCount: integer("post_count").default(0).notNull(),
	channelCount: integer("channel_count").default(0).notNull(),
	themes: jsonb().default([]).notNull(),
	narrativeDe: text("narrative_de"),
	llmModel: text("llm_model"),
}, (table) => [
	index("idx_social_theme_snapshots_created_at").using("btree", table.createdAt.desc().nullsLast().op("timestamptz_ops")),
]);

export const socialRefreshRuns = pgTable("social_refresh_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	triggeredBy: text("triggered_by").default('ui').notNull(),
	postsFetched: integer("posts_fetched").default(0).notNull(),
	postsNew: integer("posts_new").default(0).notNull(),
	postsAnalyzed: integer("posts_analyzed").default(0).notNull(),
	apifyCostUsd: doublePrecision("apify_cost_usd").default(0).notNull(),
	llmCostUsd: doublePrecision("llm_cost_usd").default(0).notNull(),
	llmTokens: integer("llm_tokens").default(0).notNull(),
	llmModel: text("llm_model"),
	durationMs: integer("duration_ms"),
	status: text().default('complete').notNull(),
	error: text(),
}, (table) => [
	index("idx_social_refresh_runs_created_at").using("btree", table.createdAt.desc().nullsLast().op("timestamptz_ops")),
	check("social_refresh_runs_status_check", sql`status = ANY (ARRAY['complete'::text, 'error'::text, 'skipped'::text])`),
]);

// Global, team-wide social-monitor settings (singleton row id=1). Migration:
// supabase/migrations/20260615000002_social_settings.sql.
export const socialSettings = pgTable("social_settings", {
	id: smallint().default(1).primaryKey().notNull(),
	fetchWindowDays: integer("fetch_window_days").default(14).notNull(),
	freshWindowDays: integer("fresh_window_days").default(7).notNull(),
	themeWindowDays: integer("theme_window_days").default(14).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	check("social_settings_singleton", sql`id = 1`),
	check("social_settings_fresh_check", sql`fresh_window_days >= 1 AND fresh_window_days <= 365`),
	check("social_settings_theme_check", sql`theme_window_days >= 1 AND theme_window_days <= 365`),
	check("social_settings_fetch_check", sql`fetch_window_days >= 1 AND fetch_window_days <= 365`),
	// Kette: abgerufen ⊇ ausgewertet ⊇ frisch (Migration 20260721000003).
	check("social_settings_window_order_check", sql`fresh_window_days <= theme_window_days AND theme_window_days <= fetch_window_days`),
]);
