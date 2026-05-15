import { describe, it, expect } from 'vitest';
import {
  publicationToApi,
  publicationToApiLite,
  publicationTypeToApi,
  personToApi,
  orgunitToApi,
  projectToApi,
} from './to-api';
import type {
  publications,
  publicationTypes,
  persons,
  orgunits,
  projects,
} from '@/lib/server/db';

type PubRow = typeof publications.$inferSelect;
type PubTypeRow = typeof publicationTypes.$inferSelect;
type PersonRow = typeof persons.$inferSelect;
type OrgunitRow = typeof orgunits.$inferSelect;
type ProjectRow = typeof projects.$inferSelect;

const ANCHOR_ISO = '2026-05-15T10:00:00.000Z';

// Minimal row builder — every nullable field nulled, dates set so the
// required createdAt/updatedAt fields produce valid ISO strings.
function makeMinimalPub(overrides: Partial<PubRow> = {}): PubRow {
  return {
    id: 'b1f3a8d4-0000-0000-0000-000000000001',
    webdbUid: null,
    csvUid: null,
    title: 'Sample',
    originalTitle: null,
    leadAuthor: null,
    abstract: null,
    summaryDe: null,
    summaryEn: null,
    doi: null,
    doiLink: null,
    publishedAt: null,
    publicationType: null,
    publicationTypeId: null,
    openAccess: null,
    openAccessStatus: null,
    oaType: null,
    url: null,
    websiteLink: null,
    downloadLink: null,
    citation: null,
    citationApa: null,
    citationDe: null,
    citationEn: null,
    ris: null,
    bibtex: null,
    endnote: null,
    peerReviewed: null,
    popularScience: null,
    archived: false,
    webdbTstamp: null,
    webdbCrdate: null,
    syncedAt: null,
    enrichmentStatus: null,
    enrichedAbstract: null,
    enrichedKeywords: null,
    enrichedJournal: null,
    enrichedSource: null,
    fullTextSnippet: null,
    wordCount: null,
    analysisStatus: null,
    pressScore: null,
    pressSimilarity: null,
    publicAccessibility: null,
    societalRelevance: null,
    noveltyFactor: null,
    storytellingPotential: null,
    mediaTimeliness: null,
    pitchSuggestion: null,
    targetAudience: null,
    suggestedAngle: null,
    reasoning: null,
    haiku: null,
    llmModel: null,
    analysisCost: null,
    importBatch: null,
    createdAt: new Date(ANCHOR_ISO),
    updatedAt: new Date(ANCHOR_ISO),
    meistertaskTaskId: null,
    meistertaskTaskToken: null,
    decision: 'undecided',
    decidedAt: null,
    decidedBy: null,
    decisionRationale: null,
    snoozeUntil: null,
    flagNotes: null,
    decidedInSession: null,
    isItaSubtree: false,
    ...overrides,
  } as PubRow;
}

describe('publicationToApi', () => {
  it('applies nullish defaults: open_access=false, word_count=0, status=pending, flag_notes=[]', () => {
    const dto = publicationToApi(makeMinimalPub());
    expect(dto.open_access).toBe(false);
    expect(dto.word_count).toBe(0);
    expect(dto.enrichment_status).toBe('pending');
    expect(dto.analysis_status).toBe('pending');
    expect(dto.flag_notes).toEqual([]);
    expect(dto.enriched_keywords).toBeNull();
  });

  it('converts Date columns to ISO strings; preserves null when source is null', () => {
    const dto = publicationToApi(
      makeMinimalPub({
        webdbTstamp: new Date(ANCHOR_ISO),
        decidedAt: null,
        syncedAt: new Date(ANCHOR_ISO),
      }),
    );
    expect(dto.webdb_tstamp).toBe(ANCHOR_ISO);
    expect(dto.synced_at).toBe(ANCHOR_ISO);
    expect(dto.decided_at).toBeNull();
    expect(dto.created_at).toBe(ANCHOR_ISO);
  });

  it('passes through filled scores + flag_notes verbatim', () => {
    const dto = publicationToApi(
      makeMinimalPub({
        pressScore: 0.87,
        noveltyFactor: 4.2,
        flagNotes: [{ by: 'mleihs', note: 'check ITA scope', at: ANCHOR_ISO }],
      }),
    );
    expect(dto.press_score).toBe(0.87);
    expect(dto.novelty_factor).toBe(4.2);
    expect(dto.flag_notes).toEqual([
      { by: 'mleihs', note: 'check ITA scope', at: ANCHOR_ISO },
    ]);
  });

  it('preserves openAccess true/false distinction (not coerced to false on true)', () => {
    expect(publicationToApi(makeMinimalPub({ openAccess: true })).open_access).toBe(true);
    expect(publicationToApi(makeMinimalPub({ openAccess: false })).open_access).toBe(false);
    expect(publicationToApi(makeMinimalPub({ openAccess: null })).open_access).toBe(false);
  });
});

