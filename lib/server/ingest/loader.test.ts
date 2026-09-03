import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  publicationTypes, lectureTypes, orgunitTypes, memberTypes, oestat6Categories,
  orgunits, extunits, persons, projects, lectures, publications,
  personPublications, orgunitPublications,
} from '@/lib/server/db/schema';
import type { CanonicalBatch, CanonicalPublication } from './canonical';
import { PUBLICATION_WEBDB_UPDATE } from './canonical';

// Loader (ADR 0017) ohne DB: `./upsert` wird gemockt und das Fake-`db` liefert
// die fkMap-Zeilen. Festgenagelt werden die drei tragenden Pfade — (1) die
// EXAKTE Import-Reihenfolge inkl. Backfill-Funktionen + Matview-Refresh am
// Ende, (2) die Publications-Passage (DOI-Pre-Clean nur bei DOIs im Dump,
// Archivierung der Dump-Abwesenden, Analyse-Erhalt via PUBLICATION_WEBDB_UPDATE),
// (3) die Junction-FK-Auflösung (unauflösbare Paare fallen raus, aufgelöste
// tragen die UUIDs aus der fkMap).

const upsertBatch = vi.fn(async () => {});
const execCountingUpdate = vi.fn(async () => 0);
const execScalar = vi.fn(async () => 0);
vi.mock('./upsert', () => ({
  upsertBatch: (...a: unknown[]) => upsertBatch(...(a as [])),
  execCountingUpdate: (...a: unknown[]) => execCountingUpdate(...(a as [])),
  execScalar: (...a: unknown[]) => execScalar(...(a as [])),
}));

const { runIngest } = await import('./loader');

const dialect = new PgDialect();
const render = (q: SQL) => dialect.sqlToQuery(q).sql.replace(/\s+/g, ' ').trim();

// fkMap-Zeilen je Tabelle (Identität der Drizzle-Tabellenobjekte als Schlüssel).
const fkRows = new Map<unknown, Array<{ id: string; webdbUid: number }>>();
const executed: SQL[] = [];

const fakeDb = {
  select: () => ({ from: (table: unknown) => Promise.resolve(fkRows.get(table) ?? []) }),
  execute: vi.fn(async (q: SQL) => {
    executed.push(q);
    return [];
  }),
};

const emptyBatch = (): CanonicalBatch => ({
  lookups: {
    publicationTypes: [], lectureTypes: [], orgunitTypes: [],
    memberTypes: [], oestat6Categories: [],
  },
  orgunits: [], extunits: [], persons: [], projects: [], lectures: [], publications: [],
  junctions: {
    personPublications: [], orgunitPublications: [], publicationProjects: [],
    personOestat6: [], lecturePersons: [], lectureOrgunits: [], projectLectures: [],
    extunitPersons: [], orgunitPersons: [],
  },
});

const pub = (webdbUid: number, over: Partial<CanonicalPublication> = {}): CanonicalPublication => ({
  webdbUid,
  title: `Pub ${webdbUid}`,
  originalTitle: null, summaryDe: null, summaryEn: null,
  doi: null, doiLink: null, publishedAt: null, ris: null,
  publicationTypeWebdbUid: null,
  peerReviewed: false, popularScience: false,
  openAccessStatus: null, openAccess: false, oaType: null,
  leadAuthor: null, websiteLink: null, downloadLink: null,
  citationApa: null, citationDe: null, citationEn: null,
  bibtex: null, endnote: null, citation: null,
  webdbTstamp: null, webdbCrdate: null, archived: false,
  ...over,
});

const run = (batch: CanonicalBatch) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runIngest(fakeDb as any, batch, { promoteSource: 'webdb-import' });

