// WebDB-Stammdaten (TYPO3-Mirror): Personen, Orgunits, Extunits, Projekte,
// Vorträge, Typ-Lookups (inkl. ÖSTAT-6) + deren Junctions untereinander.
// Junctions mit Publikationsbezug liegen in ./publications (Import-Richtung
// webdb → publications wäre sonst zyklisch).
import { pgTable, index, unique, uuid, text, timestamp, foreignKey, integer, boolean, date, primaryKey, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

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
