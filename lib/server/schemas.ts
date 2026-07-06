import { z } from 'zod';

/**
 * Server-only input schemas derived from the Drizzle table layer
 * (ADR 0018). These live in lib/server/ — NOT lib/shared/schemas.ts —
 * deliberately: `createSelectSchema(publications)` pulls in the Drizzle
 * pg-core schema, so colocating it in the client-shared kernel would (a)
 * trip the eslint-plugin-boundaries `shared -> server` ban and (b)
 * bundle `postgres`/`pg-core` into the client (the Phase-A4 pitfall #26).
 * Hand-written, zod-only request schemas stay client-safe in
 * lib/shared/schemas.ts.
 *
 * The table-row (insert/select) derivation that drizzle-zod is really for
 * gets its first concrete consumer in Pass B (the CanonicalPublication
 * ingest DTO, ADR 0017): none of Pass A's input-reading routes accept a
 * table-shaped body — they are query-, path-param-, or action-shaped, all
 * of which the cleanup plan says to hand-write.
 */

/**
 * `[id]` path-param UUID. Bewusst NICHT mehr drizzle-zods `z.uuid()`
 * (RFC-4122 variant-checked): der MeisterTask-Import leitet Attachment-Ids
 * deterministisch aus MT-Ids ab (stableUuid, import-meistertask-
 * attachments.mjs) — gültige Postgres-uuids, aber ohne RFC-Versions-Bits.
 * z.uuid() beantwortete deren Download/Vorschau mit 400 (2026-07-06).
 * Validiert wird daher genau die Postgres-Semantik: 8-4-4-4-12 Hex.
 * (`persons.id` ist derselbe pg-uuid-Typ, dieses eine Schema deckt alle
 * `[id]`-Routen ab.)
 */
export const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID'),
});

export type IdParam = z.infer<typeof idParamSchema>;
