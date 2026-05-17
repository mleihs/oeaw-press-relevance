import { z } from 'zod';
import { createSelectSchema } from 'drizzle-zod';
// Import the table definition directly (not the @/lib/server/db barrel)
// so this module pulls only drizzle-orm/pg-core, never the postgres()
// client — keeps it connection-free and unit-testable.
import { publications } from '@/lib/server/db/schema';

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
 * `[id]` path-param UUID, derived from the publications PK column so it
 * stays in sync with the DB type. drizzle-zod maps pg `uuid()` to zod v4's
 * native `z.uuid()` (RFC-4122 variant-checked) — stricter than the prior
 * hand-rolled `/^[0-9a-f]{8}-.../i` regex, but every id the app issues is
 * a `gen_random_uuid()` v4, so legitimate traffic is unaffected; only a
 * hand-crafted non-RFC hex string flips from a downstream 404 to a clean
 * 400. `persons.id` is the same pg `uuid()` type, so this one schema
 * covers every `[id]` route (publications + persons).
 */
export const idParamSchema = z.object({
  id: createSelectSchema(publications).shape.id,
});

export type IdParam = z.infer<typeof idParamSchema>;
