// Publikations-Kern: publications-Tabelle (Scoring + Triage), Embeddings,
// Press-Cluster-Centroid, Review-Sessions, Publikations-Junctions und die
// materialisierte ÖSTAT-Zuordnung.
import { pgTable, index, uniqueIndex, unique, check, uuid, text, timestamp, foreignKey, integer, boolean, date, doublePrecision, jsonb, vector, primaryKey, pgPolicy, pgMaterializedView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { publicationTypes, orgunits, persons, projects } from "./webdb"

export const publicationEmbeddings = pgTable("publication_embeddings", {
	publicationId: uuid("publication_id").primaryKey().notNull(),
	model: text().notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sourceTextHash: text("source_text_hash"),
}, (table) => [
	index("publication_embeddings_cosine_ivfflat").using("ivfflat", table.embedding.asc().nullsLast().op("vector_cosine_ops")).with({lists: "50"}),
	index("publication_embeddings_model_idx").using("btree", table.model.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.publicationId],
			foreignColumns: [publications.id],
			name: "publication_embeddings_publication_id_fkey"
		}).onDelete("cascade"),
	check("publication_embeddings_model_chk", sql`model <> ''::text`),
]);

export const pressClusterCentroid = pgTable("press_cluster_centroid", {
	model: text().primaryKey().notNull(),
	centroid: vector({ dimensions: 768 }).notNull(),
	nSamples: integer("n_samples").notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const reviewSessions = pgTable("review_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).notNull(),
	attendees: text().array(),
	facilitator: text(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_review_sessions_occurred_at").using("btree", table.occurredAt.desc().nullsFirst().op("timestamptz_ops")),
]);

export const publications = pgTable("publications", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: text().notNull(),
	abstract: text(),
	doi: text(),
	publishedAt: date("published_at"),
	publicationType: text("publication_type"),
	openAccess: boolean("open_access").default(false),
	oaType: text("oa_type"),
	url: text(),
	citation: text(),
	csvUid: text("csv_uid"),
	enrichmentStatus: text("enrichment_status").default('pending'),
	enrichedAbstract: text("enriched_abstract"),
	enrichedKeywords: text("enriched_keywords").array(),
	enrichedJournal: text("enriched_journal"),
	enrichedSource: text("enriched_source"),
	fullTextSnippet: text("full_text_snippet"),
	wordCount: integer("word_count").default(0),
	analysisStatus: text("analysis_status").default('pending'),
	pressScore: doublePrecision("press_score"),
	publicAccessibility: doublePrecision("public_accessibility"),
	societalRelevance: doublePrecision("societal_relevance"),
	noveltyFactor: doublePrecision("novelty_factor"),
	storytellingPotential: doublePrecision("storytelling_potential"),
	mediaTimeliness: doublePrecision("media_timeliness"),
	pitchSuggestion: text("pitch_suggestion"),
	targetAudience: text("target_audience"),
	suggestedAngle: text("suggested_angle"),
	reasoning: text(),
	llmModel: text("llm_model"),
	analysisCost: doublePrecision("analysis_cost"),
	importBatch: text("import_batch"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	webdbUid: integer("webdb_uid"),
	originalTitle: text("original_title"),
	summaryDe: text("summary_de"),
	summaryEn: text("summary_en"),
	peerReviewed: boolean("peer_reviewed").default(false).notNull(),
	popularScience: boolean("popular_science").default(false).notNull(),
	openAccessStatus: text("open_access_status"),
	leadAuthor: text("lead_author"),
	websiteLink: text("website_link"),
	downloadLink: text("download_link"),
	doiLink: text("doi_link"),
	ris: text(),
	bibtex: text(),
	endnote: text(),
	citationApa: text("citation_apa"),
	citationDe: text("citation_de"),
	citationEn: text("citation_en"),
	publicationTypeId: uuid("publication_type_id"),
	webdbTstamp: timestamp("webdb_tstamp", { withTimezone: true, mode: 'string' }),
	webdbCrdate: timestamp("webdb_crdate", { withTimezone: true, mode: 'string' }),
	archived: boolean().default(false).notNull(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }),
	haiku: text(),
	meistertaskTaskId: text("meistertask_task_id"),
	meistertaskTaskToken: text("meistertask_task_token"),
	isItaSubtree: boolean("is_ita_subtree").default(false).notNull(),
	decision: text().default('undecided').notNull(),
	decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
	decidedBy: text("decided_by"),
	decisionRationale: text("decision_rationale"),
	snoozeUntil: date("snooze_until"),
	flagNotes: jsonb("flag_notes").default([]).notNull(),
	decidedInSession: uuid("decided_in_session"),
	pressSimilarity: doublePrecision("press_similarity"),
}, (table) => [
	index("idx_pub_analysis").using("btree", table.analysisStatus.asc().nullsLast().op("text_ops")),
	index("idx_pub_analysis_score").using("btree", table.analysisStatus.asc().nullsLast().op("text_ops"), table.pressScore.desc().nullsLast().op("float8_ops")),
	index("idx_pub_analyzed_window").using("btree", table.publishedAt.asc().nullsLast().op("date_ops"), table.pressScore.asc().nullsLast().op("date_ops")).where(sql`((analysis_status = 'analyzed'::text) AND (press_score IS NOT NULL))`),
	index("idx_pub_archived").using("btree", table.archived.asc().nullsLast().op("bool_ops")).where(sql`(archived = true)`),
	index("idx_pub_date").using("btree", table.publishedAt.desc().nullsFirst().op("date_ops")),
	index("idx_pub_doi").using("btree", table.doi.asc().nullsLast().op("text_ops")),
	index("idx_pub_enrichment").using("btree", table.enrichmentStatus.asc().nullsLast().op("text_ops")),
	index("idx_pub_enrichment_created").using("btree", table.enrichmentStatus.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("idx_pub_keywords_gin").using("gin", table.enrichedKeywords.asc().nullsLast().op("array_ops")),
	index("idx_pub_lead_author_trgm").using("gin", table.leadAuthor.asc().nullsLast().op("gin_trgm_ops")).where(sql`((lead_author IS NOT NULL) AND (lead_author <> ''::text))`),
	index("idx_pub_original_title_trgm").using("gin", table.originalTitle.asc().nullsLast().op("gin_trgm_ops")).where(sql`((original_title IS NOT NULL) AND (original_title <> ''::text))`),
	index("idx_pub_peer_reviewed").using("btree", table.peerReviewed.asc().nullsLast().op("bool_ops")).where(sql`(peer_reviewed = true)`),
	index("idx_pub_popular_science").using("btree", table.popularScience.asc().nullsLast().op("bool_ops")).where(sql`(popular_science = true)`),
	index("idx_pub_score").using("btree", table.pressScore.desc().nullsFirst().op("float8_ops")),
	index("idx_pub_title").using("gin", table.title.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_pub_type").using("btree", table.publicationTypeId.asc().nullsLast().op("uuid_ops")),
	index("idx_publications_decided_in_session").using("btree", table.decidedInSession.asc().nullsLast().op("uuid_ops")).where(sql`(decided_in_session IS NOT NULL)`),
	index("idx_publications_decision").using("btree", table.decision.asc().nullsLast().op("text_ops")),
	index("idx_publications_meistertask_task_id").using("btree", table.meistertaskTaskId.asc().nullsLast().op("text_ops")).where(sql`(meistertask_task_id IS NOT NULL)`),
	index("idx_publications_snooze").using("btree", table.snoozeUntil.asc().nullsLast().op("date_ops")).where(sql`(snooze_until IS NOT NULL)`),
	index("idx_pubs_not_ita_subtree").using("btree", table.isItaSubtree.asc().nullsLast().op("bool_ops")).where(sql`(is_ita_subtree = false)`),
	uniqueIndex("publications_doi_unique_not_null").using("btree", table.doi.asc().nullsLast().op("text_ops")).where(sql`(doi IS NOT NULL)`),
	index("publications_press_similarity_idx").using("btree", table.pressSimilarity.desc().nullsLast().op("float8_ops")),
	uniqueIndex("publications_webdb_uid_unique").using("btree", table.webdbUid.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.publicationTypeId],
			foreignColumns: [publicationTypes.id],
			name: "publications_publication_type_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.decidedInSession],
			foreignColumns: [reviewSessions.id],
			name: "publications_decided_in_session_fkey"
		}).onDelete("set null"),
	unique("publications_csv_uid_unique").on(table.csvUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
	check("publications_decision_check", sql`decision = ANY (ARRAY['undecided'::text, 'pitch'::text, 'hold'::text, 'skip'::text])`),
	check("publications_enrichment_status_check", sql`(enrichment_status IS NULL) OR (enrichment_status = ANY (ARRAY['pending'::text, 'enriched'::text, 'partial'::text, 'failed'::text]))`),
	check("publications_analysis_status_check", sql`(analysis_status IS NULL) OR (analysis_status = ANY (ARRAY['pending'::text, 'analyzed'::text, 'failed'::text]))`),
	check("publications_press_score_range", sql`(press_score IS NULL) OR (press_score >= 0 AND press_score <= 1)`),
	check("publications_dimensions_range", sql`(public_accessibility IS NULL OR (public_accessibility >= 0 AND public_accessibility <= 1)) AND (societal_relevance IS NULL OR (societal_relevance >= 0 AND societal_relevance <= 1)) AND (novelty_factor IS NULL OR (novelty_factor >= 0 AND novelty_factor <= 1)) AND (storytelling_potential IS NULL OR (storytelling_potential >= 0 AND storytelling_potential <= 1)) AND (media_timeliness IS NULL OR (media_timeliness >= 0 AND media_timeliness <= 1))`),
]);

export const publicationProjects = pgTable("publication_projects", {
	publicationId: uuid("publication_id").notNull(),
	projectId: uuid("project_id").notNull(),
	sorting: integer(),
}, (table) => [
	index("idx_pub_projects_project").using("btree", table.projectId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.publicationId],
			foreignColumns: [publications.id],
			name: "publication_projects_publication_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "publication_projects_project_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.publicationId, table.projectId], name: "publication_projects_pkey"}),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const orgunitPublications = pgTable("orgunit_publications", {
	orgunitId: uuid("orgunit_id").notNull(),
	publicationId: uuid("publication_id").notNull(),
	highlight: boolean().default(false).notNull(),
	sorting: integer(),
}, (table) => [
	index("idx_orgunit_pubs_pub").using("btree", table.publicationId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.orgunitId],
			foreignColumns: [orgunits.id],
			name: "orgunit_publications_orgunit_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.publicationId],
			foreignColumns: [publications.id],
			name: "orgunit_publications_publication_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.orgunitId, table.publicationId], name: "orgunit_publications_pkey"}),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const personPublications = pgTable("person_publications", {
	personId: uuid("person_id").notNull(),
	publicationId: uuid("publication_id").notNull(),
	highlight: boolean().default(false).notNull(),
	mahighlight: boolean().default(false).notNull(),
	authorship: text(),
	sorting: integer(),
}, (table) => [
	index("idx_person_pubs_highlight").using("btree", table.publicationId.asc().nullsLast().op("uuid_ops")).where(sql`((highlight = true) OR (mahighlight = true))`),
	index("idx_person_pubs_pub").using("btree", table.publicationId.asc().nullsLast().op("uuid_ops"), table.personId.asc().nullsLast().op("uuid_ops"), table.authorship.asc().nullsLast().op("uuid_ops"), table.mahighlight.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [persons.id],
			name: "person_publications_person_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.publicationId],
			foreignColumns: [publications.id],
			name: "person_publications_publication_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.personId, table.publicationId], name: "person_publications_pkey"}),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const publicationOestat6 = pgMaterializedView("publication_oestat6", {	publicationId: uuid("publication_id"),
	oestat6Id: uuid("oestat6_id"),
}).as(sql`SELECT DISTINCT pp.publication_id, po.oestat6_id FROM person_publications pp JOIN person_oestat6 po ON pp.person_id = po.person_id`);
