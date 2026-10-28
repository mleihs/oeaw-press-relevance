// Ingest-Run-Protokoll (Cursor/High-Water-Mark je Feed). Hand-gespiegelt aus
// supabase/migrations/20260710000001_publications_delta_ingest.sql — Quelle der
// Wahrheit bleibt die Migration. UNIQUE(feed, generated_at_timestamp) macht die
// Delta-Anwendung idempotent (Skip-if-applied in apply_publications_delta()).
import { pgTable, index, unique, check, uuid, text, timestamp, bigint, jsonb, integer, numeric, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const ingestRuns = pgTable("ingest_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	feed: text().notNull(),
	generatedAtTimestamp: bigint("generated_at_timestamp", { mode: 'number' }).notNull(),
	generatedAtReadable: text("generated_at_readable"),
	appliedAt: timestamp("applied_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	status: text().default('applied').notNull(),
	sourceLabel: text("source_label"),
	report: jsonb().default({}).notNull(),
}, (table) => [
	index("idx_ingest_runs_feed_ts").using("btree", table.feed.asc().nullsLast().op("text_ops"), table.generatedAtTimestamp.desc().nullsFirst().op("int8_ops")),
	unique("ingest_runs_feed_gen_unique").on(table.feed, table.generatedAtTimestamp),
	check("ingest_runs_status_check", sql`status = ANY (ARRAY['applied'::text, 'skipped'::text, 'failed'::text])`),
]);

// Journal der Bewertungsläufe (lib/server/scoring/journal.ts). Hand-gespiegelt
// aus supabase/migrations/20261028000001_scoring_runs.sql, Quelle der Wahrheit
// bleibt die Migration. Die numeric-Spalten im Modus 'number': Postgres liefert
// numeric als String, Drizzle wandelt beim Lesen um (sonst rechnet die Kachel
// mit "9.8000").
export const scoringRuns = pgTable("scoring_runs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	entity: text().notNull(),
	trigger: text().notNull(),
	status: text().default('running').notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	model: text().notNull(),
	modelTag: text("model_tag").notNull(),
	effort: text().notNull(),
	candidates: integer().default(0).notNull(),
	scored: integer().default(0).notNull(),
	failed: integer().default(0).notNull(),
	skipped: integer().default(0).notNull(),
	haikuRejected: integer("haiku_rejected").default(0).notNull(),
	lektoratFlags: integer("lektorat_flags").default(0).notNull(),
	lektoratChanges: integer("lektorat_changes").default(0).notNull(),
	costUsd: numeric("cost_usd", { precision: 10, scale: 4, mode: 'number' }).default(0).notNull(),
	costCapUsd: numeric("cost_cap_usd", { precision: 10, scale: 2, mode: 'number' }),
	costCapHit: boolean("cost_cap_hit").default(false).notNull(),
	medianScore: numeric("median_score", { precision: 6, scale: 4, mode: 'number' }),
	summary: text(),
	errorClass: text("error_class"),
	errorMessage: text("error_message"),
	report: jsonb().default({}).notNull(),
}, (table) => [
	index("idx_scoring_runs_entity_started").using("btree", table.entity.asc().nullsLast().op("text_ops"), table.startedAt.desc().nullsFirst().op("timestamptz_ops")),
	check("scoring_runs_entity_check", sql`entity = ANY (ARRAY['publications'::text, 'events'::text])`),
	check("scoring_runs_trigger_check", sql`trigger = ANY (ARRAY['nightly'::text, 'button'::text, 'cli'::text, 'compare'::text])`),
	check("scoring_runs_status_check", sql`status = ANY (ARRAY['running'::text, 'ok'::text, 'partial'::text, 'failed'::text, 'skipped'::text])`),
]);
