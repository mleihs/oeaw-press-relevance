// Canonical ingest DTOs (ADR 0017).
//
// Source-agnostic, normalized publication graph. A `SourceAdapter`
// (`./source-adapter.ts`) turns a raw source into a `CanonicalBatch`; the
// shared loader (`./loader.ts`) writes it through Drizzle with an idempotent
// upsert by the natural key `webdb_uid`.
//
// Design (faithful port of scripts/webdb-import.mjs, see ADR 0017):
//   - DTOs carry the *source* natural keys (`*WebdbUid`), NOT resolved
//     UUIDs. `normalize()` stays pure (no DB); the loader resolves FK
//     UUID maps after each parent table is upserted. This produces the
//     same end-state as the .mjs script's in-transform `fkMap()` lookups.
//   - Analysis columns (press_score, reasoning, decision, haiku, ...) are
//     ABSENT from every DTO. The loader's per-table update set is exactly
//     the WebDB-owned column list below, so `ON CONFLICT DO UPDATE` never
//     touches analysis state. The disjointness is unit-tested
//     (`webdb.normalize.test.ts`) — an explicit, durable hardening of the
//     original's implicit "just don't put the keys in the object".

// ---------------------------------------------------------------------------
// Entity DTOs
// ---------------------------------------------------------------------------

/** publication_types / lecture_types / orgunit_types / member_types /
 *  oestat6_categories — all share this shape. */
export interface CanonicalLookup {
  webdbUid: number;
  nameDe: string;
  nameEn: string;
}

export interface CanonicalOrgunit {
  webdbUid: number;
  nameDe: string;
  nameEn: string | null;
  akronymDe: string | null;
  akronymEn: string | null;
  urlDe: string | null;
  urlEn: string | null;
  /** source `type` uid; loader resolves -> orgunits.type_id */
  typeWebdbUid: number | null;
  /** source `superior_organizational_unit`; loader 2nd-pass -> parent_id */
  parentWebdbUid: number | null;
}

export interface CanonicalExtunit {
  webdbUid: number;
  nameDe: string;
  nameEn: string | null;
  logo: string | null;
}

export interface CanonicalPerson {
  webdbUid: number;
  firstname: string;
  lastname: string;
  degreeBefore: string | null;
  degreeAfter: string | null;
  degreeNonAcademicDe: string | null;
  degreeNonAcademicEn: string | null;
  biographyDe: string | null;
  biographyEn: string | null;
  email: string | null;
  emailEn: string | null;
  externalLinkDe: string | null;
  externalLinkEn: string | null;
  portrait: string | null;
  copyright: string | null;
  orcid: string | null;
  slug: string | null;
  oestat3NameDe: string | null;
  oestat3NameEn: string | null;
  researchFieldNoOestat: string | null;
  researchFields: string | null;
  selectedPublications: string | null;
  /** source `member_type` uid; loader resolves -> persons.member_type_id */
  memberTypeWebdbUid: number | null;
  external: boolean;
  deceased: boolean;
  dateOfDeath: string | null;
  vipDe: string | null;
  vipEn: string | null;
  useVip: boolean;
  selectionyear: number | null;
}

export interface CanonicalProject {
  webdbUid: number;
  titleDe: string | null;
  titleEn: string | null;
  summaryDe: string | null;
  summaryEn: string | null;
  urlDe: string | null;
  urlEn: string | null;
  thematicFocusDe: string | null;
  thematicFocusEn: string | null;
  fundingTypeDe: string | null;
  fundingTypeEn: string | null;
  startsOn: string | null;
  endsOn: string | null;
  cancelled: boolean;
  /** always null from WebDB today; kept for shape parity with the .mjs port */
  typeText: string | null;
  parentWebdbUid: number | null;
}

export interface CanonicalLecture {
  webdbUid: number;
  originalTitle: string;
  lectureDate: string | null;
  city: string | null;
  eventName: string | null;
  eventType: string | null;
  kind: string | null;
  /** source `type` uid; loader resolves -> lectures.type_id */
  typeWebdbUid: number | null;
  popularScience: boolean;
  speaker: string | null;
  citation: string | null;
  url: string | null;
}

