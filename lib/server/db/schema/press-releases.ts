// Press-Releases (ÖAW-Hauptseite, DOI-Match zu Publikationen) + Embeddings,
// Promote-Log und die press_cluster_view fürs Similarity-Scoring.
import { pgTable, index, uniqueIndex, check, uuid, text, timestamp, foreignKey, integer, smallint, date, bigserial, jsonb, vector, pgView } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { publications } from "./publications"

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
