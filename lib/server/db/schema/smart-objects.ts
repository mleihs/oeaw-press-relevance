import { pgTable, index, uniqueIndex, unique, check, uuid, text, timestamp, foreignKey, jsonb, pgPolicy } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { users } from "./auth"
import { events } from "./events"
import { publications } from "./publications"
import { cards } from "./board"

// ===========================================================================
// Smart-Objekte (BOARD_SMART_OBJECTS.md): Karten referenzieren n:m Events,
// Publikationen (Live-Join) und externe Objekte (Registry + Snapshot, erster
// Provider YouTube). Migration 20260705000003_card_references.sql, hier
// hand-gespiegelt (NICHT db:introspect — benennt bestehende Relationen um).
// ===========================================================================

export const externalObjects = pgTable("external_objects", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	provider: text().notNull(),
	externalId: text("external_id").notNull(),
	url: text(),
	snapshot: jsonb().default({}).notNull(),
	thumbnailKey: text("thumbnail_key"),
	refreshedAt: timestamp("refreshed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("external_objects_provider_external_key").on(table.provider, table.externalId),
	check("external_objects_provider_check", sql`provider = ANY (ARRAY['youtube'::text])`),
	check("external_objects_external_id_check", sql`btrim(external_id) <> ''::text`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);

export const cardReferences = pgTable("card_references", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	cardId: uuid("card_id").notNull(),
	eventId: uuid("event_id"),
	publicationId: uuid("publication_id"),
	objectId: uuid("object_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: uuid("created_by"),
}, (table) => [
	uniqueIndex("card_references_event_key").using("btree", table.cardId.asc().nullsLast().op("uuid_ops"), table.eventId.asc().nullsLast().op("uuid_ops")).where(sql`(event_id IS NOT NULL)`),
	uniqueIndex("card_references_publication_key").using("btree", table.cardId.asc().nullsLast().op("uuid_ops"), table.publicationId.asc().nullsLast().op("uuid_ops")).where(sql`(publication_id IS NOT NULL)`),
	uniqueIndex("card_references_object_key").using("btree", table.cardId.asc().nullsLast().op("uuid_ops"), table.objectId.asc().nullsLast().op("uuid_ops")).where(sql`(object_id IS NOT NULL)`),
	index("idx_card_references_card").using("btree", table.cardId.asc().nullsLast().op("uuid_ops")),
	index("idx_card_references_event").using("btree", table.eventId.asc().nullsLast().op("uuid_ops")).where(sql`(event_id IS NOT NULL)`),
	index("idx_card_references_publication").using("btree", table.publicationId.asc().nullsLast().op("uuid_ops")).where(sql`(publication_id IS NOT NULL)`),
	index("idx_card_references_object").using("btree", table.objectId.asc().nullsLast().op("uuid_ops")).where(sql`(object_id IS NOT NULL)`),
	foreignKey({ columns: [table.cardId], foreignColumns: [cards.id], name: "card_references_card_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.eventId], foreignColumns: [events.id], name: "card_references_event_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.publicationId], foreignColumns: [publications.id], name: "card_references_publication_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.objectId], foreignColumns: [externalObjects.id], name: "card_references_object_id_fkey" }).onDelete("cascade"),
	foreignKey({ columns: [table.createdBy], foreignColumns: [users.id], name: "card_references_created_by_fkey" }).onDelete("set null"),
	check("card_references_one_target_check", sql`num_nonnulls(event_id, publication_id, object_id) = 1`),
	pgPolicy("authenticated_select", { as: "permissive", for: "select", to: ["authenticated"], using: sql`true` }),
]);