/**
 * The WebDB-owned half of a publication row. Analysis columns are
 * deliberately not modelled here (see file header). `archived` is always
 * `false` in a freshly normalized row — the loader flips it to `true` for
 * orphans (rows absent from the new source).
 */
export interface CanonicalPublication {
  webdbUid: number;
  title: string;
  originalTitle: string | null;
  summaryDe: string | null;
  summaryEn: string | null;
  doi: string | null;
  doiLink: string | null;
  publishedAt: string | null;
  ris: string | null;
  /** source `type` uid; loader resolves -> publications.publication_type_id */
  publicationTypeWebdbUid: number | null;
  peerReviewed: boolean;
  popularScience: boolean;
  openAccessStatus: string | null;
  openAccess: boolean;
  oaType: string | null;
  leadAuthor: string | null;
  websiteLink: string | null;
  downloadLink: string | null;
  citationApa: string | null;
  citationDe: string | null;
  citationEn: string | null;
  bibtex: string | null;
  endnote: string | null;
  citation: string | null;
  webdbTstamp: string | null;
  webdbCrdate: string | null;
  archived: boolean;
}

// ---------------------------------------------------------------------------
// Junction DTOs — carry source webdb_uid pairs; loader resolves to UUID FKs
// and drops pairs whose endpoints don't resolve (faithful to the .mjs
// `.filter(r => r.a_id && r.b_id)`).
// ---------------------------------------------------------------------------

export interface CanonicalPersonPublication {
  personWebdbUid: number;
  publicationWebdbUid: number;
  highlight: boolean;
  mahighlight: boolean;
  authorship: string | null;
}

export interface CanonicalOrgunitPublication {
  orgunitWebdbUid: number;
  publicationWebdbUid: number;
  highlight: boolean;
}

export interface CanonicalPublicationProject {
  publicationWebdbUid: number;
  projectWebdbUid: number;
  sorting: number | null;
}

export interface CanonicalPersonOestat6 {
  personWebdbUid: number;
  oestat6WebdbUid: number;
}

export interface CanonicalLecturePerson {
  lectureWebdbUid: number;
  personWebdbUid: number;
}

export interface CanonicalLectureOrgunit {
  lectureWebdbUid: number;
  orgunitWebdbUid: number;
}

export interface CanonicalProjectLecture {
  projectWebdbUid: number;
  lectureWebdbUid: number;
}

export interface CanonicalExtunitPerson {
  extunitWebdbUid: number;
  personWebdbUid: number;
}

export interface CanonicalOrgunitPerson {
  orgunitWebdbUid: number;
  personWebdbUid: number;
  role: string | null;
  phone: string | null;
  scientist: boolean;
}

// ---------------------------------------------------------------------------
// Aggregate batch
// ---------------------------------------------------------------------------

export interface CanonicalBatch {
  lookups: {
    publicationTypes: CanonicalLookup[];
    lectureTypes: CanonicalLookup[];
    orgunitTypes: CanonicalLookup[];
    memberTypes: CanonicalLookup[];
    oestat6Categories: CanonicalLookup[];
  };
  orgunits: CanonicalOrgunit[];
  extunits: CanonicalExtunit[];
  persons: CanonicalPerson[];
  projects: CanonicalProject[];
  lectures: CanonicalLecture[];
  publications: CanonicalPublication[];
  junctions: {
    personPublications: CanonicalPersonPublication[];
    orgunitPublications: CanonicalOrgunitPublication[];
    publicationProjects: CanonicalPublicationProject[];
    personOestat6: CanonicalPersonOestat6[];
    lecturePersons: CanonicalLecturePerson[];
    lectureOrgunits: CanonicalLectureOrgunit[];
    projectLectures: CanonicalProjectLecture[];
    extunitPersons: CanonicalExtunitPerson[];
    orgunitPersons: CanonicalOrgunitPerson[];
  };
}

// ---------------------------------------------------------------------------
// WebDB-owned column lists (Drizzle camelCase keys).
//
// These are the EXACT `ON CONFLICT DO UPDATE` sets from
// scripts/webdb-import.mjs, transcribed 1:1. `syncedAt` is appended for the
// entity tables that carried it in the .mjs `updateCols` (orgunits, extunits,
// persons, projects, lectures) and for publications. The loader builds the
// `set` from these and nothing else, which is the analysis-preservation
// guarantee.
// ---------------------------------------------------------------------------

