import { pgTable, index, unique, check, uuid, text, timestamp, foreignKey, integer, boolean, pgPolicy, date, bigserial, bigint, uniqueIndex, smallint, jsonb, vector, doublePrecision, primaryKey, pgMaterializedView, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



// id = auth.users(id) — FK (users_id_fkey, ON DELETE CASCADE) lebt nur in der
// Migration 20260703000001, weil auth.users nicht Teil dieses Schemas ist.
// Zeilen entstehen ausschließlich über den Trigger on_auth_user_created.
export const users = pgTable("users", {
	id: uuid().primaryKey().notNull(),
	email: text().notNull(),
	displayName: text("display_name"),
	role: text().default('member').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	disabledAt: timestamp("disabled_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_users_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	unique("users_email_key").on(table.email),
	check("users_role_check", sql`role = ANY (ARRAY['admin'::text, 'member'::text])`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const userSettings = pgTable("user_settings", {
	userId: uuid("user_id").primaryKey().notNull(),
	openrouterApiKey: text("openrouter_api_key"),
	llmDefaultModel: text("llm_default_model"),
	minWordCount: integer("min_word_count").default(100).notNull(),
	batchSize: integer("batch_size").default(3).notNull(),
	infoBubblesEnabled: boolean("info_bubbles_enabled").default(true).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_settings_user_id_fkey"
		}).onDelete("cascade"),
	check("user_settings_batch_size_check", sql`(batch_size >= 1) AND (batch_size <= 5)`),
]);

export const publicationTypes = pgTable("publication_types", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	nameDe: text("name_de").notNull(),
	nameEn: text("name_en").notNull(),
}, (table) => [
	unique("publication_types_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const lectureTypes = pgTable("lecture_types", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	nameDe: text("name_de").notNull(),
	nameEn: text("name_en").notNull(),
}, (table) => [
	unique("lecture_types_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const orgunitTypes = pgTable("orgunit_types", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	nameDe: text("name_de").notNull(),
	nameEn: text("name_en").notNull(),
}, (table) => [
	unique("orgunit_types_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const memberTypes = pgTable("member_types", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	nameDe: text("name_de").notNull(),
	nameEn: text("name_en").notNull(),
}, (table) => [
	unique("member_types_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const oestat6Categories = pgTable("oestat6_categories", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	oestat3: integer().generatedAlwaysAs(sql`(webdb_uid / 1000)`),
	nameDe: text("name_de").notNull(),
	nameEn: text("name_en").notNull(),
}, (table) => [
	index("idx_oestat6_oestat3").using("btree", table.oestat3.asc().nullsLast().op("int4_ops")),
	unique("oestat6_categories_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const orgunits = pgTable("orgunits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	nameDe: text("name_de").notNull(),
	nameEn: text("name_en"),
	akronymDe: text("akronym_de"),
	akronymEn: text("akronym_en"),
	urlDe: text("url_de"),
	urlEn: text("url_en"),
	typeId: uuid("type_id"),
	parentWebdbUid: integer("parent_webdb_uid"),
	parentId: uuid("parent_id"),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_orgunits_akronym").using("btree", table.akronymDe.asc().nullsLast().op("text_ops")),
	index("idx_orgunits_name_trgm").using("gin", table.nameDe.asc().nullsLast().op("gin_trgm_ops")),
	index("idx_orgunits_parent").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.typeId],
			foreignColumns: [orgunitTypes.id],
			name: "orgunits_type_id_fkey"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "orgunits_parent_id_fkey"
		}).onDelete("set null"),
	unique("orgunits_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const extunits = pgTable("extunits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	nameDe: text("name_de").notNull(),
	nameEn: text("name_en"),
	logo: text(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("extunits_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const persons = pgTable("persons", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	firstname: text().notNull(),
	lastname: text().notNull(),
	degreeBefore: text("degree_before"),
	degreeAfter: text("degree_after"),
	degreeNonAcademicDe: text("degree_non_academic_de"),
	degreeNonAcademicEn: text("degree_non_academic_en"),
	biographyDe: text("biography_de"),
	biographyEn: text("biography_en"),
	email: text(),
	emailEn: text("email_en"),
	externalLinkDe: text("external_link_de"),
	externalLinkEn: text("external_link_en"),
	portrait: text(),
	copyright: text(),
	orcid: text(),
	slug: text(),
	oestat3NameDe: text("oestat3_name_de"),
	oestat3NameEn: text("oestat3_name_en"),
	researchFieldNoOestat: text("research_field_no_oestat"),
	researchFields: text("research_fields"),
	selectedPublications: text("selected_publications"),
	memberTypeId: uuid("member_type_id"),
	external: boolean().default(false).notNull(),
	deceased: boolean().default(false).notNull(),
	dateOfDeath: date("date_of_death"),
	vipDe: text("vip_de"),
	vipEn: text("vip_en"),
	useVip: boolean("use_vip").default(false).notNull(),
	selectionyear: integer(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_persons_deceased").using("btree", table.deceased.asc().nullsLast().op("bool_ops")),
	index("idx_persons_email").using("btree", table.email.asc().nullsLast().op("text_ops")).where(sql`((email IS NOT NULL) AND (email <> ''::text))`),
	index("idx_persons_external").using("btree", table.external.asc().nullsLast().op("bool_ops")),
	index("idx_persons_lastname").using("btree", table.lastname.asc().nullsLast().op("text_ops")),
	index("idx_persons_name_trgm").using("gin", sql`(((firstname || ' '::text) || lastname))`),
	index("idx_persons_orcid").using("btree", table.orcid.asc().nullsLast().op("text_ops")).where(sql`((orcid IS NOT NULL) AND (orcid <> ''::text))`),
	foreignKey({
			columns: [table.memberTypeId],
			foreignColumns: [memberTypes.id],
			name: "persons_member_type_id_fkey"
		}).onDelete("set null"),
	unique("persons_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const projects = pgTable("projects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	titleDe: text("title_de"),
	titleEn: text("title_en"),
	summaryDe: text("summary_de"),
	summaryEn: text("summary_en"),
	urlDe: text("url_de"),
	urlEn: text("url_en"),
	thematicFocusDe: text("thematic_focus_de"),
	thematicFocusEn: text("thematic_focus_en"),
	fundingTypeDe: text("funding_type_de"),
	fundingTypeEn: text("funding_type_en"),
	startsOn: date("starts_on"),
	endsOn: date("ends_on"),
	cancelled: boolean().default(false).notNull(),
	typeText: text("type_text"),
	parentWebdbUid: integer("parent_webdb_uid"),
	parentId: uuid("parent_id"),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_projects_active").using("btree", table.endsOn.asc().nullsLast().op("date_ops")).where(sql`(cancelled = false)`),
	index("idx_projects_parent").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
	index("idx_projects_title_de_trgm").using("gin", table.titleDe.asc().nullsLast().op("gin_trgm_ops")),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "projects_parent_id_fkey"
		}).onDelete("set null"),
	unique("projects_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const lectures = pgTable("lectures", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	webdbUid: integer("webdb_uid").notNull(),
	originalTitle: text("original_title").notNull(),
	lectureDate: date("lecture_date"),
	city: text(),
	eventName: text("event_name"),
	eventType: text("event_type"),
	kind: text(),
	typeId: uuid("type_id"),
	popularScience: boolean("popular_science").default(false).notNull(),
	speaker: text(),
	citation: text(),
	url: text(),
	syncedAt: timestamp("synced_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_lectures_date").using("btree", table.lectureDate.desc().nullsFirst().op("date_ops")),
	index("idx_lectures_popular_science").using("btree", table.popularScience.asc().nullsLast().op("bool_ops")).where(sql`(popular_science = true)`),
	index("idx_lectures_title_trgm").using("gin", table.originalTitle.asc().nullsLast().op("gin_trgm_ops")),
	foreignKey({
			columns: [table.typeId],
			foreignColumns: [lectureTypes.id],
			name: "lectures_type_id_fkey"
		}).onDelete("set null"),
	unique("lectures_webdb_uid_key").on(table.webdbUid),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const pressReleasePromoteLog = pgTable("press_release_promote_log", {
	id: bigserial({ mode: "bigint" }).primaryKey().notNull(),
	ranAt: timestamp("ran_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	promotedN: integer("promoted_n").notNull(),
	source: text(),
});

export const pressReleases = pgTable("press_releases", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	publicationId: uuid("publication_id"),
	doi: text().notNull(),
	url: text().notNull(),
	releasedAt: date("released_at"),
	lang: text(),
	paperTitle: text("paper_title"),
	newsTitle: text("news_title"),
	sourceNewsUid: integer("source_news_uid"),
	abstract: text(),
	authors: text().array(),
	journal: text(),
	paperYear: smallint("paper_year"),
	keywords: text().array(),
	openalexId: text("openalex_id"),
	enrichmentStatus: text("enrichment_status"),
	enrichedAt: timestamp("enriched_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	oeawAuthorMatches: jsonb("oeaw_author_matches").default([]).notNull(),
}, (table) => [
	index("idx_press_releases_orphans").using("btree", table.releasedAt.desc().nullsFirst().op("date_ops")).where(sql`(publication_id IS NULL)`),
	index("idx_press_releases_pub").using("btree", table.publicationId.asc().nullsLast().op("uuid_ops")).where(sql`(publication_id IS NOT NULL)`),
	uniqueIndex("uq_press_releases_doi_lang").using("btree", sql`lower(doi)`, sql`COALESCE(lang, ''::text)`),
	uniqueIndex("uq_press_releases_pub_lang").using("btree", sql`publication_id`, sql`COALESCE(lang, ''::text)`).where(sql`(publication_id IS NOT NULL)`),
	foreignKey({
			columns: [table.publicationId],
			foreignColumns: [publications.id],
			name: "press_releases_publication_id_fkey"
		}).onDelete("set null"),
	check("press_releases_lang_check", sql`(lang IS NULL) OR (lang = ANY (ARRAY['de'::text, 'en'::text]))`),
	check("press_releases_enrichment_status_check", sql`(enrichment_status IS NULL) OR (enrichment_status = ANY (ARRAY['enriched'::text, 'partial'::text, 'failed'::text]))`),
]);

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

export const pressReleaseEmbeddings = pgTable("press_release_embeddings", {
	pressReleaseId: uuid("press_release_id").primaryKey().notNull(),
	model: text().notNull(),
	embedding: vector({ dimensions: 768 }).notNull(),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	sourceTextHash: text("source_text_hash"),
}, (table) => [
	index("press_release_embeddings_model_idx").using("btree", table.model.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.pressReleaseId],
			foreignColumns: [pressReleases.id],
			name: "press_release_embeddings_press_release_id_fkey"
		}).onDelete("cascade"),
	check("press_release_embeddings_model_chk", sql`model <> ''::text`),
]);

export const personOestat6 = pgTable("person_oestat6", {
	personId: uuid("person_id").notNull(),
	oestat6Id: uuid("oestat6_id").notNull(),
}, (table) => [
	index("idx_person_oestat6_oestat6").using("btree", table.oestat6Id.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [persons.id],
			name: "person_oestat6_person_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.oestat6Id],
			foreignColumns: [oestat6Categories.id],
			name: "person_oestat6_oestat6_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.personId, table.oestat6Id], name: "person_oestat6_pkey"}),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const lecturePersons = pgTable("lecture_persons", {
	lectureId: uuid("lecture_id").notNull(),
	personId: uuid("person_id").notNull(),
	sorting: integer(),
}, (table) => [
	index("idx_lecture_persons_person").using("btree", table.personId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.lectureId],
			foreignColumns: [lectures.id],
			name: "lecture_persons_lecture_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [persons.id],
			name: "lecture_persons_person_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.lectureId, table.personId], name: "lecture_persons_pkey"}),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const lectureOrgunits = pgTable("lecture_orgunits", {
	lectureId: uuid("lecture_id").notNull(),
	orgunitId: uuid("orgunit_id").notNull(),
	sorting: integer(),
}, (table) => [
	index("idx_lecture_orgunits_orgunit").using("btree", table.orgunitId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.lectureId],
			foreignColumns: [lectures.id],
			name: "lecture_orgunits_lecture_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.orgunitId],
			foreignColumns: [orgunits.id],
			name: "lecture_orgunits_orgunit_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.lectureId, table.orgunitId], name: "lecture_orgunits_pkey"}),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
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

export const projectLectures = pgTable("project_lectures", {
	projectId: uuid("project_id").notNull(),
	lectureId: uuid("lecture_id").notNull(),
	sorting: integer(),
}, (table) => [
	index("idx_project_lectures_lecture").using("btree", table.lectureId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "project_lectures_project_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.lectureId],
			foreignColumns: [lectures.id],
			name: "project_lectures_lecture_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.projectId, table.lectureId], name: "project_lectures_pkey"}),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);

export const extunitPersons = pgTable("extunit_persons", {
	extunitId: uuid("extunit_id").notNull(),
	personId: uuid("person_id").notNull(),
	sorting: integer(),
}, (table) => [
	index("idx_extunit_persons_person").using("btree", table.personId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.extunitId],
			foreignColumns: [extunits.id],
			name: "extunit_persons_extunit_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [persons.id],
			name: "extunit_persons_person_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.extunitId, table.personId], name: "extunit_persons_pkey"}),
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

export const orgunitPersons = pgTable("orgunit_persons", {
	orgunitId: uuid("orgunit_id").notNull(),
	personId: uuid("person_id").notNull(),
	sorting: integer(),
	role: text(),
	phone: text(),
	scientist: boolean().default(false).notNull(),
}, (table) => [
	index("idx_orgunit_persons_person").using("btree", table.personId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.orgunitId],
			foreignColumns: [orgunits.id],
			name: "orgunit_persons_orgunit_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.personId],
			foreignColumns: [persons.id],
			name: "orgunit_persons_person_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.orgunitId, table.personId], name: "orgunit_persons_pkey"}),
	pgPolicy("anon_select", { as: "permissive", for: "select", to: ["anon"], using: sql`true` }),
]);
export const publicationOestat6 = pgMaterializedView("publication_oestat6", {	publicationId: uuid("publication_id"),
	oestat6Id: uuid("oestat6_id"),
}).as(sql`SELECT DISTINCT pp.publication_id, po.oestat6_id FROM person_publications pp JOIN person_oestat6 po ON pp.person_id = po.person_id`);

export const pressClusterView = pgView("press_cluster_view", {	embedding: vector({ dimensions: 768 }),
	model: text(),
	kind: text(),
	publicationId: uuid("publication_id"),
	excludePubId: uuid("exclude_pub_id"),
	pressReleaseId: uuid("press_release_id"),
	title: text(),
	releasedAt: date("released_at"),
	pressUrl: text("press_url"),
}).as(sql`SELECT matched_distinct.embedding, matched_distinct.model, matched_distinct.kind, matched_distinct.publication_id, matched_distinct.exclude_pub_id, matched_distinct.press_release_id, matched_distinct.title, matched_distinct.released_at, matched_distinct.press_url FROM ( SELECT DISTINCT ON (pe.publication_id) pe.embedding, pe.model, 'publication'::text AS kind, pe.publication_id, pe.publication_id AS exclude_pub_id, pr.id AS press_release_id, p.title, pr.released_at, pr.url AS press_url FROM publication_embeddings pe JOIN press_releases pr ON pr.publication_id = pe.publication_id JOIN publications p ON p.id = pe.publication_id ORDER BY pe.publication_id, pr.released_at DESC NULLS LAST, pr.id) matched_distinct UNION ALL SELECT pre.embedding, pre.model, 'orphan'::text AS kind, NULL::uuid AS publication_id, NULL::uuid AS exclude_pub_id, pre.press_release_id, COALESCE(NULLIF(pr.paper_title, ''::text), NULLIF(pr.news_title, ''::text), '(ohne Titel)'::text) AS title, pr.released_at, pr.url AS press_url FROM press_release_embeddings pre JOIN press_releases pr ON pr.id = pre.press_release_id WHERE pr.publication_id IS NULL`);

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
	// window. NULL = inherit the global default (SOCIAL_WINDOW_DAYS); cadences
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
	freshWindowDays: integer("fresh_window_days").default(7).notNull(),
	themeWindowDays: integer("theme_window_days").default(14).notNull(),
	retentionDays: integer("retention_days"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, () => [
	check("social_settings_singleton", sql`id = 1`),
	check("social_settings_fresh_check", sql`fresh_window_days >= 1 AND fresh_window_days <= 365`),
	check("social_settings_theme_check", sql`theme_window_days >= 1 AND theme_window_days <= 365`),
	check("social_settings_retention_check", sql`retention_days IS NULL OR (retention_days >= 1 AND retention_days <= 3650)`),
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

// ===========================================================================
// Redaktionsboard (Kanban — /board). Phase 2, BOARD_PLAN.md §4. Migration:
// supabase/migrations/20260703000002_board_core.sql. Hand-mirrored here (NOT
// db:introspect). rank-Spalten sind in der DB `text COLLATE "C"` mit CHECK
// (~ '^[a-z]*[b-z]$'); Drizzle modelliert nur text() — die Collation/der CHECK
// leben in der Migration (sortier-relevant: ORDER BY rank == JS-Codeunit-
// Vergleich in lib/shared/rank.ts). Schreibpfad läuft über Drizzle (owner);
// RLS-Policies sind Realtime-Vorbereitung (nur authenticated_select).
// ===========================================================================

export const boards = pgTable("boards", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	slug: text().notNull(),
	rank: text().notNull(),
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_boards_rank").using("btree", table.rank.asc().nullsLast().op("text_ops")).where(sql`(archived_at IS NULL)`),
	unique("boards_slug_key").on(table.slug),
	check("boards_rank_check", sql`rank ~ '^[a-z]*[b-z]$'`),
	check("boards_name_check", sql`btrim(name) <> ''::text`),
	check("boards_slug_format_check", sql`slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const boardColumns = pgTable("board_columns", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	boardId: uuid("board_id").notNull(),
	name: text().notNull(),
	color: text().default('#64748b').notNull(),
	rank: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
		columns: [table.boardId],
		foreignColumns: [boards.id],
		name: "board_columns_board_id_fkey"
	}).onDelete("cascade"),
	unique("board_columns_board_rank_key").on(table.boardId, table.rank),
	check("board_columns_rank_check", sql`rank ~ '^[a-z]*[b-z]$'`),
	check("board_columns_name_check", sql`btrim(name) <> ''::text`),
	check("board_columns_color_check", sql`color ~ '^#[0-9a-fA-F]{6}$'`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

// converted_from_item_id-FK lebt nur in der Migration (ALTER TABLE nach
// card_items) — hier als blanke uuid-Spalte modelliert, weil cards und
// card_items sich zirkulär referenzieren und die JS-Const-Reihenfolge sonst
// bricht. Query-Building braucht die FK-Metadaten nicht.
export const cards = pgTable("cards", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	boardId: uuid("board_id").notNull(),
	columnId: uuid("column_id").notNull(),
	title: text().notNull(),
	descriptionMd: text("description_md"),
	linkUrl: text("link_url"),
	rank: text().notNull(),
	dueAt: timestamp("due_at", { withTimezone: true, mode: 'string' }),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by").notNull(),
	assigneeId: uuid("assignee_id"),
	convertedFromItemId: uuid("converted_from_item_id"),
	sourceEventId: uuid("source_event_id"),
	sourcePublicationId: uuid("source_publication_id"),
	meistertaskTaskId: text("meistertask_task_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cards_board_col_rank").using("btree", table.boardId.asc().nullsLast().op("uuid_ops"), table.columnId.asc().nullsLast().op("uuid_ops"), table.rank.asc().nullsLast().op("text_ops")),
	index("idx_cards_due").using("btree", table.dueAt.asc().nullsLast().op("timestamptz_ops")).where(sql`(due_at IS NOT NULL AND completed_at IS NULL)`),
	index("idx_cards_assignee").using("btree", table.assigneeId.asc().nullsLast().op("uuid_ops")).where(sql`(assignee_id IS NOT NULL)`),
	index("idx_cards_source_event").using("btree", table.sourceEventId.asc().nullsLast().op("uuid_ops")).where(sql`(source_event_id IS NOT NULL)`),
	uniqueIndex("cards_converted_from_item_key").using("btree", table.convertedFromItemId.asc().nullsLast().op("uuid_ops")).where(sql`(converted_from_item_id IS NOT NULL)`),
	foreignKey({ columns: [table.boardId], foreignColumns: [boards.id], name: "cards_board_id_fkey" }).onDelete("restrict"),
	foreignKey({ columns: [table.columnId], foreignColumns: [boardColumns.id], name: "cards_column_id_fkey" }).onDelete("restrict"),
	foreignKey({ columns: [table.createdBy], foreignColumns: [users.id], name: "cards_created_by_fkey" }).onDelete("restrict"),
	foreignKey({ columns: [table.assigneeId], foreignColumns: [users.id], name: "cards_assignee_id_fkey" }).onDelete("restrict"),
	foreignKey({ columns: [table.sourceEventId], foreignColumns: [events.id], name: "cards_source_event_id_fkey" }).onDelete("set null"),
	foreignKey({ columns: [table.sourcePublicationId], foreignColumns: [publications.id], name: "cards_source_publication_id_fkey" }).onDelete("set null"),
	unique("cards_column_rank_key").on(table.columnId, table.rank),
	check("cards_rank_check", sql`rank ~ '^[a-z]*[b-z]$'`),
	check("cards_title_check", sql`btrim(title) <> ''::text`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const cardItems = pgTable("card_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cardId: uuid("card_id").notNull(),
	kind: text().notNull(),
	text: text().notNull(),
	rank: text().notNull(),
	doneAt: timestamp("done_at", { withTimezone: true, mode: 'string' }),
	doneBy: uuid("done_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({ columns: [table.cardId], foreignColumns: [cards.id], name: "card_items_card_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.doneBy], foreignColumns: [users.id], name: "card_items_done_by_fkey" }).onDelete("restrict"),
	unique("card_items_card_rank_key").on(table.cardId, table.rank),
	check("card_items_kind_check", sql`kind = ANY (ARRAY['checklist'::text, 'subtask'::text])`),
	check("card_items_rank_check", sql`rank ~ '^[a-z]*[b-z]$'`),
	check("card_items_text_check", sql`btrim(text) <> ''::text`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const cardWatchers = pgTable("card_watchers", {
	cardId: uuid("card_id").notNull(),
	userId: uuid("user_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_card_watchers_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({ columns: [table.cardId], foreignColumns: [cards.id], name: "card_watchers_card_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "card_watchers_user_id_fkey" }).onDelete("cascade"),
	primaryKey({ columns: [table.cardId, table.userId], name: "card_watchers_pkey" }),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const cardComments = pgTable("card_comments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cardId: uuid("card_id").notNull(),
	authorId: uuid("author_id").notNull(),
	bodyMd: text("body_md").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	editedAt: timestamp("edited_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_card_comments_card").using("btree", table.cardId.asc().nullsLast().op("uuid_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({ columns: [table.cardId], foreignColumns: [cards.id], name: "card_comments_card_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.authorId], foreignColumns: [users.id], name: "card_comments_author_id_fkey" }).onDelete("restrict"),
	check("card_comments_body_check", sql`btrim(body_md) <> ''::text`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const cardAttachments = pgTable("card_attachments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cardId: uuid("card_id").notNull(),
	filename: text().notNull(),
	s3Key: text("s3_key").notNull(),
	contentType: text("content_type"),
	sizeBytes: bigint("size_bytes", { mode: 'number' }),
	uploadedBy: uuid("uploaded_by").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_card_attachments_card").using("btree", table.cardId.asc().nullsLast().op("uuid_ops")),
	foreignKey({ columns: [table.cardId], foreignColumns: [cards.id], name: "card_attachments_card_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.uploadedBy], foreignColumns: [users.id], name: "card_attachments_uploaded_by_fkey" }).onDelete("restrict"),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

// Append-only (Trigger card_activity_append_only): kein UPDATE, DELETE nur per
// Karten-Cascade. Server schreibt bei create/move/complete/convert selbst.
export const cardActivity = pgTable("card_activity", {
	id: bigserial({ mode: 'number' }).primaryKey().notNull(),
	cardId: uuid("card_id").notNull(),
	actorId: uuid("actor_id").notNull(),
	verb: text().notNull(),
	payload: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_card_activity_card").using("btree", table.cardId.asc().nullsLast().op("uuid_ops"), table.id.asc().nullsLast().op("int8_ops")),
	foreignKey({ columns: [table.cardId], foreignColumns: [cards.id], name: "card_activity_card_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.actorId], foreignColumns: [users.id], name: "card_activity_actor_id_fkey" }).onDelete("restrict"),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const userBoardFavorites = pgTable("user_board_favorites", {
	userId: uuid("user_id").notNull(),
	boardId: uuid("board_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "user_board_favorites_user_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.boardId], foreignColumns: [boards.id], name: "user_board_favorites_board_id_fkey" }).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.boardId], name: "user_board_favorites_pkey" }),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const userHiddenColumns = pgTable("user_hidden_columns", {
	userId: uuid("user_id").notNull(),
	columnId: uuid("column_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_user_hidden_columns_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "user_hidden_columns_user_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.columnId], foreignColumns: [boardColumns.id], name: "user_hidden_columns_column_id_fkey" }).onDelete("cascade"),
	primaryKey({ columns: [table.userId, table.columnId], name: "user_hidden_columns_pkey" }),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const boardLabels = pgTable("board_labels", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	boardId: uuid("board_id").notNull(),
	name: text().notNull(),
	color: text().default('#64748b').notNull(),
	rank: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_board_labels_board").using("btree", table.boardId.asc().nullsLast().op("uuid_ops"), table.rank.asc().nullsLast().op("text_ops")),
	foreignKey({ columns: [table.boardId], foreignColumns: [boards.id], name: "board_labels_board_id_fkey" }).onDelete("cascade"),
	unique("board_labels_board_rank_key").on(table.boardId, table.rank),
	check("board_labels_name_check", sql`btrim(name) <> ''::text`),
	check("board_labels_color_check", sql`color ~ '^#[0-9a-fA-F]{6}$'`),
	check("board_labels_rank_check", sql`rank ~ '^[a-z]*[b-z]$'`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const cardLabels = pgTable("card_labels", {
	cardId: uuid("card_id").notNull(),
	labelId: uuid("label_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_card_labels_label").using("btree", table.labelId.asc().nullsLast().op("uuid_ops")),
	foreignKey({ columns: [table.cardId], foreignColumns: [cards.id], name: "card_labels_card_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.labelId], foreignColumns: [boardLabels.id], name: "card_labels_label_id_fkey" }).onDelete("cascade"),
	primaryKey({ columns: [table.cardId, table.labelId], name: "card_labels_pkey" }),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);