import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocking strategy (see memory:vitest_db_coupling_pattern).
//
// batch.ts is heavily side-effecting: it fans out to 6 enrichment sources and
// writes the merged result back via Drizzle. Vitest covers the *logic seams*
// (cascade branching, status derivation, abort handling, conditional
// published_at, the Phase-4 fallback PDF). The actual SQL semantics of
// fetchPublicationsForEnrichment live in the RSC smoke scripts.
//
// We keep the REAL Drizzle schema + sort helpers so drizzle-orm operators
// (inArray/eq/and/descNullsLast) act on real Column objects, and replace only
// the query executor with chainable, awaitable builders. Importing the real
// schema/sort modules avoids pulling in ./drizzle (which constructs a
// postgres client), so no DB connection is ever attempted.
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const updateSets: Array<Record<string, unknown>> = [];

  // A select chain ends in either `.where(...)` (explicit-ids path) or
  // `.limit(...)` (status path). Every method returns the same object and the
  // object is awaitable, so `await` resolves the canned rows at any depth.
  function selectBuilder(rows: unknown[]) {
    const b: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'limit']) b[m] = () => b;
    (b as { then: unknown }).then = (
      res: (v: unknown) => unknown,
      rej: (e: unknown) => unknown,
    ) => Promise.resolve(rows).then(res, rej);
    return b;
  }

  // db.update(pub).set(obj).where(eq(...)) — capture the SET payload, resolve
  // the terminal where() to an empty array.
  function updateBuilder() {
    const b: Record<string, unknown> = {};
    (b as { set: unknown }).set = (obj: Record<string, unknown>) => {
      updateSets.push(obj);
      return b;
    };
    (b as { where: unknown }).where = () => Promise.resolve([]);
    return b;
  }

  return { selectQueue, updateSets, selectBuilder, updateBuilder };
});

vi.mock('./crossref', () => ({ enrichFromCrossRef: vi.fn() }));
vi.mock('./openalex', () => ({ enrichFromOpenAlex: vi.fn() }));
vi.mock('./unpaywall', () => ({ enrichFromUnpaywall: vi.fn() }));
vi.mock('./semantic-scholar', () => ({ enrichFromSemanticScholar: vi.fn() }));
vi.mock('./pdf-extract', () => ({ enrichFromPdf: vi.fn() }));

// Keep the real WEBDB_SOURCE_TAG constant; stub only the predicate function.
vi.mock('./webdb-native', async (orig) => ({
  ...(await orig<typeof import('./webdb-native')>()),
  enrichFromWebDb: vi.fn(),
}));

// publicationToApi is identity here; row-transform correctness is covered by
// lib/server/publications/to-api.test.ts (Phase 4.2).
vi.mock('../publications/to-api', () => ({
  publicationToApi: vi.fn((row: unknown) => row),
}));

vi.mock('@/lib/server/db', async () => {
  const schema = await vi.importActual<typeof import('@/lib/server/db/schema')>(
    '@/lib/server/db/schema',
  );
  const sort = await vi.importActual<typeof import('@/lib/server/db/sort')>(
    '@/lib/server/db/sort',
  );
  return {
    ...schema,
    ...sort,
    db: {
      select: vi.fn(() => h.selectBuilder(h.selectQueue.shift() ?? [])),
      update: vi.fn(() => h.updateBuilder()),
    },
  };
});

import {
  enrichmentPayloadToFilters,
  fetchPublicationsForEnrichment,
  runEnrichmentBatch,
} from './batch';
import { enrichFromCrossRef } from './crossref';
import { enrichFromOpenAlex } from './openalex';
import { enrichFromUnpaywall } from './unpaywall';
import { enrichFromSemanticScholar } from './semantic-scholar';
import { enrichFromPdf } from './pdf-extract';
import { enrichFromWebDb, WEBDB_SOURCE_TAG } from './webdb-native';
import { db } from '@/lib/server/db';
import type { Publication } from '@/lib/shared/types';