export const LOOKUP_UPDATE = ['nameDe', 'nameEn'] as const;

export const ORGUNIT_UPDATE = [
  'nameDe', 'nameEn', 'akronymDe', 'akronymEn', 'urlDe', 'urlEn',
  'typeId', 'parentWebdbUid', 'syncedAt',
] as const;

export const EXTUNIT_UPDATE = ['nameDe', 'nameEn', 'logo', 'syncedAt'] as const;

export const PERSON_UPDATE = [
  'firstname', 'lastname', 'degreeBefore', 'degreeAfter',
  'degreeNonAcademicDe', 'degreeNonAcademicEn',
  'biographyDe', 'biographyEn', 'email', 'emailEn',
  'externalLinkDe', 'externalLinkEn', 'portrait', 'copyright',
  'orcid', 'slug', 'oestat3NameDe', 'oestat3NameEn',
  'researchFieldNoOestat', 'researchFields', 'selectedPublications',
  'memberTypeId', 'external', 'deceased', 'dateOfDeath',
  'vipDe', 'vipEn', 'useVip', 'selectionyear', 'syncedAt',
] as const;

export const PROJECT_UPDATE = [
  'titleDe', 'titleEn', 'summaryDe', 'summaryEn', 'urlDe', 'urlEn',
  'thematicFocusDe', 'thematicFocusEn',
  'fundingTypeDe', 'fundingTypeEn', 'startsOn', 'endsOn',
  'cancelled', 'typeText', 'parentWebdbUid', 'syncedAt',
] as const;

export const LECTURE_UPDATE = [
  'originalTitle', 'lectureDate', 'city', 'eventName', 'eventType',
  'kind', 'typeId', 'popularScience', 'speaker', 'citation', 'url',
  'syncedAt',
] as const;

/**
 * The 27 WebDB-owned columns of `publications`, exactly the
 * `Object.keys(insertable[0]).filter(k => k !== 'webdb_uid')` set from the
 * .mjs script (incl. `archived` and `syncedAt`). The loader's
 * `onConflictDoUpdate` set is built from this and nothing else.
 */
export const PUBLICATION_WEBDB_UPDATE = [
  'title', 'originalTitle', 'summaryDe', 'summaryEn', 'doi', 'doiLink',
  'publishedAt', 'ris', 'publicationTypeId', 'peerReviewed', 'popularScience',
  'openAccessStatus', 'openAccess', 'oaType', 'leadAuthor', 'websiteLink',
  'downloadLink', 'citationApa', 'citationDe', 'citationEn', 'bibtex',
  'endnote', 'citation', 'webdbTstamp', 'webdbCrdate', 'archived', 'syncedAt',
] as const;

/**
 * Every `publications` column the loader MUST NOT write — the analysis +
 * enrichment + workflow state produced by the LLM pipeline and review UI.
 * `webdb.normalize.test.ts` asserts this is disjoint from
 * `PUBLICATION_WEBDB_UPDATE`; that test IS the data-safety contract
 * (ADR 0017 / production_db_safety).
 */
export const PUBLICATION_ANALYSIS_COLUMNS = [
  'abstract', 'enrichmentStatus', 'enrichedAbstract', 'enrichedKeywords',
  'enrichedJournal', 'enrichedSource', 'fullTextSnippet', 'wordCount',
  'analysisStatus', 'pressScore', 'publicAccessibility', 'societalRelevance',
  'noveltyFactor', 'storytellingPotential', 'mediaTimeliness',
  'pitchSuggestion', 'targetAudience', 'suggestedAngle', 'reasoning',
  'llmModel', 'analysisCost', 'importBatch', 'csvUid', 'haiku',
  'meistertaskTaskId', 'meistertaskTaskToken', 'isItaSubtree', 'decision',
  'decidedAt', 'decidedBy', 'decisionRationale', 'snoozeUntil', 'flagNotes',
  'decidedInSession', 'pressSimilarity',
] as const;
