import { describe, it, expect } from 'vitest';
import { normalizeWebdb, type RawWebdb, type RawPublication }
  from './adapters/webdb-normalize';
import {
  PUBLICATION_WEBDB_UPDATE, PUBLICATION_ANALYSIS_COLUMNS,
} from './canonical';

// Minimal all-empty raw source; tests override the slice they exercise.
function emptyRaw(): RawWebdb {
  return {
    publicationTypes: [], lectureTypes: [], orgunitTypes: [],
    memberTypes: [], oestat6Categories: [], orgunits: [], extunits: [],
    persons: [], projects: [], lectures: [], publications: [],
    personPublications: [], orgunitPublications: [], publicationProjects: [],
    personOestat6: [], lecturePersons: [], lectureOrgunits: [],
    projectLectures: [], extunitPersons: [], orgunitPersons: [],
  };
}

// Stub extractor: doi == doi_link verbatim (the real shared
// scripts/lib/doi-extract.mjs has its own coverage; normalize() only needs
// a deterministic injected fn).
const stubDoi = (r: RawPublication) => r.doi_link ?? null;

function pub(over: Partial<RawPublication>): RawPublication {
  return {
    uid: 1, original_title: 'T', summary_de: null, summary_en: null,
    doi_link: null, pub_date: null, ris: null, type: null,
    peer_reviewed: 0, popular_science: 0, open_access: null,
    lead_author: null, website_link: null, download_link: null,
    citation_apa: null, citation_de: null,
    citation_en: null, bibtex: null, endnote: null,
    tstamp: null, crdate: null, ...over,
  };
}

