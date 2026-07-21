import { describe, it, expect } from 'vitest';
import { buildEventsSortUrl, buildEventsUrl } from './build-events-url';

describe('buildEventsUrl', () => {
  it('emits the canonical /events for defaults', () => {
    expect(buildEventsUrl({})).toBe('/events');
    expect(buildEventsUrl({ tab: 'upcoming' })).toBe('/events');
    expect(buildEventsUrl({ tab: null, main: false })).toBe('/events');
  });

  it('encodes a non-default decision tab', () => {
    expect(buildEventsUrl({ tab: 'pitch' })).toBe('/events?tab=pitch');
  });

  it('encodes the main-news opt-in', () => {
    expect(buildEventsUrl({ main: true })).toBe('/events?main=1');
  });

  it('encodes a calendar view with its date anchor', () => {
    expect(buildEventsUrl({ view: 'month', date: '2026-07-01' })).toBe(
      '/events?view=month&date=2026-07-01',
    );
  });

  it('drops date when no view is set (date is calendar-only)', () => {
    expect(buildEventsUrl({ date: '2026-07-01' })).toBe('/events');
  });

  it('preserves all state together in a stable order', () => {
    expect(
      buildEventsUrl({ tab: 'hold', main: true, view: 'week', date: '2026-07-13' }),
    ).toBe('/events?tab=hold&main=1&view=week&date=2026-07-13');
  });

  it('emits a list-view sort href (sort + order together, with tab/main)', () => {
    expect(
      buildEventsUrl({ tab: 'pitch', main: true, sort: 'score', order: 'desc' }),
    ).toBe('/events?tab=pitch&main=1&sort=score&order=desc');
  });

  it('drops a sort with no order (both required, never half-emitted)', () => {
    expect(buildEventsUrl({ sort: 'score' })).toBe('/events');
  });

  it('encodes the list filters (q / band / institute)', () => {
    expect(buildEventsUrl({ q: 'quantum' })).toBe('/events?q=quantum');
    expect(buildEventsUrl({ band: 'high' })).toBe('/events?band=high');
    expect(buildEventsUrl({ institute: 'IMBA' })).toBe('/events?institute=IMBA');
  });

  it('carries the filters across a tab + a calendar view + a sort', () => {
    expect(
      buildEventsUrl({ tab: 'undecided', q: 'quantum', band: 'high', institute: 'IMBA' }),
    ).toBe('/events?tab=undecided&q=quantum&band=high&institute=IMBA');
    expect(buildEventsUrl({ band: 'high', view: 'month', date: '2026-07-01' })).toBe(
      '/events?band=high&view=month&date=2026-07-01',
    );
    expect(buildEventsUrl({ q: 'lecture', sort: 'score', order: 'desc' })).toBe(
      '/events?q=lecture&sort=score&order=desc',
    );
  });
});

// ---------------------------------------------------------------------------
// Sortierköpfe der Liste (app/events/_components/events-sort-header.tsx)
// ---------------------------------------------------------------------------
describe('buildEventsSortUrl', () => {
  const base = { tab: 'upcoming' as const, main: false, filters: {} };

  it('dreht die Richtung um, wenn man das aktive Feld klickt', () => {
    expect(
      buildEventsSortUrl({ ...base, field: 'score', sort: 'score', order: 'desc' }),
    ).toBe('/events?sort=score&order=asc');
    expect(
      buildEventsSortUrl({ ...base, field: 'score', sort: 'score', order: 'asc' }),
    ).toBe('/events?sort=score&order=desc');
  });

  it('startet ein anderes Feld mit seiner natürlichen Richtung', () => {
    // Nach „Datum absteigend" auf Relevanz zu klicken soll die BESTEN Events
    // zeigen, nicht die schlechtesten — die fremde Richtung wird nicht
    // mitgeschleppt.
    expect(
      buildEventsSortUrl({ ...base, field: 'score', sort: 'date', order: 'desc' }),
    ).toBe('/events?sort=score&order=desc');
    // Und umgekehrt: von „Relevanz absteigend" auf Datum → nächste zuerst.
    expect(
      buildEventsSortUrl({ ...base, field: 'date', sort: 'score', order: 'desc' }),
    ).toBe('/events');
  });

  it('lässt die Vorgabe (Datum aufsteigend) aus der URL fallen', () => {
    // Datum ist aktiv+absteigend → ein Klick führt zurück auf die Vorgabe, und
    // die hat die saubere Adresse ohne Query.
    expect(
      buildEventsSortUrl({ ...base, field: 'date', sort: 'date', order: 'desc' }),
    ).toBe('/events');
  });

  it('nimmt Suche, Band, Institut, Tab und Main-Toggle mit', () => {
    expect(
      buildEventsSortUrl({
        field: 'score',
        sort: 'date',
        order: 'asc',
        tab: 'pitch',
        main: true,
        filters: { q: 'lecture', band: 'high', institute: 'IMBA' },
      }),
    ).toBe('/events?tab=pitch&main=1&q=lecture&band=high&institute=IMBA&sort=score&order=desc');
  });

  it('behält die Filter auch dann, wenn die Sortierung auf die Vorgabe fällt', () => {
    expect(
      buildEventsSortUrl({
        ...base,
        field: 'date',
        sort: 'date',
        order: 'desc',
        filters: { q: 'lecture' },
      }),
    ).toBe('/events?q=lecture');
  });
});
