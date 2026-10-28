import { describe, it, expect } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildEventScopeWhere, eventTwinGroups, normalizeEventTitle } from './scoring-adapter';

// Zwilling von lib/server/analysis/scoring-adapter.test.ts: den Drizzle-Filter ohne DB in
// seinen parametrisierten Text rendern. Der Events-Scope hatte bis zum Review
// der AP1-AP6-Umsetzung gar keinen Test, obwohl er dieselbe neue ids-/force-
// Logik trägt wie die Publikations-Seite — und obwohl sein Force-Pfad das
// Kandidaten-Prädikat im TypeScript nachbuchstabierte.
const dialect = new PgDialect();
const render = (s: SQL) => {
  const { sql, params } = dialect.sqlToQuery(s);
  return { sql, params: params.map(String) };
};

describe('buildEventScopeWhere — Scope des Event-Bewertungslaufs', () => {
  it('nimmt ohne force die offenen Kandidaten aus der kanonischen View', () => {
    const { sql } = render(buildEventScopeWhere({ forceReanalyze: false }));
    expect(sql).toContain('event_scoring_candidates');
    expect(sql).not.toContain('event_rescore_pool');
  });

  it('nimmt mit force die Pool-View, nicht ein nachgebautes event_at-Prädikat', () => {
    const { sql } = render(buildEventScopeWhere({ forceReanalyze: true }));
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
      const { sql, params } = render(buildEventScopeWhere({ forceReanalyze, ids }));
      expect(sql).toContain('IN (SELECT id FROM event_');
      expect(sql).toContain('= ANY($1::uuid[])');
      expect(params).toContain(String(ids));
    },
  );

  it('bindet das id-Array als Parameter (Pooler-Bug bei barem ${array})', () => {
    const ids = ['11111111-2222-3333-4444-555555555555'];
    const { sql } = render(buildEventScopeWhere({ forceReanalyze: false, ids }));
    expect(sql).not.toContain(ids[0]);
  });

  it('kennt bewusst kein created_at-Fenster (anders als die Publikationen)', () => {
    const { sql } = render(buildEventScopeWhere({ forceReanalyze: false }));
    expect(sql).not.toContain('make_interval');
    expect(sql).not.toContain('created_at');
  });

  it('grenzt eine Kohorte über llm_model ein und nimmt dafür den ganzen Pool', () => {
    const { sql, params } = render(
      buildEventScopeWhere({ rescoreTag: 'anthropic/claude-opus-5.5-auto', since: '2026-11-01' }),
    );
    expect(sql).toContain('event_rescore_pool');
    expect(sql).toContain('"llm_model" = $1');
    expect(sql).toContain('"analyzed_at" >= $2::timestamptz');
    expect(params).toEqual(['anthropic/claude-opus-5.5-auto', '2026-11-01']);
  });
});

describe('Zwillinge', () => {
  const ev = (id: string, title: string, eventAt: string) => ({ id, title, eventAt });

  it('normalisiert Groß-/Kleinschreibung, Diakritika und den Kopie-Vermerk', () => {
    expect(normalizeEventTitle('  Röm. Nahost  (Kopie 2) ')).toBe('rom. nahost');
    expect(normalizeEventTitle('Kick-off Workshop in Cairo (copy 3)')).toBe('kick-off workshop in cairo');
    expect(normalizeEventTitle('Dharmakīrti (copy)')).toBe('dharmakirti');
  });

  it('gruppiert gleiche Titel am selben Wiener Kalendertag, auch bei anderer Uhrzeit', () => {
    const groups = eventTwinGroups([
      ev('de', 'The Ancient Near East', '2026-10-27T13:00:00+01:00'),
      ev('en', 'The Ancient Near East', '2026-10-27T13:49:00+01:00'),
      ev('kopie', 'The Ancient Near East (Kopie 2)', '2026-10-27T18:00:00+01:00'),
      ev('anderer-tag', 'The Ancient Near East', '2026-10-28T13:00:00+01:00'),
      ev('solo', 'Dental Cortisol', '2026-10-27T13:00:00+01:00'),
    ]);
    expect(groups).toEqual([['de', 'en', 'kopie']]);
  });

  it('rechnet den Kalendertag in Wiener Zeit, nicht in UTC', () => {
    // 23:30 UTC am 27. ist in Wien schon der 28. (Winterzeit, UTC+1).
    const groups = eventTwinGroups([
      ev('a', 'Nachtvortrag', '2026-11-27T23:30:00Z'),
      ev('b', 'Nachtvortrag', '2026-11-28T10:00:00+01:00'),
    ]);
    expect(groups).toEqual([['a', 'b']]);
  });

  it('gruppiert Platzhaltertitel nie', () => {
    const groups = eventTwinGroups([
      ev('a', 'Title to be announced', '2026-11-05T14:00:00+01:00'),
      ev('b', 'Title to be announced', '2026-11-05T16:00:00+01:00'),
      ev('c', 'TBA', '2026-11-05T16:00:00+01:00'),
      ev('d', 'tba', '2026-11-05T16:00:00+01:00'),
    ]);
    expect(groups).toEqual([]);
  });
});
