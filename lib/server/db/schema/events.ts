// Events (Veranstaltungsbetrieb): TYPO3-Mirror + LLM-Analyse-Spalten und die
// append-only Score-Gewichtungs-Historie.
import { pgTable, index, unique, check, uuid, text, timestamp, integer, doublePrecision, jsonb, bigserial } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// Local mirror of upcoming TYPO3 events. Populated from MySQL via
// POST /api/events/sync; maintainer columns (decision, decided_at,
// flag_notes) preserved across re-syncs by construction (UPSERT SET list
// excludes them). See supabase/migrations/20260526000001_events.sql for
// the canonical schema definition + the trg_events_decided_at_sync
// trigger that auto-stamps decided_at on decision transitions.
export const events = pgTable("events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	title: text().notNull(),
	teaser: text(),
	bodytext: text(),
	eventInformation: text("event_information"),
	eventAt: timestamp("event_at", { withTimezone: true, mode: 'string' }).notNull(),
	eventEndAt: timestamp("event_end_at", { withTimezone: true, mode: 'string' }),
	locationTitle: text("location_title"),
	organizerTitle: text("organizer_title"),
	institute: text(),
	url: text(),
	lang: text(),
	availableLangs: text("available_langs").array().notNull().default([]),
	decision: text().default('undecided').notNull(),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	flagNotes: jsonb("flag_notes").default([]).notNull(),
	// LLM relevance analysis (Veranstaltungsbetrieb). Migration
	// 20260616000001_events_analysis.sql; NOT in the sync UPSERT SET → survives re-sync.
	analysisStatus: text("analysis_status").default('pending'),
	eventScore: doublePrecision("event_score"),
	publicAppeal: doublePrecision("public_appeal"),
	scientificSignificance: doublePrecision("scientific_significance"),
	reach: doublePrecision(),
	timeliness: doublePrecision(),
	pitchSuggestion: text("pitch_suggestion"),
	suggestedAngle: text("suggested_angle"),
	targetAudience: text("target_audience"),
	reasoning: text(),
	llmModel: text("llm_model"),
	analysisCost: doublePrecision("analysis_cost"),
	analyzedAt: timestamp("analyzed_at", { withTimezone: true, mode: 'string' }),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_events_decision").using("btree", table.decision.asc().nullsLast().op("text_ops")),
	index("idx_events_event_at").using("btree", table.eventAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_events_institute").using("btree", table.institute.asc().nullsLast().op("text_ops")).where(sql`institute IS NOT NULL`),
	index("idx_events_analysis").using("btree", table.analysisStatus.asc().nullsLast().op("text_ops")),
	index("idx_events_analysis_score").using("btree", table.analysisStatus.asc().nullsLast().op("text_ops"), table.eventScore.desc().nullsLast().op("float8_ops")),
	unique("events_webdb_uid_key").on(table.webdbUid),
	check("events_decision_check", sql`decision = ANY (ARRAY['undecided'::text, 'pitch'::text, 'hold'::text, 'skip'::text])`),
	check("events_lang_check", sql`(lang IS NULL) OR (lang = ANY (ARRAY['de'::text, 'en'::text, 'mul'::text]))`),
	check("events_analysis_status_check", sql`analysis_status IS NULL OR analysis_status = ANY (ARRAY['pending'::text, 'analyzed'::text, 'failed'::text])`),
]);

// Append-only history of event-score weightings. Current = latest row; saving
// new weights inserts a row, reverting re-applies an old config as a new row.
export const eventScoreWeights = pgTable("event_score_weights", {
	id: bigserial({ mode: 'number' }).primaryKey().notNull(),
	publicAppeal: doublePrecision("public_appeal").notNull(),
	scientificSignificance: doublePrecision("scientific_significance").notNull(),
	reach: doublePrecision("reach").notNull(),
	timeliness: doublePrecision("timeliness").notNull(),
	note: text(),
	recomputedCount: integer("recomputed_count"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_event_score_weights_created_at").on(table.createdAt.desc()),
]);
