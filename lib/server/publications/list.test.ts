import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { SORTABLE_COLUMNS, scoringScopeClause } from './list';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';

// Columns that currently have a B-tree DESC-suitable index in
// supabase/migrations/. Keep in sync: when you add a new
// `CREATE INDEX ... (col DESC NULLS LAST)` migration, append the
// wire-shape key here.
const INDEXED_COLUMNS = new Set<string>([
  // 20260427000001_initial.sql
  'published_at',
  'press_score',
  // 20260515000001_dimension_sort_indexes.sql
  'public_accessibility',
  'societal_relevance',
  'novelty_factor',
  'storytelling_potential',
  'media_timeliness',
]);

// Columns that are sortable but knowingly NOT indexed. Each entry is a
// deliberate "we accept the seq scan" call. When you add a new
// SORTABLE_COLUMNS entry, you must either ship a CREATE INDEX migration
// and bump INDEXED_COLUMNS, or add the column here with a one-line
// rationale.
const INTENTIONALLY_UNINDEXED = new Set<string>([
  'title',              // GIN trigram (idx_pub_title) for search; DESC scan is unusual
  'lead_author',        // press team rarely sorts on this; cardinality is high
  'press_similarity',   // dashboard never sorts by this directly (histogram only)
  'updated_at',         // admin debug-only, low traffic
  'decided_at',         // tiny subset of analyzed rows, low traffic
  'created_at',         // covered indirectly by idx_pub_enrichment_created (composite)
  'webdb_uid',          // UNIQUE constraint creates an implicit index
  'enrichment_status',  // idx_pub_enrichment exists but is for status-eq not DESC sort
  'analysis_status',    // idx_pub_analysis exists but is for status-eq not DESC sort
]);

describe('SORTABLE_COLUMNS guard', () => {
  it('every key maps to a defined Drizzle column', () => {
    for (const [key, col] of Object.entries(SORTABLE_COLUMNS)) {
      expect(col, `${key} maps to undefined`).toBeDefined();
      // AnyColumn has a `name` property at runtime (Drizzle Column class).
      expect(col, `${key} is not a Drizzle column`).toHaveProperty('name');
    }
  });

  it('every key is either indexed or explicitly whitelisted', () => {
    for (const key of Object.keys(SORTABLE_COLUMNS)) {
      const isIndexed = INDEXED_COLUMNS.has(key);
      const isWhitelisted = INTENTIONALLY_UNINDEXED.has(key);
      expect(
        isIndexed || isWhitelisted,
        `SORTABLE_COLUMNS["${key}"]: add a CREATE INDEX migration ` +
          `(then append to INDEXED_COLUMNS in this file), or add the ` +
          `column to INTENTIONALLY_UNINDEXED with a one-line rationale.`,
      ).toBe(true);
    }
  });

  it('INDEXED_COLUMNS and INTENTIONALLY_UNINDEXED do not overlap', () => {
    for (const col of INDEXED_COLUMNS) {
      expect(
        INTENTIONALLY_UNINDEXED.has(col),
        `${col} is in both INDEXED_COLUMNS and INTENTIONALLY_UNINDEXED`,
      ).toBe(false);
    }
  });

  it('every INDEXED_COLUMNS entry is a known SORTABLE_COLUMNS key', () => {
    const sortableKeys = new Set(Object.keys(SORTABLE_COLUMNS));
    for (const col of INDEXED_COLUMNS) {
      expect(
        sortableKeys.has(col),
        `INDEXED_COLUMNS contains "${col}" which is not in SORTABLE_COLUMNS`,
      ).toBe(true);
    }
  });

  it('every INTENTIONALLY_UNINDEXED entry is a known SORTABLE_COLUMNS key', () => {
    const sortableKeys = new Set(Object.keys(SORTABLE_COLUMNS));
    for (const col of INTENTIONALLY_UNINDEXED) {
      expect(
        sortableKeys.has(col),
        `INTENTIONALLY_UNINDEXED contains "${col}" which is not in SORTABLE_COLUMNS`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Bewertungs-Scope (?scoring=fresh|backlog)
// ---------------------------------------------------------------------------
// Der Filter, auf den die Dashboard-Kachel verlinkt. Er MUSS dieselbe Menge
// treffen, die die Kachel zählt und der Bewerten-Knopf erreicht — sonst
// verspricht die Zahl etwas, das der Klick nicht einlöst (der Grund, aus dem
// der frühere `analysis=pending`-Link ersetzt wurde).
const dialect = new PgDialect();

describe('scoringScopeClause', () => {
  it('filtert nicht, solange kein Scope gesetzt ist', () => {
    expect(scoringScopeClause('')).toBeNull();
    expect(scoringScopeClause('irgendwas')).toBeNull();
  });

  it('liest beide Scopes aus der kanonischen Kandidaten-View', () => {
    for (const scope of ['fresh', 'backlog']) {
      const { sql } = dialect.sqlToQuery(scoringScopeClause(scope)!);
      expect(sql).toContain('IN (SELECT id FROM publication_scoring_candidates)');
    }
  });

  it('trennt fresh und backlog am selben Schnitt wie der Bewerten-Knopf', () => {
    const fresh = dialect.sqlToQuery(scoringScopeClause('fresh')!);
    const backlog = dialect.sqlToQuery(scoringScopeClause('backlog')!);
    expect(fresh.sql).toContain('"created_at" >= now() - make_interval(days =>');
    expect(backlog.sql).toContain('"created_at" < now() - make_interval(days =>');
    // Dieselbe Tageszahl, als Parameter gebunden statt in die Query gespleißt.
    for (const q of [fresh, backlog]) {
      expect(q.sql).toContain('$1::int');
      expect(q.params.map(String)).toContain(String(SCORING_RECENT_DAYS));
    }
  });
});
