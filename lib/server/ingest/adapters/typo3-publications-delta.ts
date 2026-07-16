// TYPO3-Publications-Delta-Adapter. PURE: keine DB, kein Netz, keine Uhr, kein
// Import aus scripts/** (ADR-0017-Grenze — der DOI-Extraktor wird injiziert).
//
// Verwandelt den inkrementellen Export
//   https://www.oeaw.ac.at/fileadmin/exports/publications_incremental_change_2.json
//     { meta:{generated_at_timestamp, generated_at_readable},
//       data:{ records_to_delete:{...}, records_to_add_or_update:{...} } }
// (rohe TYPO3-Tabellen tx_hebowebdb_domain_model_{publication,person,
//  personpublication,orgunitpublication}) in die normalisierte jsonb-Payload,
// die die DB-Funktion apply_publications_delta(payload, opts) erwartet.
//
// Werte-Normalisierung (Datum/Sentinel/DOI, In-Batch-DOI-Dedupe) lebt hier;
// die GESAMTE relationale Logik (Upsert/FK-Auflösung/Delete/Archiv/is_ita/
// Cursor) lebt in Postgres. Die Payload-Keys sind exakt die snake_case-Namen,
// die die jsonb_to_recordset-Spaltendefinitionen der Funktion lesen.

import { z } from 'zod';
import { tsDate, nullIfEmpty } from './webdb-normalize';

// --- Roh-Record-Shapes (die TYPO3-Spalten, Werte sind Strings) --------------

export interface RawDeltaPublication {
  uid: number | string;
  deleted?: number | string;
  original_title?: string | null;
  summary_de?: string | null;
  summary_en?: string | null;
  doi_link?: string | null;
  pub_date?: number | string | null;
  ris?: string | null;
  type?: number | string | null;
  peer_reviewed?: number | string | null;
  popular_science?: number | string | null;
  open_access?: string | null;
  lead_author?: string | null;
  website_link?: string | null;
  download_link?: string | null;
  citation_apa?: string | null;
  citation_de?: string | null;
  citation_en?: string | null;
  bibtex?: string | null;
  endnote?: string | null;
  // weitere Felder (cruser_id, pid, persons, …) werden ignoriert.
  [k: string]: unknown;
}

export interface RawDeltaPerson {
  uid: number | string;
  deleted?: number | string;
  firstname?: string | null;
  lastname?: string | null;
  degree_before?: string | null;
  degree_after?: string | null;
  degree_non_academic_de?: string | null;
  degree_non_academic_en?: string | null;
  biography_de?: string | null;
  biography_en?: string | null;
  email?: string | null;
  email_en?: string | null;
  external_link_de?: string | null;
  external_link_en?: string | null;
  portrait?: string | null;
  copyright?: string | null;
  orcid?: string | null;
  slug?: string | null;
  oestat3_name_de?: string | null;
  oestat3_name_en?: string | null;
  research_field_no_oestat?: string | null;
  research_fields?: string | null;
  selected_publications?: string | null;
  member_type?: number | string | null;
  external?: number | string | null;
  deceased?: number | string | null;
  date_of_death?: number | string | null;
  vip_de?: string | null;
  vip_en?: string | null;
  use_vip?: number | string | null;
  selectionyear?: number | string | null;
  [k: string]: unknown;
}

export interface RawDeltaPersonPublication {
  person: number | string;
  publication: number | string;
  highlight?: number | string;
  mahighlight?: number | string;
  authorship?: string | null;
  deleted?: number | string;
  [k: string]: unknown;
}

export interface RawDeltaOrgunitPublication {
  organizational_unit: number | string;
  publication: number | string;
  highlight?: number | string;
  deleted?: number | string;
  [k: string]: unknown;
}

interface RawTableGroup {
  tx_hebowebdb_domain_model_publication?: RawDeltaPublication[];
  // Personen kommen upstream inkonsistent: teils als flaches {…}, teils als
  // [{…}] (Ein-Element-Array) gewrappt. Beide Formen werden akzeptiert und vor
  // der Nutzung durch unwrapPersonRows entpackt.
  tx_hebowebdb_domain_model_person?: (RawDeltaPerson | [RawDeltaPerson])[];
  tx_hebowebdb_domain_model_personpublication?: RawDeltaPersonPublication[];
  tx_hebowebdb_domain_model_orgunitpublication?: RawDeltaOrgunitPublication[];
}