const mockCrossRef = vi.mocked(enrichFromCrossRef);
const mockOpenAlex = vi.mocked(enrichFromOpenAlex);
const mockUnpaywall = vi.mocked(enrichFromUnpaywall);
const mockS2 = vi.mocked(enrichFromSemanticScholar);
const mockPdf = vi.mocked(enrichFromPdf);
const mockWebDb = vi.mocked(enrichFromWebDb);
const selectSpy = vi.mocked(db.select);

function makePub(overrides: Partial<Publication> = {}): Publication {
  return {
    id: 'pub-1',
    webdb_uid: 1,
    csv_uid: null,
    title: 'Test Publication',
    original_title: null,
    lead_author: null,
    abstract: null,
    summary_de: null,
    summary_en: null,
    doi: null,
    doi_link: null,
    published_at: null,
    publication_type: null,
    publication_type_id: null,
    open_access: false,
    open_access_status: null,
    oa_type: null,
    url: null,
    website_link: null,
    download_link: null,
    citation: null,
    citation_apa: null,
    citation_de: null,
    citation_en: null,
    ris: null,
    bibtex: null,
    endnote: null,
    peer_reviewed: false,
    popular_science: false,
    archived: false,
    webdb_tstamp: null,
    webdb_crdate: null,
    synced_at: null,
    enrichment_status: 'pending',
    enriched_abstract: null,
    enriched_keywords: null,
    enriched_journal: null,
    enriched_source: null,
    full_text_snippet: null,
    word_count: 0,
    analysis_status: 'pending',
    press_score: null,
    press_similarity: null,
    public_accessibility: null,
    societal_relevance: null,
    novelty_factor: null,
    storytelling_potential: null,
    media_timeliness: null,
    pitch_suggestion: null,
    target_audience: null,
    suggested_angle: null,
    reasoning: null,
    haiku: null,
    llm_model: null,
    analysis_cost: null,
    import_batch: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    meistertask_task_id: null,
    meistertask_task_token: null,
    decision: 'undecided',
    decided_at: null,
    decided_by: null,
    decision_rationale: null,
    snooze_until: null,
    flag_notes: [],
    decided_in_session: null,
    ...overrides,
  };
}

type Ev = { type: string; data: Record<string, unknown> };

function collectEvents() {
  const events: Ev[] = [];
  const emit = vi.fn((type: string, data: unknown) => {
    events.push({ type, data: data as Record<string, unknown> });
  });
  return { events, emit };
}

const ofType = (events: Ev[], type: string) =>
  events.filter((e) => e.type === type);
const complete = (events: Ev[]) =>
  events.find((e) => e.type === 'complete')?.data;

