// Ingest-Run-Protokoll (Cursor/High-Water-Mark je Feed). Hand-gespiegelt aus
// supabase/migrations/20260710000001_publications_delta_ingest.sql — Quelle der
// Wahrheit bleibt die Migration. UNIQUE(feed, generated_at_timestamp) macht die
// Delta-Anwendung idempotent (Skip-if-applied in apply_publications_delta()).
import { pgTable, index, unique, check, uuid, text, timestamp, bigint, jsonb, pgPolicy } from "drizzle-orm/pg-core"
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
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);
