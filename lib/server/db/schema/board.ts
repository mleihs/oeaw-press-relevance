import { pgTable, index, uniqueIndex, unique, check, uuid, text, timestamp, foreignKey, bigserial, bigint, jsonb, primaryKey, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./auth"
import { events } from "./events"
import { publications } from "./publications"

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
	// Frei wählbares Icon (Schlüssel aus lib/shared/board.ts BOARD_COLUMN_ICONS);
	// NULL → Fallback aufs namensbasierte Kanal-Mapping (channels.tsx).
	icon: text(),
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
	archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
	createdBy: uuid("created_by").notNull(),
	assigneeId: uuid("assignee_id"),
	convertedFromItemId: uuid("converted_from_item_id"),
	sourceEventId: uuid("source_event_id"),
	sourcePublicationId: uuid("source_publication_id"),
	meistertaskTaskId: text("meistertask_task_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_cards_active").using("btree", table.boardId.asc().nullsLast().op("uuid_ops"), table.columnId.asc().nullsLast().op("uuid_ops"), table.rank.asc().nullsLast().op("text_ops")).where(sql`(archived_at IS NULL)`),
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
