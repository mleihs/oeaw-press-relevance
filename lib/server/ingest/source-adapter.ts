// SourceAdapter boundary (ADR 0017).
//
// Each ingest source implements `fetch()` (pull the raw source into memory)
// and `normalize(raw)` (pure transform -> CanonicalBatch). The shared loader
// (`./loader.ts`) consumes the batch and writes it through Drizzle. WebDB is
// adapter #1 (`./adapters/webdb.ts`); the api.elsevierpure.com REST source
// becomes adapter #2 later (memory pure_api_migration_planned), out of scope
// here.
//
// `normalize` is intentionally pure and synchronous: no DB, no network. That
// is what makes the transform unit-testable (the ADR's main payoff) and what
// lets the parity gate diff `normalize()` output deterministically.

import type { CanonicalBatch } from './canonical';

export interface SourceAdapter<Raw> {
  /** Stable identifier, used in logs and the press-release-promote source
   *  tag (e.g. 'webdb'). */
  readonly name: string;

  /** Pull the entire source into memory. Owns its own connection lifecycle
   *  (opens and closes whatever transport it uses). */
  fetch(): Promise<Raw>;

  /** Pure transform: raw source -> canonical graph. No DB, no network, no
   *  clock-dependent output (the loader stamps `synced_at`). */
  normalize(raw: Raw): CanonicalBatch;
}
