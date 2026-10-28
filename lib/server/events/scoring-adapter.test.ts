import { describe, it, expect } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { EventAnalysisResult, ScoredSibling } from './prompts';
import { alignTwins, buildEventScopeWhere, eventTwinGroups, normalizeEventTitle, type EventCandidate } from './scoring-adapter';

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

  const at = (id: string, title: string, eventAt: string, institute: string | null) => ({ id, title, eventAt, institute });

  it('gruppiert Sprachfassungen mit übersetztem Titel über Minute und Institut, der Ort zählt nicht', () => {
    const groups = eventTwinGroups([
      at('de', 'Kommen und Gehen unter Merenptah', '2026-11-10T18:00:00+01:00', 'ÖAI'),
      at('en', 'Levantine Comings and Goings under Merenptah', '2026-11-10T18:00:00+01:00', 'ÖAI'),
      at('andere-minute', 'Noch ein Vortrag', '2026-11-10T18:30:00+01:00', 'ÖAI'),
      at('anderes-institut', 'Fremder Termin', '2026-11-10T18:00:00+01:00', 'IHB'),
      at('ohne-institut', 'Ohne Institut', '2026-11-10T18:00:00+01:00', null),
    ]);
    expect(groups).toEqual([['de', 'en']]);
  });

  it('nimmt die Zentralseite vom Minuten-Schlüssel aus: sie stellt verschiedene Termine zur selben Uhrzeit ein', () => {
    const groups = eventTwinGroups([
      at('a', 'Scientific Machine Learning für die Grundlagenforschung', '2026-09-14T09:00:00+02:00', 'OEAW - Home'),
      at('b', 'Zur Relevanz der Migrationsforschung', '2026-09-14T09:00:00+02:00', 'OEAW - Home'),
    ]);
    expect(groups).toEqual([]);
  });

  it('verbindet Titel- und Minuten-Schlüssel zu einer Gruppe', () => {
    const groups = eventTwinGroups([
      at('a', 'Hvar im Wandel der Zeit', '2026-11-05T17:00:00+01:00', 'IHB'),
      at('b', 'Hvar im Wandel der Zeit (Kopie 1)', '2026-11-05T19:12:00+01:00', 'IHB'),
      at('c', 'Hvar through the Ages', '2026-11-05T19:12:00+01:00', 'IHB'),
    ]);
    expect(groups).toEqual([['a', 'b', 'c']]);
  });
});

describe('alignTwins', () => {
  const sibling = (id: string, dims: [number, number, number, number]): ScoredSibling => ({
    id,
    title: `Termin ${id}`,
    eventAt: '2026-11-05T17:00:00+01:00',
    locationTitle: 'PSK',
    institute: 'OEAW - Home',
    public_appeal: dims[0],
    scientific_significance: dims[1],
    reach: dims[2],
    timeliness: dims[3],
  });
  const candidate = (id: string, scoredSiblings?: ScoredSibling[]) => ({ id, scoredSiblings }) as unknown as EventCandidate;
  const result = (index: number | undefined, dims: [number, number, number, number], twin_of: string | null = null): EventAnalysisResult => ({
    event_index: index,
    public_appeal: dims[0],
    scientific_significance: dims[1],
    reach: dims[2],
    timeliness: dims[3],
    twin_of,
    pitch_suggestion: `pitch ${index}`,
    suggested_angle: 'angle',
    target_audience: 'audience',
    reasoning: 'reasoning',
  });
  const dimsOf = (r: EventAnalysisResult) => [r.public_appeal, r.scientific_significance, r.reach, r.timeliness];

  it('übernimmt die Dimensionen des schon bewerteten Zwillings exakt und lässt die Texte stehen', () => {
    const batch = [candidate('hvar-neu', [sibling('x', [0.1, 0.1, 0.1, 0.1]), sibling('hvar-alt', [0.45, 0.4, 0.3, 0.2])])];
    const [out] = alignTwins(batch, [result(1, [0.4, 0.36, 0.22, 0.08], 'b2')], []);
    expect(dimsOf(out)).toEqual([0.45, 0.4, 0.3, 0.2]);
    expect(out.pitch_suggestion).toBe('pitch 1');
  });

  it('übergeht eine unbekannte Kennung und twin_of null', () => {
    const batch = [candidate('a', [sibling('s', [0.5, 0.5, 0.5, 0.5])]), candidate('b')];
    const out = alignTwins(batch, [result(1, [0.2, 0.3, 0.1, 0.1], 'B9'), result(2, [0.3, 0.3, 0.3, 0.3])], []);
    expect(dimsOf(out[0])).toEqual([0.2, 0.3, 0.1, 0.1]);
    expect(dimsOf(out[1])).toEqual([0.3, 0.3, 0.3, 0.3]);
  });

  it('gleicht Zwillinge im Batch an das erste Mitglied an, oder an das mit Übernahme', () => {
    const plain = alignTwins([candidate('de'), candidate('en')], [result(1, [0.3, 0.4, 0.2, 0.1]), result(2, [0.32, 0.4, 0.25, 0.1])], [[1, 2]]);
    expect(dimsOf(plain[1])).toEqual([0.3, 0.4, 0.2, 0.1]);

    const batch = [candidate('de'), candidate('en', [sibling('alt', [0.45, 0.4, 0.3, 0.2])])];
    const copied = alignTwins(batch, [result(1, [0.3, 0.4, 0.2, 0.1]), result(2, [0.32, 0.4, 0.25, 0.1], 'B1')], [[1, 2]]);
    expect(copied.map(dimsOf)).toEqual([
      [0.45, 0.4, 0.3, 0.2],
      [0.45, 0.4, 0.3, 0.2],
    ]);
  });

  it('ordnet ohne event_index nach Position zu, aber nur bei gleicher Anzahl', () => {
    const batch = [candidate('a', [sibling('s', [0.5, 0.5, 0.5, 0.5])]), candidate('b')];
    expect(dimsOf(alignTwins(batch, [result(undefined, [0.1, 0.1, 0.1, 0.1], 'B1'), result(undefined, [0.2, 0.2, 0.2, 0.2])], [])[0])).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(dimsOf(alignTwins(batch, [result(undefined, [0.1, 0.1, 0.1, 0.1], 'B1')], [])[0])).toEqual([0.1, 0.1, 0.1, 0.1]);
  });
});
