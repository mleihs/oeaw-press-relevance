import { describe, it, expect } from 'vitest';
import {
  extractLocationFromEventInfo,
  normalizeTypo3Event,
  type RawTypo3Event,
} from './typo3-events';

function raw(over: Partial<RawTypo3Event> = {}): RawTypo3Event {
  return {
    uid: 1,
    title: 'Vortrag',
    teaser: null,
    bodytext: null,
    event_information: null,
    datetime: 1748246400, // 2025-05-26T08:00:00Z, arbitrary far-past for unit-time stability
    event_end: null,
    sys_language_uid: 0,
    externalurl: null,
    internalurl: null,
    rss_external_id: null,
    path_segment: null,
    location_title: null,
    organizer_title: null,
    institute: null,
    translation_langs: null,
    ...over,
  };
}

describe('normalizeTypo3Event', () => {
  it('returns null when datetime is missing or non-positive (skipped count)', () => {
    expect(normalizeTypo3Event(raw({ datetime: 0 }))).toBeNull();
    expect(normalizeTypo3Event(raw({ datetime: -1 }))).toBeNull();
  });

  it('maps datetime to ISO timestamptz string (not date-only)', () => {
    const n = normalizeTypo3Event(raw({ datetime: 1748246400 }));
    expect(n).not.toBeNull();
    expect(n!.eventAt).toBe('2025-05-26T08:00:00.000Z');
  });

  it('maps event_end when set, leaves null when 0/undefined', () => {
    expect(normalizeTypo3Event(raw({ event_end: 0 }))?.eventEndAt).toBeNull();
    expect(normalizeTypo3Event(raw({ event_end: null }))?.eventEndAt).toBeNull();
    expect(
      normalizeTypo3Event(raw({ datetime: 1748246400, event_end: 1748253600 }))?.eventEndAt,
    ).toBe('2025-05-26T10:00:00.000Z');
  });

  it('maps sys_language_uid 0/1/-1 to de/en/mul, unknown → null', () => {
    expect(normalizeTypo3Event(raw({ sys_language_uid: 0 }))?.lang).toBe('de');
    expect(normalizeTypo3Event(raw({ sys_language_uid: 1 }))?.lang).toBe('en');
    expect(normalizeTypo3Event(raw({ sys_language_uid: -1 }))?.lang).toBe('mul');
    expect(normalizeTypo3Event(raw({ sys_language_uid: 42 }))?.lang).toBeNull();
  });

  it('locationTitle falls back to extractLocationFromEventInfo when structured field is empty', () => {
    const info = `
      <h5>Termin</h5><p>27. Mai 2026</p>
      <h5>Ort</h5><p>Otto Wagner Postsparkasse, Georg-Coch-Platz 2, 1010 Wien</p>
      <h5>Veranstalter</h5><p>ÖAW-ÖAI</p>
    `;
    expect(
      normalizeTypo3Event(raw({ event_information: info }))?.locationTitle,
    ).toBe('Otto Wagner Postsparkasse, Georg-Coch-Platz 2, 1010 Wien');
    // Structured field wins when both are populated.
    expect(
      normalizeTypo3Event(
        raw({ location_title: 'Saal A', event_information: info }),
      )?.locationTitle,
    ).toBe('Saal A');
  });

  it('availableLangs combines original + translations, deduped, ordered de→en, expands -1 to [de,en]', () => {
    // No translations → just the original.
    expect(
      normalizeTypo3Event(raw({ sys_language_uid: 0, translation_langs: null }))
        ?.availableLangs,
    ).toEqual(['de']);
    // DE original + EN translation → both.
    expect(
      normalizeTypo3Event(raw({ sys_language_uid: 0, translation_langs: '1' }))
        ?.availableLangs,
    ).toEqual(['de', 'en']);
    // mul original (no translations) — expanded to ['de','en'] because
    // sys_language_uid=-1 is a language-agnostic marker, not a language.
    expect(
      normalizeTypo3Event(raw({ sys_language_uid: -1, translation_langs: null }))
        ?.availableLangs,
    ).toEqual(['de', 'en']);
    // mul + EN translation → still just [de,en] (mul already covers both).
    expect(
      normalizeTypo3Event(raw({ sys_language_uid: -1, translation_langs: '1' }))
        ?.availableLangs,
    ).toEqual(['de', 'en']);
    // Unknown translation uids (e.g. 2 = italian) get dropped silently.
    expect(
      normalizeTypo3Event(raw({ sys_language_uid: 0, translation_langs: '1,2' }))
        ?.availableLangs,
    ).toEqual(['de', 'en']);
  });

  it('URL cascade: externalurl → rss_external_id → internalurl → null', () => {
    // Direct external URL wins.
    expect(
      normalizeTypo3Event(
        raw({
          externalurl: 'https://example.org/x',
          rss_external_id: 'https://rss.example/y',
        }),
      )?.url,
    ).toBe('https://example.org/x');
    // Non-URL externalurl (TYPO3 t3:// link) falls through to RSS id.
    expect(
      normalizeTypo3Event(
        raw({
          externalurl: 't3://page?uid=42',
          rss_external_id: 'http://seminars.viennabiocenter.org/x',
        }),
      )?.url,
    ).toBe('http://seminars.viennabiocenter.org/x');
    // Only internalurl set.
    expect(
      normalizeTypo3Event(raw({ internalurl: 'https://intern.oeaw.ac.at/x' }))?.url,
    ).toBe('https://intern.oeaw.ac.at/x');
    // None set → null (no fake oeaw.ac.at fallback).
    expect(normalizeTypo3Event(raw({ path_segment: 'mein-event' }))?.url).toBeNull();
  });

  it('passes title verbatim and nullIfEmpty-coerces teaser / location / organizer / bodytext / institute', () => {
    const n = normalizeTypo3Event(
      raw({
        title: 'Foo',
        teaser: '',
        bodytext: '',
        location_title: 'Saal A',
        organizer_title: '',
        institute: 'GMI',
      }),
    );
    expect(n?.title).toBe('Foo');
    expect(n?.teaser).toBeNull();
    expect(n?.bodytext).toBeNull();
    expect(n?.locationTitle).toBe('Saal A');
    expect(n?.organizerTitle).toBeNull();
    expect(n?.institute).toBe('GMI');
  });
});