describe('publicationToApiLite', () => {
  it('narrows decision to a known Decision (passes valid through)', () => {
    const dto = publicationToApiLite({
      id: 'x',
      title: 't',
      originalTitle: null,
      leadAuthor: null,
      citation: null,
      pressScore: null,
      pressSimilarity: null,
      decision: 'pitch',
      publishedAt: null,
    });
    expect(dto.decision).toBe('pitch');
  });

  it('falls back to undecided when the DB column holds an unknown string', () => {
    const dto = publicationToApiLite({
      id: 'x',
      title: 't',
      originalTitle: null,
      leadAuthor: null,
      citation: null,
      pressScore: null,
      pressSimilarity: null,
      decision: 'mystery-status-from-old-migration' as never,
      publishedAt: null,
    });
    expect(dto.decision).toBe('undecided');
  });
});

describe('publicationTypeToApi', () => {
  it('maps the 4-field shape', () => {
    const dto = publicationTypeToApi({
      id: 'pt-1',
      webdbUid: 'WD-42',
      nameDe: 'Buchkapitel',
      nameEn: 'Book chapter',
    } as PubTypeRow);
    expect(dto).toEqual({
      id: 'pt-1',
      webdb_uid: 'WD-42',
      name_de: 'Buchkapitel',
      name_en: 'Book chapter',
    });
  });
});

describe('orgunitToApi', () => {
  it('passes parent_id null vs set through correctly', () => {
    const base: OrgunitRow = {
      id: 'ou-1',
      webdbUid: null,
      nameDe: 'IQOQI',
      nameEn: 'IQOQI',
      akronymDe: null,
      akronymEn: null,
      urlDe: null,
      urlEn: null,
      parentId: null,
    } as OrgunitRow;
    expect(orgunitToApi(base).parent_id).toBeNull();
    expect(orgunitToApi({ ...base, parentId: 'ou-root' }).parent_id).toBe('ou-root');
  });
});

describe('personToApi', () => {
  it('preserves research_fields array verbatim (null vs filled)', () => {
    const base: PersonRow = {
      id: 'p-1',
      webdbUid: null,
      firstname: 'Anna',
      lastname: 'Schmidt',
      degreeBefore: null,
      degreeAfter: null,
      email: null,
      orcid: null,
      oestat3NameDe: null,
      oestat3NameEn: null,
      researchFields: null,
      external: false,
      deceased: false,
      portrait: null,
      slug: null,
    } as PersonRow;
    expect(personToApi(base).research_fields).toBeNull();
    const withFields = personToApi({
      ...base,
      researchFields: ['Quantum', 'Climate'],
    });
    expect(withFields.research_fields).toEqual(['Quantum', 'Climate']);
  });
});

describe('projectToApi', () => {
  it('maps a representative subset of fields', () => {
    const row: ProjectRow = {
      id: 'pr-1',
      webdbUid: null,
      titleDe: 'Klima-Projekt',
      titleEn: 'Climate project',
      summaryDe: null,
      summaryEn: null,
      thematicFocusDe: null,
      thematicFocusEn: null,
      fundingTypeDe: null,
      fundingTypeEn: null,
      startsOn: '2026-01-01',
      endsOn: null,
      cancelled: false,
      urlDe: null,
      urlEn: null,
    } as ProjectRow;
    const dto = projectToApi(row);
    expect(dto.title_de).toBe('Klima-Projekt');
    expect(dto.starts_on).toBe('2026-01-01');
    expect(dto.ends_on).toBeNull();
    expect(dto.cancelled).toBe(false);
  });
});
