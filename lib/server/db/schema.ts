import { pgTable, index, unique, check, uuid, text, timestamp, foreignKey, integer, boolean, pgPolicy, date, bigserial, uniqueIndex, smallint, jsonb, vector, doublePrecision, primaryKey, pgMaterializedView, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const users = pgTable("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text().notNull(),
	displayName: text("display_name"),
	role: text().default('editor').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_users_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	unique("users_email_key").on(table.email),
	check("users_role_check", sql`role = ANY (ARRAY['admin'::text, 'editor'::text, 'viewer'::text])`),
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
	citationCbe: text("citation_cbe"),
	citationHarvard: text("citation_harvard"),
	citationMla: text("citation_mla"),
	citationVancouver: text("citation_vancouver"),
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