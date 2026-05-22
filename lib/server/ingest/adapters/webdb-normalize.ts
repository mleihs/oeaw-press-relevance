// WebDB raw -> CanonicalBatch. PURE: no DB, no network, no clock, no infra
// imports (not even doi-extract — that is injected at the script seam so
// this module stays trivially unit-testable and has no server->scripts
// edge; see ADR 0017). 1:1 transcription of the inline transforms in
// scripts/webdb-import.mjs (the .mjs comments are preserved as anchors).

import type {
  CanonicalBatch, CanonicalLookup, CanonicalPublication,
} from '../canonical';

// --- raw row shapes (exactly the columns the .mjs SELECTs project) ---------

export interface RawLookup { uid: number; name_de: string | null; name_en: string | null }

export interface RawOrgunit {
  uid: number; name_de: string | null; name_en: string | null;
  akronym_de: string | null; akronym_en: string | null;
  url_de: string | null; url_en: string | null;
  type: number | null; superior_organizational_unit: number | null;
}
export interface RawExtunit {
  uid: number; name_de: string | null; name_en: string | null; logo: string | null;
}
export interface RawPerson {
  uid: number; firstname: string | null; lastname: string | null;
  degree_before: string | null; degree_after: string | null;
  degree_non_academic_de: string | null; degree_non_academic_en: string | null;
  biography_de: string | null; biography_en: string | null;
  email: string | null; email_en: string | null;
  external_link_de: string | null; external_link_en: string | null;
  portrait: string | null; copyright: string | null;
  orcid: string | null; slug: string | null;
  oestat3_name_de: string | null; oestat3_name_en: string | null;
  research_field_no_oestat: string | null; research_fields: string | null;
  selected_publications: string | null; member_type: number | null;
  external: number; deceased: number; date_of_death: number | null;
  vip_de: string | null; vip_en: string | null; use_vip: number;
  selectionyear: number | null;
}
export interface RawProject {
  uid: number; title_de: string | null; title_en: string | null;
  summary_de: string | null; summary_en: string | null;
  url_de: string | null; url_en: string | null;
  thematic_focus_de: string | null; thematic_focus_en: string | null;
  funding_type_de: string | null; funding_type_en: string | null;
  starts_on: number | null; ends_on: number | null;
  cancelled: number; superior_project: number | null;
}
export interface RawLecture {
  uid: number; original_title: string | null; lecture_date: number | null;
  city: string | null; event_name: string | null; event_type: string | null;
  kind: string | null; type: number | null; popular_science: number;
  speaker: string | null; citation: string | null; url: string | null;
}
export interface RawPublication {
  uid: number; original_title: string | null;
  summary_de: string | null; summary_en: string | null;
  doi_link: string | null; pub_date: number | null; ris: string | null;
  type: number | null; peer_reviewed: number; popular_science: number;
  open_access: string | null; lead_author: string | null;
  website_link: string | null; download_link: string | null;
  citation_apa: string | null; citation_de: string | null;
  citation_en: string | null; bibtex: string | null; endnote: string | null;
  tstamp: number | null; crdate: number | null;
}

export interface RawWebdb {
  publicationTypes: RawLookup[];
  lectureTypes: RawLookup[];
  orgunitTypes: RawLookup[];
  memberTypes: RawLookup[];
  oestat6Categories: RawLookup[];
  orgunits: RawOrgunit[];
  extunits: RawExtunit[];
  persons: RawPerson[];
  projects: RawProject[];
  lectures: RawLecture[];
  publications: RawPublication[];
  personPublications: { person: number; publication: number; highlight: number; mahighlight: number; authorship: string | null }[];
  orgunitPublications: { organizational_unit: number; publication: number; highlight: number }[];
  publicationProjects: { publication_uid: number; project_uid: number; sorting: number | null }[];
  personOestat6: { person_uid: number; oestat6_uid: number }[];
  lecturePersons: { person: number; lecture: number }[];
  lectureOrgunits: { lecture_uid: number; orgunit_uid: number }[];
  projectLectures: { project_uid: number; lecture_uid: number }[];
  extunitPersons: { person: number; external_unit: number }[];
  orgunitPersons: { person: number; organizational_unit: number; role: string | null; phone: string | null; scientist: number }[];
}

/** The injected shared DOI extractor (scripts/lib/doi-extract.mjs). Kept as
 *  a dependency so this module never imports `scripts/**` (boundaries) and
 *  the single-source-of-truth is the .mjs the legacy ETL + backfill share
 *  (memory etl_doi_fallback). */
export type ExtractDoiFromRow = (row: RawPublication) => string | null;

// --- helpers: byte-identical to the .mjs ----------------------------------

const tsDate = (n: number | null | undefined): string | null =>
  n && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null;
