/** Barrel für das Drizzle-Schema, pro Domäne gesplittet (Review-Fixplan B2).
 *
 *  Der Import-Pfad `@/lib/server/db/schema` (und `./schema` in relations.ts/
 *  drizzle.ts) bleibt gültig. Neue Tabellen gehören in die passende Domänen-
 *  Datei — Quelle der Wahrheit bleiben die Supabase-Migrationen; hier wird
 *  hand-gespiegelt (NICHT db:introspect, es benennt bestehende Relationen um).
 *  scripts/check-schema-drift.mjs scannt dieses Verzeichnis. */

export * from "./auth";
export * from "./webdb";
export * from "./publications";
export * from "./press-releases";
export * from "./events";
export * from "./social";
export * from "./board";
export * from "./smart-objects";