export interface PublicationsDeltaExport {
  meta?: {
    generated_at_timestamp?: number;
    generated_at_readable?: string;
  };
  data?: {
    records_to_delete?: RawTableGroup;
    records_to_add_or_update?: RawTableGroup;
  };
}

/** Injizierter DOI-Extraktor (scripts/lib/doi-extract.mjs) — single source mit
 *  dem Runtime-Backfill; hier injiziert, damit der Adapter kein scripts/**
 *  importiert und trivial unit-testbar bleibt. */
export type ExtractDoiFromRow = (row: Record<string, unknown>) => string | null;

// --- normalisierte Payload (snake_case = DB-Spalten / recordset-Keys) -------

export interface NormalizedDeltaPublication {
  webdb_uid: number;
  title: string;
  original_title: string | null;
  summary_de: string | null;
  summary_en: string | null;
  doi: string | null;
  doi_link: string | null;
  published_at: string | null;
  ris: string | null;
  publication_type_webdb_uid: number | null;
  peer_reviewed: boolean;
  popular_science: boolean;
  open_access_status: string | null;
  open_access: boolean;
  oa_type: string | null;
  lead_author: string | null;
  website_link: string | null;
  download_link: string | null;
  citation_apa: string | null;
  citation_de: string | null;
  citation_en: string | null;
  bibtex: string | null;
  endnote: string | null;
  citation: string | null;
}

export interface NormalizedDeltaPerson {
  webdb_uid: number;
  firstname: string;
  lastname: string;
  degree_before: string | null;
  degree_after: string | null;
  degree_non_academic_de: string | null;
  degree_non_academic_en: string | null;
  biography_de: string | null;
  biography_en: string | null;
  email: string | null;
  email_en: string | null;
  external_link_de: string | null;
  external_link_en: string | null;
  portrait: string | null;
  copyright: string | null;
  orcid: string | null;
  slug: string | null;
  oestat3_name_de: string | null;
  oestat3_name_en: string | null;
  research_field_no_oestat: string | null;
  research_fields: string | null;
  selected_publications: string | null;
  member_type_webdb_uid: number | null;
  external: boolean;
  deceased: boolean;
  date_of_death: string | null;
  vip_de: string | null;
  vip_en: string | null;
  use_vip: boolean;
  selectionyear: number | null;
}

export interface NormalizedPersonPublication {
  person_webdb_uid: number;
  publication_webdb_uid: number;
  highlight: boolean;
  mahighlight: boolean;
  authorship: string | null;
}

export interface NormalizedOrgunitPublication {
  orgunit_webdb_uid: number;
  publication_webdb_uid: number;
  highlight: boolean;
}

export interface PublicationsDeltaPayload {
  meta: {
    generated_at_timestamp: number | null;
    generated_at_readable: string | null;
  };
  upsert: {
    publications: NormalizedDeltaPublication[];
    persons: NormalizedDeltaPerson[];
    person_publications: NormalizedPersonPublication[];
    orgunit_publications: NormalizedOrgunitPublication[];
  };
  delete: {
    publications: number[];
    persons: number[];
    person_publications: { person_webdb_uid: number; publication_webdb_uid: number }[];
    orgunit_publications: { orgunit_webdb_uid: number; publication_webdb_uid: number }[];
  };
}

export interface ParsedPublicationsDelta {
  payload: PublicationsDeltaPayload;
  stats: {
    /** Pubs aus records_to_add_or_update, die deleted:"1" trugen und in delete
     *  umgeleitet wurden (statt als aktiv geupsertet). */
    routedDeletedPublications: number;
    routedDeletedPersons: number;
    /** In-Batch nach webdb_uid deduplizierte Pubs / Personen (letzter gewinnt). */
    duplicatePublications: number;
    duplicatePersons: number;
    /** DOIs, die wegen Doppelung innerhalb des Deltas genullt wurden. */
    dedupedDois: number;
  };
}

/** Striktes Integer-Parsing für uids/FK-Referenzen — non-integer → NaN (nie ein
 *  stilles 0 aus `Number(null)`), damit die Aufrufer sauber verwerfen können. */
