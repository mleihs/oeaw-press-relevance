// Auth-Domäne: Supabase-Auth-Spiegel (public.users) + per-User-Settings.
// Teil des Domänen-Splits von schema.ts (Review-Fixplan B2) — Definitionen
// 1:1 aus der früheren Einzeldatei übernommen.
import { pgTable, index, unique, check, uuid, text, timestamp, foreignKey, integer, boolean, pgPolicy } from "drizzle-orm/pg-core"
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
	// Storage-Key des Profilbilds (MinIO, z.B. 'avatars/<id>.jpg'); Anzeige
	// über den Proxy /api/users/[id]/avatar. Import: scripts/import-meistertask-avatars.mjs
	avatarKey: text("avatar_key"),
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
