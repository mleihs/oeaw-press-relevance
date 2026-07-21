import { describe, it, expect } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildEventScopeWhere } from './analyze';

// Zwilling von lib/server/analysis/batch.test.ts: den Drizzle-Filter ohne DB in
// seinen parametrisierten Text rendern. Der Events-Scope hatte bis zum Review
// der AP1-AP6-Umsetzung gar keinen Test, obwohl er dieselbe neue ids-/force-
// Logik trägt wie die Publikations-Seite — und obwohl sein Force-Pfad das
// Kandidaten-Prädikat im TypeScript nachbuchstabierte.
const dialect = new PgDialect();
const render = (s: SQL) => {
  const { sql, params } = dialect.sqlToQuery(s);
  return { sql, params: params.map(String) };
};

const base = { limit: 50, batchSize: 3 };

describe('buildEventScopeWhere — Scope des Event-Bewertungslaufs', () => {
  it('nimmt ohne force die offenen Kandidaten aus der kanonischen View', () => {
    const { sql } = render(buildEventScopeWhere({ ...base, forceReanalyze: false })!);
    expect(sql).toContain('event_scoring_candidates');
    expect(sql).not.toContain('event_rescore_pool');
  });

  it('nimmt mit force die Pool-View, nicht ein nachgebautes event_at-Prädikat', () => {
    const { sql } = render(buildEventScopeWhere({ ...base, forceReanalyze: true })!);
    expect(sql).toContain('event_rescore_pool');
    expect(sql).not.toContain('event_scoring_candidates');
    // Die Regression, die dieser Test hält: das Prädikat gehört in die View,
    // nicht ins TypeScript (Migration 20260721000002).
    expect(sql).not.toContain('NOW()');
  });

  it.each([false, true])(
    'schneidet benannte ids auch bei forceReanalyze=%s mit dem Pool',
    (forceReanalyze) => {
      const ids = ['11111111-2222-3333-4444-555555555555'];
      const { sql, params } = render(buildEventScopeWhere({ ...base, forceReanalyze, ids })!);
      expect(sql).toContain('IN (SELECT id FROM event_');
      expect(sql).toContain('= ANY($1::uuid[])');
      expect(params).toContain(String(ids));
    },
  );

  it('bindet das id-Array als Parameter (Pooler-Bug bei barem ${array})', () => {
    const ids = ['11111111-2222-3333-4444-555555555555'];
    const { sql } = render(buildEventScopeWhere({ ...base, forceReanalyze: false, ids })!);
    expect(sql).not.toContain(ids[0]);
  });

  it('kennt bewusst kein created_at-Fenster (anders als die Publikationen)', () => {
    const { sql } = render(buildEventScopeWhere({ ...base, forceReanalyze: false })!);
    expect(sql).not.toContain('make_interval');
    expect(sql).not.toContain('created_at');
  });
});