const toId = (v: unknown): number => {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  const s = String(v).trim();
  const n = parseInt(s, 10);
  return s !== '' && String(n) === s ? n : NaN;
};
/** TYPO3-Lookup-FK: 0/''/null = „unset" → null. Verhindert, dass die DB die
 *  vielen Personen ohne member_type als „unresolved_member_type" fehlzählt. */
const lookupUid = (v: unknown): number | null => {
  const n = toId(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const truthy = (v: unknown): boolean => Number(v) === 1;
const isDeleted = (v: unknown): boolean => Number(v) === 1;

const looseRecord = z.record(z.string(), z.unknown());
const looseRecordArray = z.array(looseRecord);
// Personen kommen upstream teils als [{…}] (Ein-Element-Array) statt {…} —
// beide Formen zulassen (die Hüllenvalidierung soll bei ECHTEM Drift laut
// scheitern, aber diese bekannte Inkonsistenz nicht als Fehler werten).
const personRowArray = z.array(z.union([looseRecord, z.array(looseRecord)]));
const tableGroupSchema = z
  .object({
    tx_hebowebdb_domain_model_publication: looseRecordArray.optional(),
    tx_hebowebdb_domain_model_person: personRowArray.optional(),
    tx_hebowebdb_domain_model_personpublication: looseRecordArray.optional(),
    tx_hebowebdb_domain_model_orgunitpublication: looseRecordArray.optional(),
  })
  .optional();

/** Personen kommen upstream inkonsistent als flaches `{…}` ODER als `[{…}]`
 *  (Ein-Element-Array) gewrappt. Entpackt beide Formen zu flachen Records und
 *  verwirft Leeres — damit die restliche Delta-Logik nur mit Records arbeitet. */
function unwrapPersonRows(
  rows: (RawDeltaPerson | [RawDeltaPerson])[] | undefined,
): RawDeltaPerson[] {
  if (!rows) return [];
  const out: RawDeltaPerson[] = [];
  for (const r of rows) {
    const rec = Array.isArray(r) ? r[0] : r;
    if (rec && typeof rec === 'object') out.push(rec);
  }
  return out;
}

/** Zod-Schema NUR für die Hülle: `meta.generated_at_timestamp` + die beiden
 *  records_*-Gruppen. Die einzelnen TYPO3-Records bleiben lose (z.record) —
 *  sie werden NICHT gestript, sondern anschließend aus dem Original-JSON
 *  normalisiert. Ziel: bei einem Formatdrift OeAW-seitig LAUT scheitern statt
 *  still ein leeres No-op-Delta zu importieren. */
export const publicationsDeltaExportSchema = z.object({
  meta: z.object({
    generated_at_timestamp: z.number(),
    generated_at_readable: z.string().nullish(),
  }),
  data: z.object({
    records_to_delete: tableGroupSchema,
    records_to_add_or_update: tableGroupSchema,
  }),
});

/** Reiner Transform des Delta-Exports in die apply_publications_delta-Payload.
 *  extractDoiFromRow wird injiziert (siehe Typ oben). Wirft bei ungültiger
 *  Hülle (Zod) — der Aufrufer soll das als Fehler behandeln, nicht als Leer-Delta. */
export function parsePublicationsDelta(
  json: PublicationsDeltaExport,
  extractDoiFromRow: ExtractDoiFromRow,
): ParsedPublicationsDelta {
  const validated = publicationsDeltaExportSchema.safeParse(json);
  if (!validated.success) {
    const detail = validated.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`publications delta export failed envelope validation: ${detail}`);
  }

  const add = json?.data?.records_to_add_or_update ?? {};
  const del = json?.data?.records_to_delete ?? {};

  const stats = {
    routedDeletedPublications: 0,
    routedDeletedPersons: 0,
    duplicatePublications: 0,
    duplicatePersons: 0,
    dedupedDois: 0,
  };

  // --- Publikationen: deleted:"1" abzweigen, Rest normalisieren, dedupe uid --
  const pubUpsertByUid = new Map<number, NormalizedDeltaPublication>();
  const pubDeleteUids = new Set<number>();
  for (const raw of add.tx_hebowebdb_domain_model_publication ?? []) {
    const uid = toId(raw.uid);
    if (!Number.isFinite(uid)) continue;
    if (isDeleted(raw.deleted)) {
      pubDeleteUids.add(uid);
      stats.routedDeletedPublications++;
      continue;
    }
    if (pubUpsertByUid.has(uid)) stats.duplicatePublications++;
    pubUpsertByUid.set(uid, normalizePublication(raw, uid, extractDoiFromRow));
  }
  for (const v of del.tx_hebowebdb_domain_model_publication ?? []) {
    const uid = toId(v.uid);
    if (Number.isFinite(uid)) pubDeleteUids.add(uid);
  }
  // Ein uid, der gelöscht werden soll, wird nicht zugleich geupsertet.
  for (const uid of pubDeleteUids) pubUpsertByUid.delete(uid);

  // In-Batch-DOI-Dedupe (niedrigste webdb_uid behält die DOI) — mirror des
  // Voll-Imports; die DB-Funktion setzt danach jede Pub-DOI aus der Payload.
  const pubList = [...pubUpsertByUid.values()].sort((a, b) => a.webdb_uid - b.webdb_uid);
  const seenDoi = new Set<string>();
  for (const p of pubList) {
    if (!p.doi) continue;
    if (seenDoi.has(p.doi)) {
      p.doi = null;
      stats.dedupedDois++;
    } else {
      seenDoi.add(p.doi);
    }
  }

  // --- Personen: deleted:"1" abzweigen, dedupe uid -------------------------
  const personUpsertByUid = new Map<number, NormalizedDeltaPerson>();
  const personDeleteUids = new Set<number>();
  for (const raw of unwrapPersonRows(add.tx_hebowebdb_domain_model_person)) {
    const uid = toId(raw.uid);
    if (!Number.isFinite(uid)) continue;
    if (isDeleted(raw.deleted)) {
      personDeleteUids.add(uid);
      stats.routedDeletedPersons++;
      continue;
    }
    if (personUpsertByUid.has(uid)) stats.duplicatePersons++;
    personUpsertByUid.set(uid, normalizePerson(raw, uid));
  }
  for (const v of unwrapPersonRows(del.tx_hebowebdb_domain_model_person)) {
    const uid = toId(v.uid);
    if (Number.isFinite(uid)) personDeleteUids.add(uid);
  }
  for (const uid of personDeleteUids) personUpsertByUid.delete(uid);

  // --- Junctions ------------------------------------------------------------
  const personPublications: NormalizedPersonPublication[] = [];
  for (const raw of add.tx_hebowebdb_domain_model_personpublication ?? []) {
    if (isDeleted(raw.deleted)) continue;
    const person = toId(raw.person);
    const publication = toId(raw.publication);
    if (!Number.isFinite(person) || !Number.isFinite(publication)) continue;
    personPublications.push({
      person_webdb_uid: person,
      publication_webdb_uid: publication,
      highlight: truthy(raw.highlight),
      mahighlight: truthy(raw.mahighlight),
      authorship: raw.authorship === '?' ? null : nullIfEmpty(raw.authorship ?? null),
    });
  }
  const orgunitPublications: NormalizedOrgunitPublication[] = [];
  for (const raw of add.tx_hebowebdb_domain_model_orgunitpublication ?? []) {
    if (isDeleted(raw.deleted)) continue;
    const orgunit = toId(raw.organizational_unit);
    const publication = toId(raw.publication);
    if (!Number.isFinite(orgunit) || !Number.isFinite(publication)) continue;
    orgunitPublications.push({
      orgunit_webdb_uid: orgunit,
      publication_webdb_uid: publication,
      highlight: truthy(raw.highlight),
    });
  }

  const ppDelete = (del.tx_hebowebdb_domain_model_personpublication ?? [])
    .map((r) => ({ person_webdb_uid: toId(r.person), publication_webdb_uid: toId(r.publication) }))
    .filter((r) => Number.isFinite(r.person_webdb_uid) && Number.isFinite(r.publication_webdb_uid));
  const opDelete = (del.tx_hebowebdb_domain_model_orgunitpublication ?? [])
    .map((r) => ({ orgunit_webdb_uid: toId(r.organizational_unit), publication_webdb_uid: toId(r.publication) }))
    .filter((r) => Number.isFinite(r.orgunit_webdb_uid) && Number.isFinite(r.publication_webdb_uid));

  return {
    payload: {
      meta: {
        generated_at_timestamp: json?.meta?.generated_at_timestamp ?? null,
        generated_at_readable: json?.meta?.generated_at_readable ?? null,
      },
      upsert: {
        publications: pubList,
        persons: [...personUpsertByUid.values()],
        person_publications: personPublications,
        orgunit_publications: orgunitPublications,
      },
      delete: {
        publications: [...pubDeleteUids],
        persons: [...personDeleteUids],
        person_publications: ppDelete,
        orgunit_publications: opDelete,
      },
    },
    stats,
  };
}

function normalizePublication(
  r: RawDeltaPublication,
  uid: number,
  extractDoiFromRow: ExtractDoiFromRow,
): NormalizedDeltaPublication {
  const pubDate = r.pub_date == null ? null : Number(r.pub_date);
  const openAccess = nullIfEmpty(r.open_access ?? null);
  return {
    webdb_uid: uid,
    title: nullIfEmpty(r.original_title ?? null) ?? '(untitled)',
    original_title: nullIfEmpty(r.original_title ?? null),
    summary_de: nullIfEmpty(r.summary_de ?? null),
    summary_en: nullIfEmpty(r.summary_en ?? null),
    doi: extractDoiFromRow(r),
    doi_link: nullIfEmpty(r.doi_link ?? null),
    published_at: tsDate(pubDate),
    ris: nullIfEmpty(r.ris ?? null),
    publication_type_webdb_uid: lookupUid(r.type),
    peer_reviewed: truthy(r.peer_reviewed),
    popular_science: truthy(r.popular_science),
    open_access_status: openAccess,
    open_access: !!openAccess && openAccess.startsWith('oa_'),
    oa_type: openAccess,
    lead_author: nullIfEmpty(r.lead_author ?? null),
    website_link: nullIfEmpty(r.website_link ?? null),
    download_link: nullIfEmpty(r.download_link ?? null),
    citation_apa: nullIfEmpty(r.citation_apa ?? null),
    citation_de: nullIfEmpty(r.citation_de ?? null),
    citation_en: nullIfEmpty(r.citation_en ?? null),
    bibtex: nullIfEmpty(r.bibtex ?? null),
    endnote: nullIfEmpty(r.endnote ?? null),
    citation: nullIfEmpty(r.citation_de ?? null) || nullIfEmpty(r.citation_apa ?? null),
  };
}

function normalizePerson(r: RawDeltaPerson, uid: number): NormalizedDeltaPerson {
  const dateOfDeath = r.date_of_death == null ? null : Number(r.date_of_death);
  return {
    webdb_uid: uid,
    firstname: nullIfEmpty(r.firstname ?? null) ?? '',
    lastname: nullIfEmpty(r.lastname ?? null) ?? '',
    degree_before: nullIfEmpty(r.degree_before ?? null),
    degree_after: nullIfEmpty(r.degree_after ?? null),
    degree_non_academic_de: nullIfEmpty(r.degree_non_academic_de ?? null),
    degree_non_academic_en: nullIfEmpty(r.degree_non_academic_en ?? null),
    biography_de: nullIfEmpty(r.biography_de ?? null),
    biography_en: nullIfEmpty(r.biography_en ?? null),
    email: nullIfEmpty(r.email ?? null),
    email_en: nullIfEmpty(r.email_en ?? null),
    external_link_de: nullIfEmpty(r.external_link_de ?? null),
    external_link_en: nullIfEmpty(r.external_link_en ?? null),
    portrait: nullIfEmpty(r.portrait ?? null),
    copyright: nullIfEmpty(r.copyright ?? null),
    orcid: nullIfEmpty(r.orcid ?? null),
    slug: nullIfEmpty(r.slug ?? null),
    oestat3_name_de: nullIfEmpty(r.oestat3_name_de ?? null),
    oestat3_name_en: nullIfEmpty(r.oestat3_name_en ?? null),
    research_field_no_oestat: nullIfEmpty(r.research_field_no_oestat ?? null),
    research_fields: nullIfEmpty(r.research_fields ?? null),
    selected_publications: nullIfEmpty(r.selected_publications ?? null),
    member_type_webdb_uid: lookupUid(r.member_type),
    external: truthy(r.external),
    deceased: truthy(r.deceased),
    date_of_death: tsDate(dateOfDeath),
    vip_de: nullIfEmpty(r.vip_de ?? null),
    vip_en: nullIfEmpty(r.vip_en ?? null),
    use_vip: truthy(r.use_vip),
    selectionyear: lookupUid(r.selectionyear),
  };
}