const tsTimestamp = (n: number | null | undefined): string | null =>
  n && n > 0 ? new Date(n * 1000).toISOString() : null;
const nullIfEmpty = (s: string | null | undefined): string | null =>
  s === '' || s == null ? null : s;
const truthy = (n: number | null | undefined): boolean => Number(n) === 1;

const lookup = (rows: RawLookup[]): CanonicalLookup[] =>
  rows.map((r) => ({
    webdbUid: r.uid,
    nameDe: r.name_de || '',
    nameEn: r.name_en || '',
  }));

/**
 * Pure transform. `extractDoiFromRow` is injected (see ADR 0017): the v2
 * script passes the real `scripts/lib/doi-extract.mjs`; tests pass a stub.
 */
export function normalizeWebdb(
  raw: RawWebdb,
  extractDoiFromRow: ExtractDoiFromRow,
): CanonicalBatch {
  // Publications: build transformed rows, then dedupe DOIs (HeboWebDB itself
  // contains 286 DOIs across multiple rows; our DOI unique constraint would
  // block the 2nd insert). Keep the DOI on the lowest-uid row, null the rest
  // — webdb_uid is the canonical key.
  const pubs: CanonicalPublication[] = raw.publications.map((r) => ({
    webdbUid: r.uid,
    title: r.original_title || '(untitled)',
    originalTitle: r.original_title || null,
    summaryDe: nullIfEmpty(r.summary_de),
    summaryEn: nullIfEmpty(r.summary_en),
    doi: extractDoiFromRow(r),
    doiLink: nullIfEmpty(r.doi_link),
    publishedAt: tsDate(r.pub_date),
    ris: nullIfEmpty(r.ris),
    publicationTypeWebdbUid: r.type ?? null,
    peerReviewed: truthy(r.peer_reviewed),
    popularScience: truthy(r.popular_science),
    openAccessStatus: nullIfEmpty(r.open_access),
    openAccess: !!r.open_access && r.open_access.startsWith('oa_'),
    oaType: nullIfEmpty(r.open_access),
    leadAuthor: nullIfEmpty(r.lead_author),
    websiteLink: nullIfEmpty(r.website_link),
    downloadLink: nullIfEmpty(r.download_link),
    citationApa: nullIfEmpty(r.citation_apa),
    citationDe: nullIfEmpty(r.citation_de),
    citationEn: nullIfEmpty(r.citation_en),
    bibtex: nullIfEmpty(r.bibtex),
    endnote: nullIfEmpty(r.endnote),
    citation: nullIfEmpty(r.citation_de) || nullIfEmpty(r.citation_apa),
    webdbTstamp: tsTimestamp(r.tstamp),
    webdbCrdate: tsTimestamp(r.crdate),
    archived: false,
  }));
  pubs.sort((a, b) => a.webdbUid - b.webdbUid);
  const seenDoi = new Set<string>();
  for (const r of pubs) {
    if (!r.doi) continue;
    if (seenDoi.has(r.doi)) r.doi = null;
    else seenDoi.add(r.doi);
  }

  return {
    lookups: {
      publicationTypes: lookup(raw.publicationTypes),
      lectureTypes: lookup(raw.lectureTypes),
      orgunitTypes: lookup(raw.orgunitTypes),
      memberTypes: lookup(raw.memberTypes),
      oestat6Categories: lookup(raw.oestat6Categories),
    },
    orgunits: raw.orgunits.map((r) => ({
      webdbUid: r.uid,
      nameDe: r.name_de || '',
      nameEn: nullIfEmpty(r.name_en),
      akronymDe: nullIfEmpty(r.akronym_de),
      akronymEn: nullIfEmpty(r.akronym_en),
      urlDe: nullIfEmpty(r.url_de),
      urlEn: nullIfEmpty(r.url_en),
      typeWebdbUid: r.type ?? null,
      parentWebdbUid: r.superior_organizational_unit || null,
    })),
    extunits: raw.extunits.map((r) => ({
      webdbUid: r.uid,
      nameDe: r.name_de || '',
      nameEn: nullIfEmpty(r.name_en),
      logo: nullIfEmpty(r.logo),
    })),
    persons: raw.persons.map((r) => ({
      webdbUid: r.uid,
      firstname: r.firstname || '',
      lastname: r.lastname || '',
      degreeBefore: nullIfEmpty(r.degree_before),
      degreeAfter: nullIfEmpty(r.degree_after),
      degreeNonAcademicDe: nullIfEmpty(r.degree_non_academic_de),
      degreeNonAcademicEn: nullIfEmpty(r.degree_non_academic_en),
      biographyDe: nullIfEmpty(r.biography_de),
      biographyEn: nullIfEmpty(r.biography_en),
      email: nullIfEmpty(r.email),
      emailEn: nullIfEmpty(r.email_en),
      externalLinkDe: nullIfEmpty(r.external_link_de),
      externalLinkEn: nullIfEmpty(r.external_link_en),
      portrait: nullIfEmpty(r.portrait),
      copyright: nullIfEmpty(r.copyright),
      orcid: nullIfEmpty(r.orcid),
      slug: nullIfEmpty(r.slug),
      oestat3NameDe: nullIfEmpty(r.oestat3_name_de),
      oestat3NameEn: nullIfEmpty(r.oestat3_name_en),
      researchFieldNoOestat: nullIfEmpty(r.research_field_no_oestat),
      researchFields: nullIfEmpty(r.research_fields),
      selectedPublications: nullIfEmpty(r.selected_publications),
      memberTypeWebdbUid: r.member_type ?? null,
      external: truthy(r.external),
      deceased: truthy(r.deceased),
      dateOfDeath: tsDate(r.date_of_death),
      vipDe: nullIfEmpty(r.vip_de),
      vipEn: nullIfEmpty(r.vip_en),
      useVip: truthy(r.use_vip),
      selectionyear: r.selectionyear || null,
    })),
    projects: raw.projects.map((r) => ({
      webdbUid: r.uid,
      titleDe: nullIfEmpty(r.title_de),
      titleEn: nullIfEmpty(r.title_en),
      summaryDe: nullIfEmpty(r.summary_de),
      summaryEn: nullIfEmpty(r.summary_en),
      urlDe: nullIfEmpty(r.url_de),
      urlEn: nullIfEmpty(r.url_en),
      thematicFocusDe: nullIfEmpty(r.thematic_focus_de),
      thematicFocusEn: nullIfEmpty(r.thematic_focus_en),
      fundingTypeDe: nullIfEmpty(r.funding_type_de),
      fundingTypeEn: nullIfEmpty(r.funding_type_en),
      startsOn: tsDate(r.starts_on),
      endsOn: tsDate(r.ends_on),
      cancelled: truthy(r.cancelled),
      typeText: null,
      parentWebdbUid: r.superior_project || null,
    })),
    lectures: raw.lectures.map((r) => ({
      webdbUid: r.uid,
      originalTitle: r.original_title || '',
      lectureDate: tsDate(r.lecture_date),
      city: nullIfEmpty(r.city),
      eventName: nullIfEmpty(r.event_name),
      eventType: nullIfEmpty(r.event_type),
      kind: nullIfEmpty(r.kind),
      typeWebdbUid: r.type ?? null,
      popularScience: truthy(r.popular_science),
      speaker: nullIfEmpty(r.speaker),
      citation: nullIfEmpty(r.citation),
      url: nullIfEmpty(r.url),
    })),
    publications: pubs,
    junctions: {
      personPublications: raw.personPublications.map((r) => ({
        personWebdbUid: r.person,
        publicationWebdbUid: r.publication,
        highlight: truthy(r.highlight),
        mahighlight: truthy(r.mahighlight),
        authorship: r.authorship === '?' ? null : nullIfEmpty(r.authorship),
      })),
      orgunitPublications: raw.orgunitPublications.map((r) => ({
        orgunitWebdbUid: r.organizational_unit,
        publicationWebdbUid: r.publication,
        highlight: truthy(r.highlight),
      })),
      publicationProjects: raw.publicationProjects.map((r) => ({
        publicationWebdbUid: r.publication_uid,
        projectWebdbUid: r.project_uid,
        sorting: r.sorting || null,
      })),
      personOestat6: raw.personOestat6.map((r) => ({
        personWebdbUid: r.person_uid,
        oestat6WebdbUid: r.oestat6_uid,
      })),
      lecturePersons: raw.lecturePersons.map((r) => ({
        lectureWebdbUid: r.lecture,
        personWebdbUid: r.person,
      })),
      lectureOrgunits: raw.lectureOrgunits.map((r) => ({
        lectureWebdbUid: r.lecture_uid,
        orgunitWebdbUid: r.orgunit_uid,
      })),
      projectLectures: raw.projectLectures.map((r) => ({
        projectWebdbUid: r.project_uid,
        lectureWebdbUid: r.lecture_uid,
      })),
      extunitPersons: raw.extunitPersons.map((r) => ({
        extunitWebdbUid: r.external_unit,
        personWebdbUid: r.person,
      })),
      orgunitPersons: raw.orgunitPersons.map((r) => ({
        orgunitWebdbUid: r.organizational_unit,
        personWebdbUid: r.person,
        role: nullIfEmpty(r.role),
        phone: nullIfEmpty(r.phone),
        scientist: truthy(r.scientist),
      })),
    },
  };
}
