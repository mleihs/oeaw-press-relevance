import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { toIso } from './contract';
import { bridgeEventFilter, summaryRowToApi } from './events';

// Listenfilter der Bridge ohne DB: die WHERE-Klausel als parametrisierter
// Text, dazu die Abbildung einer Zeile auf das Vertragsformat.

const dialect = new PgDialect();
const render = (s: SQL) => {
  const { sql, params } = dialect.sqlToQuery(s);
  return { sql, params: params.map(String) };
};

describe('bridgeEventFilter', () => {
  it('zeigt nur anstehende Events und blendet Skip standardmäßig aus', () => {
    const { sql, params } = render(bridgeEventFilter());
    expect(sql).toContain('"events"."event_at" >= NOW()');
    expect(sql).toContain('"events"."decision" <> $1');
    expect(params).toEqual(['skip']);
  });

  it('nimmt mit includeAll auch Skip mit, bleibt aber bei anstehenden', () => {
    const { sql, params } = render(bridgeEventFilter({ includeAll: true }));
    expect(sql).toContain('"events"."event_at" >= NOW()');
    expect(sql).not.toContain('decision');
    expect(params).toEqual([]);
  });

  it('sucht q case-insensitiv auf Titel, Teaser und Institut', () => {
    const { sql, params } = render(bridgeEventFilter({ q: '  Imperien ', includeAll: true }));
    expect(sql).toContain('"events"."title" ilike $1');
    expect(sql).toContain('"events"."teaser" ilike $2');
    expect(sql).toContain('"events"."institute" ilike $3');
    expect(params).toEqual(['%Imperien%', '%Imperien%', '%Imperien%']);
  });

  it('entschärft ILIKE-Wildcards und kappt lange Suchen', () => {
    const { params } = render(bridgeEventFilter({ q: '50%_x', includeAll: true }));
    expect(params[0]).toBe('%50\\%\\_x%');
    const long = render(bridgeEventFilter({ q: 'a'.repeat(500), includeAll: true }));
    expect(long.params[0]).toHaveLength(102);
  });

  it('ignoriert eine leere Suche', () => {
    expect(render(bridgeEventFilter({ q: '   ' })).sql).not.toContain('ilike');
  });
});

describe('toIso', () => {
  it('macht aus Postgres-Zeitstempeln ISO in UTC, ohne .000', () => {
    expect(toIso('2026-12-16 17:00:00+00')).toBe('2026-12-16T17:00:00Z');
    expect(toIso('2026-12-16 18:00:00+01')).toBe('2026-12-16T17:00:00Z');
    expect(toIso('2026-12-16 17:00:00.25+00')).toBe('2026-12-16T17:00:00.250Z');
    expect(toIso(null)).toBeNull();
  });
});

describe('summaryRowToApi', () => {
  it('liefert die Felder des Vertrags', () => {
    const api = summaryRowToApi({
      id: '11111111-1111-4111-8111-111111111111',
      webdbUid: 40455,
      title: 'ÖAW Christmas Talk 2026',
      teaser: null,
      eventAt: '2026-12-16 17:00:00+00',
      eventEndAt: null,
      locationTitle: 'Festsaal',
      organizerTitle: null,
      institute: 'ÖAW',
      lang: 'de',
      availableLangs: ['de', 'xx', 'en'],
      url: null,
      decision: 'bogus',
      hasBodytext: true,
      hasDraft: false,
    });
    expect(api).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      webdb_uid: 40455,
      title: 'ÖAW Christmas Talk 2026',
      teaser: null,
      event_at: '2026-12-16T17:00:00Z',
      event_end_at: null,
      location_title: 'Festsaal',
      organizer_title: null,
      institute: 'ÖAW',
      lang: 'de',
      available_langs: ['de', 'en'],
      url: null,
      decision: 'undecided',
      has_bodytext: true,
      has_draft: false,
    });
  });
});
