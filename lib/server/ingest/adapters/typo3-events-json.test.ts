import { describe, it, expect } from 'vitest';
import {
  normalizeJsonEvent,
  parseEventNewsGrouped,
  type RawJsonEvent,
  type EventNewsGroupedExport,
} from './typo3-events-json';

function raw(over: Partial<RawJsonEvent> = {}): RawJsonEvent {
  return {
    uid: 35908,
    pid: 11130,
    title: 'Lysosomes at the crossroads of neurodegeneration',
    datetime: 1783407600, // 2026-07-07, the real GMI sample
    event_end: 0,
    full_day: 0,
    organizer_simple: 'Shyamal Mosalaganti',
    location_simple: 'Max Perutz Labs SR 1 (6.501)',
    teaser: null,
    path_segment: 'lysosomes-at-the-crossroads-of-neurodegeneration',
    event_information: null,
    ...over,
  };
}

describe('normalizeJsonEvent', () => {
  it('returns null when datetime is non-positive (skipped count)', () => {
    expect(normalizeJsonEvent(raw({ datetime: 0 }), 'GMI')).toBeNull();
    expect(normalizeJsonEvent(raw({ datetime: -1 }), 'GMI')).toBeNull();
  });

  it('maps the GMI sample to the NormalizedEvent shape', () => {
    const n = normalizeJsonEvent(raw(), 'GMI');
    expect(n).toEqual({
      webdbUid: 35908,
      title: 'Lysosomes at the crossroads of neurodegeneration',
      teaser: null,
      bodytext: null,
      eventInformation: null,
      eventAt: '2026-07-07T07:00:00.000Z',
      eventEndAt: null, // event_end 0 → null
      locationTitle: 'Max Perutz Labs SR 1 (6.501)',
      organizerTitle: 'Shyamal Mosalaganti',
      institute: 'GMI',
      url: null, // export has no externalurl/internalurl, path_segment is not faked
      lang: null, // export carries no sys_language_uid
      availableLangs: [],
    });
  });

  it('empty strings normalise to null; event_end>0 becomes a timestamp', () => {
    const n = normalizeJsonEvent(
      raw({ teaser: '', organizer_simple: '', location_simple: '', event_end: 1783411200 }),
      'GMI',
    );
    expect(n!.teaser).toBeNull();
    expect(n!.organizerTitle).toBeNull();
    expect(n!.locationTitle).toBeNull(); // no location_simple, no event_information
    expect(n!.eventEndAt).toBe('2026-07-07T08:00:00.000Z');
  });

  it('falls back to the event_information sidebar for the location', () => {
    const n = normalizeJsonEvent(
      raw({
        location_simple: null,
        event_information: '<p><strong>Ort:</strong> Festsaal, 1010 Wien</p>',
      }),
      'GMI',
    );
    expect(n!.locationTitle).toBe('Festsaal, 1010 Wien');
  });

  it('null institute stays null', () => {
    expect(normalizeJsonEvent(raw(), null)!.institute).toBeNull();
  });
});

describe('parseEventNewsGrouped', () => {
  const exp = (data: EventNewsGroupedExport['data']): EventNewsGroupedExport => ({
    meta: { generated_at_readable: '2026-06-26 03:05:58' },
    data,
  });

  it('groups events by institute key and reads meta', () => {
    const r = parseEventNewsGrouped(
      exp({ GMI: { events: [raw()] }, ACDH: { events: [raw({ uid: 2, title: 'B' })] } }),
    );
    expect(r.events.map((e) => e.webdbUid)).toEqual([35908, 2]);
    expect(r.events.map((e) => e.institute)).toEqual(['GMI', 'ACDH']);
    expect(r.institutes).toEqual(['GMI', 'ACDH']);
    expect(r.generatedAt).toBe('2026-06-26 03:05:58');
    expect(r.skipped).toBe(0);
    expect(r.duplicates).toBe(0);
  });

  it('dedupes a webdb_uid that appears under two institutes (first wins)', () => {
    const r = parseEventNewsGrouped(
      exp({ GMI: { events: [raw({ uid: 7 })] }, IMBA: { events: [raw({ uid: 7 })] } }),
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0].institute).toBe('GMI');
    expect(r.duplicates).toBe(1);
  });

  it('counts non-positive datetimes as skipped', () => {
    const r = parseEventNewsGrouped(exp({ GMI: { events: [raw(), raw({ uid: 9, datetime: 0 })] } }));
    expect(r.events).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it('tolerates a bare-array institute group and missing data', () => {
    expect(parseEventNewsGrouped(exp({ GMI: [raw()] })).events).toHaveLength(1);
    expect(parseEventNewsGrouped({}).events).toEqual([]);
  });
});