beforeEach(() => {
  vi.clearAllMocks();
  h.selectQueue.length = 0;
  h.updateSets.length = 0;
  mockCrossRef.mockResolvedValue(null);
  mockOpenAlex.mockResolvedValue(null);
  mockUnpaywall.mockResolvedValue(null);
  mockS2.mockResolvedValue(null);
  mockPdf.mockResolvedValue(null);
  mockWebDb.mockReturnValue(null);
  // Collapse the inter-source pacing delays to keep the suite fast and
  // deterministic. batch.ts only uses the global setTimeout for `new
  // Promise(r => setTimeout(r, ms))`.
  vi.stubGlobal('setTimeout', ((fn: () => void) => {
    fn();
    return 0;
  }) as unknown as typeof globalThis.setTimeout);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('enrichmentPayloadToFilters', () => {
  it('maps snake_case wire payload to camelCase filters', () => {
    const f = enrichmentPayloadToFilters({
      limit: 30,
      include_partial: true,
      include_no_doi: true,
      ids: ['a', 'b'],
    });
    expect(f).toEqual({
      limit: 30,
      includePartial: true,
      includeNoDoi: true,
      explicitIds: ['a', 'b'],
    });
  });

  it('defaults explicitIds to null when ids is absent', () => {
    const f = enrichmentPayloadToFilters({
      limit: 20,
      include_partial: false,
      include_no_doi: false,
    });
    expect(f.explicitIds).toBeNull();
    expect(f.includePartial).toBe(false);
    expect(f.includeNoDoi).toBe(false);
  });
});

describe('fetchPublicationsForEnrichment', () => {
  it('explicit-ids path issues a single select and maps the rows', async () => {
    h.selectQueue.push([{ id: 'x1' }, { id: 'x2' }]);
    const rows = await fetchPublicationsForEnrichment({
      limit: 10,
      includePartial: false,
      includeNoDoi: false,
      explicitIds: ['x1', 'x2'],
    });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([{ id: 'x1' }, { id: 'x2' }]);
  });

  it('empty explicitIds array falls through to the status path', async () => {
    h.selectQueue.push([{ id: 'doi-row' }]);
    const rows = await fetchPublicationsForEnrichment({
      limit: 10,
      includePartial: false,
      includeNoDoi: false,
      explicitIds: [],
    });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(rows).toEqual([{ id: 'doi-row' }]);
  });

  it('skips the no-DOI query when includeNoDoi is false', async () => {
    h.selectQueue.push([{ id: 'd1' }, { id: 'd2' }]);
    const rows = await fetchPublicationsForEnrichment({
      limit: 10,
      includePartial: false,
      includeNoDoi: false,
      explicitIds: null,
    });
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(2);
  });

  it('skips the no-DOI query when DOI rows already fill the limit', async () => {
    h.selectQueue.push([{ id: 'd1' }, { id: 'd2' }]);
    const rows = await fetchPublicationsForEnrichment({
      limit: 2,
      includePartial: false,
      includeNoDoi: true,
      explicitIds: null,
    });
    // remaining = limit - doiRows.length = 0, so the guard skips select #2.
    expect(selectSpy).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(2);
  });

  it('issues the no-DOI query and concatenates when slots remain', async () => {
    h.selectQueue.push([{ id: 'd1' }]);
    h.selectQueue.push([{ id: 'n1' }, { id: 'n2' }]);
    const rows = await fetchPublicationsForEnrichment({
      limit: 5,
      includePartial: false,
      includeNoDoi: true,
      explicitIds: null,
    });
    expect(selectSpy).toHaveBeenCalledTimes(2);
    expect(rows).toEqual([{ id: 'd1' }, { id: 'n1' }, { id: 'n2' }]);
  });
});

describe('runEnrichmentBatch — abort handling', () => {
  it('emits cancelled and writes nothing when aborted before start', async () => {
    const { events, emit } = collectEvents();
    const ctrl = new AbortController();
    ctrl.abort();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x' })],
      abortSignal: ctrl.signal,
      emit,
    });
    expect(ofType(events, 'cancelled')[0]?.data).toEqual({
      processed: 0,
      total: 1,
    });
    expect(h.updateSets).toHaveLength(0);
    expect(mockCrossRef).not.toHaveBeenCalled();
    expect(complete(events)).toBeUndefined();
  });

  it('stops mid-loop and reports the processed count', async () => {
    const events: Ev[] = [];
    const ctrl = new AbortController();
    const emit = vi.fn((type: string, data: unknown) => {
      events.push({ type, data: data as Record<string, unknown> });
      if (type === 'pub_done') ctrl.abort();
    });
    mockCrossRef.mockResolvedValue({ abstract: 'X', source: 'crossref' });
    await runEnrichmentBatch({
      pubs: [
        makePub({ id: 'a', doi: '10.1/a' }),
        makePub({ id: 'b', doi: '10.1/b' }),
      ],
      abortSignal: ctrl.signal,
      emit,
    });
    expect(h.updateSets).toHaveLength(1);
    expect(ofType(events, 'cancelled')[0]?.data).toEqual({
      processed: 1,
      total: 2,
    });
    expect(complete(events)).toBeUndefined();
  });
});