describe('normalizeWebdb — faithful port of webdb-import.mjs transforms', () => {
  it('dedupes shared DOIs keeping the lowest webdb_uid (source quirk)', () => {
    const raw = emptyRaw();
    raw.publications = [
      pub({ uid: 30, doi_link: '10.1/x' }),
      pub({ uid: 10, doi_link: '10.1/x' }),
      pub({ uid: 20, doi_link: '10.1/y' }),
    ];
    const { publications } = normalizeWebdb(raw, stubDoi);
    // output is sorted ascending by webdb_uid (faithful)
    expect(publications.map((p) => p.webdbUid)).toEqual([10, 20, 30]);
    expect(publications.find((p) => p.webdbUid === 10)!.doi).toBe('10.1/x');
    expect(publications.find((p) => p.webdbUid === 30)!.doi).toBeNull();
    expect(publications.find((p) => p.webdbUid === 20)!.doi).toBe('10.1/y');
  });

  it('title/original_title fallbacks differ ("(untitled)" vs null)', () => {
    const raw = emptyRaw();
    raw.publications = [pub({ uid: 1, original_title: '' })];
    const [p] = normalizeWebdb(raw, stubDoi).publications;
    expect(p.title).toBe('(untitled)');
    expect(p.originalTitle).toBeNull();
  });

  it('nullIfEmpty / truthy / tsDate / tsTimestamp behave like the .mjs', () => {
    const raw = emptyRaw();
    raw.publications = [pub({
      uid: 1, summary_de: '', peer_reviewed: 1, popular_science: 0,
      pub_date: 0, tstamp: 1_700_000_000, crdate: 0,
    })];
    const [p] = normalizeWebdb(raw, stubDoi).publications;
    expect(p.summaryDe).toBeNull();          // '' -> null
    expect(p.peerReviewed).toBe(true);       // 1 -> true
    expect(p.popularScience).toBe(false);    // 0 -> false
    expect(p.publishedAt).toBeNull();        // ts 0 -> null
    expect(p.webdbTstamp).toBe(new Date(1_700_000_000_000).toISOString());
    expect(p.webdbCrdate).toBeNull();        // ts 0 -> null
  });

  it('open_access boolean = startsWith("oa_"); status/type kept verbatim', () => {
    const raw = emptyRaw();
    raw.publications = [
      pub({ uid: 1, open_access: 'oa_gold' }),
      pub({ uid: 2, open_access: 'closed' }),
      pub({ uid: 3, open_access: null }),
    ];
    const ps = normalizeWebdb(raw, stubDoi).publications;
    expect(ps[0]).toMatchObject({
      openAccess: true, oaType: 'oa_gold', openAccessStatus: 'oa_gold',
    });
    expect(ps[1]).toMatchObject({ openAccess: false, oaType: 'closed' });
    expect(ps[2]).toMatchObject({ openAccess: false, oaType: null });
  });

  it('citation = citation_de || citation_apa (.mjs precedence)', () => {
    const raw = emptyRaw();
    raw.publications = [
      pub({ uid: 1, citation_de: 'DE', citation_apa: 'APA' }),
      pub({ uid: 2, citation_de: null, citation_apa: 'APA' }),
      pub({ uid: 3, citation_de: null, citation_apa: null }),
    ];
    const ps = normalizeWebdb(raw, stubDoi).publications;
    expect(ps[0].citation).toBe('DE');
    expect(ps[1].citation).toBe('APA');
    expect(ps[2].citation).toBeNull();
  });

  it('person_publications: authorship "?" and "" both -> null', () => {
    const raw = emptyRaw();
    raw.personPublications = [
      { person: 1, publication: 2, highlight: 1, mahighlight: 0, authorship: '?' },
      { person: 3, publication: 4, highlight: 0, mahighlight: 1, authorship: '' },
      { person: 5, publication: 6, highlight: 0, mahighlight: 0, authorship: 'aut' },
    ];
    const jp = normalizeWebdb(raw, stubDoi).junctions.personPublications;
    expect(jp[0]).toMatchObject({ authorship: null, highlight: true, mahighlight: false });
    expect(jp[1]).toMatchObject({ authorship: null, mahighlight: true });
    expect(jp[2].authorship).toBe('aut');
  });

  it('lookups coalesce name_de/name_en to "" (.mjs `|| ""`)', () => {
    const raw = emptyRaw();
    raw.publicationTypes = [{ uid: 7, name_de: null, name_en: null }];
    const [lk] = normalizeWebdb(raw, stubDoi).lookups.publicationTypes;
    expect(lk).toEqual({ webdbUid: 7, nameDe: '', nameEn: '' });
  });

  it('FK uids pass through unresolved (loader resolves to UUID later)', () => {
    const raw = emptyRaw();
    raw.orgunits = [{
      uid: 1, name_de: 'O', name_en: null, akronym_de: null,
      akronym_en: null, url_de: null, url_en: null, type: 5,
      superior_organizational_unit: 0,
    }];
    const [o] = normalizeWebdb(raw, stubDoi).orgunits;
    expect(o.typeWebdbUid).toBe(5);
    expect(o.parentWebdbUid).toBeNull(); // `superior || null`: 0 -> null
  });
});

describe('data-safety contract (ADR 0017 / production_db_safety)', () => {
  it('WebDB update set is DISJOINT from the analysis column set', () => {
    const analysis = new Set<string>(PUBLICATION_ANALYSIS_COLUMNS);
    const overlap = PUBLICATION_WEBDB_UPDATE.filter((c) => analysis.has(c));
    expect(overlap).toEqual([]);
  });

  it('WebDB update set is exactly the 27 .mjs-owned columns', () => {
    expect(PUBLICATION_WEBDB_UPDATE).toHaveLength(27);
    // spot-check the invariant both ways
    for (const c of ['title', 'doi', 'archived', 'syncedAt', 'leadAuthor']) {
      expect(PUBLICATION_WEBDB_UPDATE).toContain(c);
    }
    for (const c of ['reasoning', 'pressScore', 'decision', 'haiku',
      'analysisStatus']) {
      expect(PUBLICATION_ANALYSIS_COLUMNS).toContain(c);
      expect(PUBLICATION_WEBDB_UPDATE as readonly string[]).not.toContain(c);
    }
  });
});