describe('extractLocationFromEventInfo — cheerio label-proximity walker', () => {
  it('null inputs and no-match cases', () => {
    expect(extractLocationFromEventInfo(null)).toBeNull();
    expect(extractLocationFromEventInfo('')).toBeNull();
    expect(extractLocationFromEventInfo('<p>nothing about location</p>')).toBeNull();
  });

  it('inline <p><strong>Ort:</strong><br/>… (the most common authoring shape)', () => {
    const html =
      '<p><strong>Ort:</strong><br /> Universität Wien<br /> Universitätsring 1<br /> 1010 Wien</p>';
    expect(extractLocationFromEventInfo(html)).toBe(
      'Universität Wien, Universitätsring 1, 1010 Wien',
    );
  });

  it('Word-paste <strong class="..." data-...>Ort:</strong>&nbsp; variant', () => {
    const html =
      '<p><strong class="BCX9 SCXW245945333 TextRun" data-contrast="auto">Ort:</strong>&nbsp;<br /> ÖAW<br /> Postsparkasse</p>';
    expect(extractLocationFromEventInfo(html)).toBe('ÖAW, Postsparkasse');
  });

  it('heading + next <p>: <h2>Ort</h2><p>…</p>', () => {
    expect(
      extractLocationFromEventInfo(
        '<h2>Ort</h2>\r\n<p>Museumszimmer, Dr.-Ignaz-Seipel-Platz 2, 1010 Wien</p>',
      ),
    ).toBe('Museumszimmer, Dr.-Ignaz-Seipel-Platz 2, 1010 Wien');
  });

  it('heading + next <ul>: <h5>Ort</h5><ul><li>…</li></ul>', () => {
    expect(
      extractLocationFromEventInfo(
        '<h5>Ort</h5><ul><li>Naturhistorisches Museum Wien</li></ul>',
      ),
    ).toBe('Naturhistorisches Museum Wien');
  });

  it('label-only <p>, content in next <p>', () => {
    expect(
      extractLocationFromEventInfo(
        '<p><strong>Ort</strong></p>\r\n<p>PSK-Gebäude, 1010 Wien, Georg Coch-Platz 2</p>',
      ),
    ).toBe('PSK-Gebäude, 1010 Wien, Georg Coch-Platz 2');
  });

  it('label-only <p>, content in next <ul><li>', () => {
    expect(
      extractLocationFromEventInfo(
        '<p class="MsoPlainText"><strong>Ort</strong></p>\r\n<ul> \t<li class="MsoPlainText">Naturhistorisches Museum Wien</li> </ul>',
      ),
    ).toBe('Naturhistorisches Museum Wien');
  });

  it('skips empty siblings (whitespace-only <h2>&nbsp;</h2>) to reach the real content', () => {
    const html =
      '<h2>Ort</h2>\r\n<p></p>\r\n<p>15.-16. Oktober: ÖAW, Bäckerstraße 13, 1010 Wien</p>';
    expect(extractLocationFromEventInfo(html)).toBe(
      '15.-16. Oktober: ÖAW, Bäckerstraße 13, 1010 Wien',
    );
  });

  it('alternative labels: Wo, Where, Conference Venue, Orte', () => {
    expect(
      extractLocationFromEventInfo(
        '<p><strong>Wo</strong><br /> WKO Steiermark, Körblergasse 111-113, 8010 Graz</p>',
      ),
    ).toBe('WKO Steiermark, Körblergasse 111-113, 8010 Graz');
    expect(
      extractLocationFromEventInfo(
        '<p><strong>Where</strong><br /> U.a.4 in-person and via Zoom</p>',
      ),
    ).toBe('U.a.4 in-person and via Zoom');
    expect(
      extractLocationFromEventInfo(
        '<p><strong>Conference Venue&nbsp;</strong><br /> Campus of the University of Vienna</p>',
      ),
    ).toBe('Campus of the University of Vienna');
    expect(
      extractLocationFromEventInfo(
        '<p><strong>Orte:</strong><br /> Diplomatische Akademie Wien</p>',
      ),
    ).toBe('Diplomatische Akademie Wien');
  });

  it('drops TBD/T.B.A.-style placeholder values', () => {
    expect(
      extractLocationFromEventInfo('<p><strong>Ort:</strong><br /> TBD</p>'),
    ).toBeNull();
    expect(
      extractLocationFromEventInfo('<p><strong>Venue:</strong><br /> TBA</p>'),
    ).toBeNull();
  });

  it('returns null when the label is missing entirely (prose-only)', () => {
    expect(
      extractLocationFromEventInfo(
        '<p><strong>October 14-17, 2026</strong></p><p><strong>Bayerische Staatsbibliothek München</strong></p>',
      ),
    ).toBeNull();
  });

  it('returns null when the entire info-block is just a link/button', () => {
    expect(
      extractLocationFromEventInfo(
        '<p><a class="btn btn-primary" href="t3://page?uid=12193">Institutskolloquium</a></p>',
      ),
    ).toBeNull();
  });
});