describe('runEnrichmentBatch — DOI cascade', () => {
  it('happy path: a source abstract yields enriched status', async () => {
    mockCrossRef.mockResolvedValue({
      abstract: 'CrossRef abstract',
      source: 'crossref',
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x', title: 'T' })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets).toHaveLength(1);
    expect(h.updateSets[0].enrichmentStatus).toBe('enriched');
    expect(h.updateSets[0].enrichedAbstract).toBe('CrossRef abstract');
    expect(String(h.updateSets[0].enrichedSource)).toContain('crossref');
    expect(complete(events)).toMatchObject({
      processed: 1,
      total: 1,
      successful: 1,
      partial: 0,
      failed: 0,
      with_abstract: 1,
      sources: { crossref: 1 },
    });
    const done = ofType(events, 'pub_done')[0]?.data;
    expect(done).toMatchObject({ final_status: 'enriched', has_abstract: true });
  });

  it('all sources empty yields failed status with no_data events', async () => {
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x' })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets[0].enrichmentStatus).toBe('failed');
    expect(h.updateSets[0].enrichedAbstract).toBeNull();
    expect(h.updateSets[0].enrichedSource).toBeNull();
    expect(complete(events)).toMatchObject({ failed: 1, successful: 0 });
    const noData = ofType(events, 'source_done').filter(
      (e) => e.data.status === 'no_data',
    );
    expect(noData.map((e) => e.data.source).sort()).toEqual([
      'crossref',
      'openalex',
      'semantic_scholar',
      'unpaywall',
    ]);
  });

  it('source data without an abstract yields partial status', async () => {
    mockOpenAlex.mockResolvedValue({
      keywords: ['kw1', 'kw2'],
      source: 'openalex',
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x' })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets[0].enrichmentStatus).toBe('partial');
    expect(h.updateSets[0].enrichedKeywords).toEqual(['kw1', 'kw2']);
    expect(complete(events)).toMatchObject({ partial: 1, successful: 0 });
  });

  it('a throwing source emits an error event and the cascade continues', async () => {
    mockCrossRef.mockRejectedValue(new Error('crossref boom'));
    mockOpenAlex.mockResolvedValue({
      abstract: 'OA abstract',
      source: 'openalex',
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x' })],
      abortSignal: new AbortController().signal,
      emit,
    });
    const errEv = ofType(events, 'source_done').find(
      (e) => e.data.status === 'error',
    );
    expect(errEv?.data).toMatchObject({
      source: 'crossref',
      error: 'crossref boom',
    });
    expect(h.updateSets[0].enrichmentStatus).toBe('enriched');
    expect(h.updateSets[0].enrichedAbstract).toBe('OA abstract');
  });

  it('CSV abstract pre-seeds the merge and survives all-empty APIs', async () => {
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x', abstract: 'CSV abstract' })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets[0].enrichmentStatus).toBe('enriched');
    expect(h.updateSets[0].enrichedAbstract).toBe('CSV abstract');
    expect(String(h.updateSets[0].enrichedSource)).toContain('csv');
    expect(complete(events)).toMatchObject({ successful: 1, with_abstract: 1 });
  });

  it('fills published_at only when the row has none', async () => {
    mockCrossRef.mockResolvedValue({
      abstract: 'A',
      source: 'crossref',
      published_at: '2024-03-04',
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x', published_at: null })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets[0].publishedAt).toBe('2024-03-04');
    expect(ofType(events, 'pub_done')[0]?.data.date_filled).toBe(true);
  });

  it('does not overwrite an existing published_at', async () => {
    mockCrossRef.mockResolvedValue({
      abstract: 'A',
      source: 'crossref',
      published_at: '2024-03-04',
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x', published_at: '2020-01-01' })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets[0]).not.toHaveProperty('publishedAt');
    expect(ofType(events, 'pub_done')[0]?.data.date_filled).toBe(false);
  });

  it('falls back to an API-discovered PDF url when still abstract-less', async () => {
    mockCrossRef.mockResolvedValue({
      source: 'crossref',
      pdf_url: 'https://api.example/paper.pdf',
    });
    mockPdf.mockResolvedValue({
      abstract: 'Fallback PDF abstract',
      source: 'pdf',
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: '10.1/x', url: null })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(mockPdf).toHaveBeenCalledWith('https://api.example/paper.pdf');
    expect(h.updateSets[0].enrichmentStatus).toBe('enriched');
    expect(h.updateSets[0].enrichedAbstract).toBe('Fallback PDF abstract');
    const src = String(h.updateSets[0].enrichedSource);
    expect(src).toContain('crossref');
    expect(src).toContain('pdf');
    expect(complete(events)).toMatchObject({ successful: 1 });
  });

  it('aggregates counts and sourceCounts across multiple pubs', async () => {
    mockCrossRef.mockResolvedValue({ abstract: 'X', source: 'crossref' });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [
        makePub({ id: 'a', doi: '10.1/a' }),
        makePub({ id: 'b', doi: '10.1/b' }),
      ],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets).toHaveLength(2);
    expect(complete(events)).toMatchObject({
      processed: 2,
      total: 2,
      successful: 2,
      with_abstract: 2,
      sources: { crossref: 2 },
    });
  });
});

describe('runEnrichmentBatch — DOI-less path', () => {
  it('skips the 4 API sources and enriches from a WebDB summary', async () => {
    mockWebDb.mockReturnValue({
      abstract: 'WebDB summary',
      source: WEBDB_SOURCE_TAG,
      word_count: 42,
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: null, url: null })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(mockCrossRef).not.toHaveBeenCalled();
    expect(mockOpenAlex).not.toHaveBeenCalled();
    const skipped = ofType(events, 'source_done').filter(
      (e) => e.data.status === 'skipped',
    );
    expect(skipped.map((e) => e.data.source)).toEqual(
      expect.arrayContaining([
        'crossref',
        'openalex',
        'unpaywall',
        'semantic_scholar',
      ]),
    );
    expect(h.updateSets[0].enrichmentStatus).toBe('enriched');
    expect(h.updateSets[0].enrichedAbstract).toBe('WebDB summary');
    expect(h.updateSets[0].enrichedSource).toBe(WEBDB_SOURCE_TAG);
    expect(h.updateSets[0].wordCount).toBe(42);
  });

  it('uses a direct .pdf url for DOI-less rows', async () => {
    mockPdf.mockResolvedValue({
      abstract: 'PDF abstract',
      source: 'pdf',
      full_text_snippet: 'snippet text',
      word_count: 99,
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [
        makePub({
          id: 'p1',
          doi: null,
          url: 'https://oeaw.ac.at/file.pdf',
        }),
      ],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(mockPdf).toHaveBeenCalledWith('https://oeaw.ac.at/file.pdf');
    expect(h.updateSets[0].enrichmentStatus).toBe('enriched');
    expect(h.updateSets[0].enrichedAbstract).toBe('PDF abstract');
    expect(h.updateSets[0].fullTextSnippet).toBe('snippet text');
    expect(h.updateSets[0].wordCount).toBe(99);
    expect(String(h.updateSets[0].enrichedSource)).toContain('pdf');
    expect(complete(events)).toMatchObject({ successful: 1 });
  });

  it('WebDB data without an abstract yields partial and omits keywords', async () => {
    // Source data but no abstract -> partial. The DOI-less write must NOT
    // touch enriched_keywords (the cascade never produces them; clobbering
    // the column to null would erase any prior DOI-era keywords).
    mockWebDb.mockReturnValue({
      source: WEBDB_SOURCE_TAG,
      word_count: 30,
    });
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: null, url: null })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets[0].enrichmentStatus).toBe('partial');
    expect(h.updateSets[0].enrichedAbstract).toBeNull();
    expect(h.updateSets[0].wordCount).toBe(30);
    expect(h.updateSets[0]).not.toHaveProperty('enrichedKeywords');
    expect(complete(events)).toMatchObject({ partial: 1, successful: 0 });
  });

  it('no local data and no pdf yields failed status', async () => {
    // Reachable via the explicit-ids path (the status query would filter this
    // row out otherwise): no abstract, no .pdf url, no WebDB hit.
    const { events, emit } = collectEvents();
    await runEnrichmentBatch({
      pubs: [makePub({ id: 'p1', doi: null, url: null })],
      abortSignal: new AbortController().signal,
      emit,
    });
    expect(h.updateSets[0].enrichmentStatus).toBe('failed');
    expect(h.updateSets[0].enrichedSource).toBeNull();
    expect(complete(events)).toMatchObject({ failed: 1, successful: 0 });
  });
});