beforeEach(() => {
  upsertBatch.mockClear();
  execCountingUpdate.mockClear();
  execScalar.mockClear();
  fakeDb.execute.mockClear();
  fkRows.clear();
  executed.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('runIngest — Reihenfolge und Abschlussschritte', () => {
  it('fährt die .mjs-Reihenfolge: Lookups → Entitäten → Pubs → Junctions → Backfills → Matview', async () => {
    await run(emptyBatch());

    // upsertBatch-Tabellen in Aufrufreihenfolge (leere Batches upserten trotzdem
    // mit 0 Zeilen — die Reihenfolge ist die Invariante).
    const tables = upsertBatch.mock.calls.map((c) => (c as unknown[])[1]);
    expect(tables.slice(0, 5)).toEqual([
      publicationTypes, lectureTypes, orgunitTypes, memberTypes, oestat6Categories,
    ]);
    expect(tables.slice(5, 11)).toEqual([
      orgunits, extunits, persons, projects, lectures, publications,
    ]);
    // Junctions beginnen mit person_publications/orgunit_publications.
    expect(tables[11]).toBe(personPublications);
    expect(tables[12]).toBe(orgunitPublications);

    // Die drei Bestands-Backfills, in dieser Reihenfolge.
    const scalars = execScalar.mock.calls.map((c) => render((c as unknown[])[1] as SQL));
    expect(scalars).toEqual([
      'backfill_lead_author_from_persons()',
      'backfill_published_at_from_text()',
      expect.stringContaining('promote_press_release_orphans_logged'),
    ]);
    // promoteSource wandert als Parameter in die Promotion-Funktion.
    const promoteQuery = dialect.sqlToQuery((execScalar.mock.calls[2] as unknown[])[1] as SQL);
    expect(promoteQuery.params).toEqual(['webdb-import']);

    // Letzter Schritt: Matview-Refresh (CONCURRENTLY).
    const lastExec = render(executed[executed.length - 1]);
    expect(lastExec).toBe('REFRESH MATERIALIZED VIEW CONCURRENTLY publication_oestat6');
  });
});

describe('runIngest — Publications-Passage', () => {
  it('ohne DOIs im Dump: KEIN Pre-Clean, aber Archivierung der Dump-Abwesenden', async () => {
    const batch = emptyBatch();
    batch.publications = [pub(101)];
    await run(batch);

    const updates = execCountingUpdate.mock.calls.map((c) => render((c as unknown[])[1] as SQL));
    const pubUpdates = updates.filter((s) => s.startsWith('UPDATE publications'));
    // Nur EIN publications-UPDATE: das Archiv-Statement, kein DOI-Pre-Clean.
    expect(pubUpdates).toHaveLength(1);
    expect(pubUpdates[0]).toContain('SET archived = true');
    expect(pubUpdates[0]).toContain('webdb_uid <> ALL');
    expect(pubUpdates[0]).not.toContain('doi = ANY');
  });

  it('mit DOI: Pre-Clean archiviert+nullt DOI-Kollisionen VOR dem Upsert', async () => {
    const batch = emptyBatch();
    batch.publications = [pub(101, { doi: '10.1000/x1' })];
    await run(batch);

    const updates = execCountingUpdate.mock.calls.map((c) => render((c as unknown[])[1] as SQL));
    const preClean = updates.find((s) => s.includes('doi = ANY'));
    expect(preClean).toBeTruthy();
    expect(preClean).toContain('SET archived = true, doi = NULL');
    expect(preClean).toContain('webdb_uid <> ALL');
  });

  it('mappt Pub-Zeilen mit aufgelöstem publication_type und archived=false; Update-Set = WebDB-Spalten', async () => {
    fkRows.set(publicationTypes, [{ id: 'pt-uuid-5', webdbUid: 5 }]);
    const batch = emptyBatch();
    batch.publications = [
      pub(101, { publicationTypeWebdbUid: 5 }),
      pub(102, { publicationTypeWebdbUid: 999 }), // unbekannter Typ → null
    ];
    await run(batch);

    const call = upsertBatch.mock.calls.find((c) => (c as unknown[])[1] === publications) as unknown[];
    expect(call).toBeTruthy();
    const rows = call[2] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ webdbUid: 101, publicationTypeId: 'pt-uuid-5', archived: false });
    expect(rows[1]).toMatchObject({ webdbUid: 102, publicationTypeId: null });
    // Analyse-Erhalt: das ON-CONFLICT-Set ist exakt die WebDB-Spaltenliste —
    // niemals Analyse-/Decision-Spalten (Disjunktheit prüft webdb.normalize.test).
    expect(call[3]).toBe('webdbUid');
    expect(call[4]).toBe(PUBLICATION_WEBDB_UPDATE);
  });
});

describe('runIngest — Junction-FK-Auflösung', () => {
  it('löst person_publications über die fkMaps auf und verwirft unauflösbare Paare', async () => {
    fkRows.set(persons, [{ id: 'person-uuid-1', webdbUid: 1 }]);
    fkRows.set(publications, [{ id: 'pub-uuid-10', webdbUid: 10 }]);
    const batch = emptyBatch();
    batch.junctions.personPublications = [
      { personWebdbUid: 1, publicationWebdbUid: 10, highlight: true, mahighlight: false, authorship: 'lead' },
      { personWebdbUid: 2, publicationWebdbUid: 10, highlight: false, mahighlight: false, authorship: null }, // Person unbekannt
      { personWebdbUid: 1, publicationWebdbUid: 11, highlight: false, mahighlight: false, authorship: null }, // Pub unbekannt
    ];
    await run(batch);

    // TRUNCATE vor dem Junction-Upsert (faithful zum .mjs-Skript).
    expect(executed.map(render)).toContain('TRUNCATE person_publications');

    const call = upsertBatch.mock.calls.find(
      (c) => (c as unknown[])[1] === personPublications,
    ) as unknown[];
    const rows = call[2] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      personId: 'person-uuid-1',
      publicationId: 'pub-uuid-10',
      highlight: true,
      authorship: 'lead',
    });
  });

  it('orgunit_publications: nach dem Upsert wird is_ita_subtree über das ITA-Prädikat aufgefrischt', async () => {
    fkRows.set(orgunits, [{ id: 'org-uuid-7', webdbUid: 7 }]);
    fkRows.set(publications, [{ id: 'pub-uuid-10', webdbUid: 10 }]);
    const batch = emptyBatch();
    batch.junctions.orgunitPublications = [
      { orgunitWebdbUid: 7, publicationWebdbUid: 10, highlight: false },
    ];
    await run(batch);

    const call = upsertBatch.mock.calls.find(
      (c) => (c as unknown[])[1] === orgunitPublications,
    ) as unknown[];
    expect(call[2]).toEqual([
      { orgunitId: 'org-uuid-7', publicationId: 'pub-uuid-10', highlight: false, sorting: null },
    ]);

    const itaRefresh = execCountingUpdate.mock.calls
      .map((c) => render((c as unknown[])[1] as SQL))
      .find((s) => s.includes('is_ita_subtree'));
    expect(itaRefresh).toBeTruthy();
    expect(itaRefresh).toContain("ILIKE 'ITA%'");
  });
});
