// Shared ingest loader (ADR 0017) — Drizzle port of the write half of
// scripts/webdb-import.mjs.
//
// Consumes a source-agnostic `CanonicalBatch` and reconciles it into
// Postgres: idempotent upsert by `webdb_uid`, FK-UUID resolution, the two
// publication archival passes, junction rebuilds, the is_ita_subtree
// refresh, the three post-import SQL functions and the matview refresh —
// in the EXACT order and with the EXACT column sets of the .mjs script.
//
// Analysis-field preservation: the per-table `onConflictDoUpdate` set is
// built only from the WebDB-owned column lists in `./canonical.ts`; LLM /
// review / enrichment columns are never in an INSERT or UPDATE, so
// PostgreSQL leaves them untouched. The set/preserved disjointness is
// unit-tested. The is_ita_subtree / lead_author / published_at refreshes
// are deliberate WebDB-derived recomputations the .mjs script also runs
// (the parity gate compares those new-vs-old, not new-vs-baseline).
//
// Set-based maintenance SQL (archival, parent-FK 2nd pass, is_ita refresh,
// SQL-fn calls, matview) stays as `sql` templates executed through the same
// Drizzle client — these have no query-builder form and were always SQL;
// the ADR's target was the hand-rolled pg.Client generic upsert, removed.

import { sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import {
  publicationTypes, lectureTypes, orgunitTypes, memberTypes,
  oestat6Categories, orgunits, extunits, persons, projects, lectures,
  publications, personPublications, orgunitPublications, publicationProjects,
  personOestat6, lecturePersons, lectureOrgunits, projectLectures,
  extunitPersons, orgunitPersons,
} from '@/lib/server/db/schema';
import type { CanonicalBatch } from './canonical';
import {
  LOOKUP_UPDATE, ORGUNIT_UPDATE, EXTUNIT_UPDATE, PERSON_UPDATE,
  PROJECT_UPDATE, LECTURE_UPDATE, PUBLICATION_WEBDB_UPDATE,
} from './canonical';
import { upsertBatch, execCountingUpdate, execScalar } from './upsert';
import type { IngestDb } from './upsert';

const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

/** webdb_uid -> internal UUID, read back after a parent table is upserted
 *  (faithful to the .mjs `fkMap()`). */
async function fkMap(
  db: IngestDb,
  table: PgTable & { id: PgColumn; webdbUid: PgColumn },
): Promise<Map<number, string>> {
  const rows = (await db
    .select({ id: table.id, webdbUid: table.webdbUid })
    .from(table)) as Array<{ id: string; webdbUid: number }>;
  const m = new Map<number, string>();
  for (const r of rows) m.set(r.webdbUid, r.id);
  return m;
}

export interface IngestOptions {
  /** Provenance tag written to press_release_promote_log.source. The v2
   *  script passes 'webdb-import' for byte-identical provenance with the
   *  legacy path. */
  promoteSource: string;
}

/**
 * Reconcile a canonical batch into Postgres. Mirrors the .mjs `main()`
 * ordering exactly: lookups -> orgunits -> extunits -> persons -> projects
 * -> lectures -> publications -> junctions -> backfill fns -> matview.
 */
export async function runIngest(
  db: IngestDb,
  batch: CanonicalBatch,
  opts: IngestOptions,
): Promise<void> {
  const t0 = Date.now();
  // Single run-timestamp for synced_at across all tables. The .mjs script
  // set publications.synced_at to a per-row `new Date().toISOString()` and
  // let the entity tables' `EXCLUDED.synced_at` resolve to their
  // `DEFAULT now()`; both mean "the time of this import". Using one ISO
  // string for every synced row is observably identical (sub-second) and
  // deterministic within a run. synced_at is never parity-gated (it is a
  // run timestamp, expected to differ between any two runs).
  const runIso = new Date().toISOString();

  await importLookups(db, batch);
  await importOrgunits(db, batch, runIso);
  await importExtunits(db, batch, runIso);
  await importPersons(db, batch, runIso);
  await importProjects(db, batch, runIso);
  await importLectures(db, batch, runIso);
  await importPublications(db, batch, runIso);
  await importJunctions(db, batch);

  // WebDB keeps the scalar lead_author manually; often empty for book
  // chapters / proceedings though person_publications knows the authors.
  // Idempotent. Migration 20260505000003.
  const ladr = await execScalar<number | string>(
    db,
    sql`backfill_lead_author_from_persons()`,
  );
  log(`Backfilled lead_author from person_publications: ${ladr} pubs`);

  // pub_date is poorly maintained in WebDB but the year is almost always in
  // the bibtex/citation/ris/endnote. Idempotent. Migration 20260505000004.
  const yr = await execScalar<number | string>(
    db,
    sql`backfill_published_at_from_text()`,
  );
  log(`Backfilled published_at from bibtex/citation: ${yr} pubs`);

  // Press-release orphans whose paper just arrived get linked + the orphan
  // removed. Idempotent. Migration 20260509000002 / 20260509000005.
  const promoted = await execScalar<number | string>(
    db,
    sql`promote_press_release_orphans_logged(${opts.promoteSource})`,
  );
  log(`Promoted press-release-orphans: ${promoted} pubs`);

  log('Refreshing publication_oestat6 matview...');
  await db.execute(
    sql`REFRESH MATERIALIZED VIEW CONCURRENTLY publication_oestat6`,
  );
  log(`DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ===========================================================================
// 1. Lookup tables
// ===========================================================================

async function importLookups(db: IngestDb, batch: CanonicalBatch) {
  const L = batch.lookups;
  for (const [rows, table, label] of [
    [L.publicationTypes, publicationTypes, 'publication_types'],
    [L.lectureTypes, lectureTypes, 'lecture_types'],
    [L.orgunitTypes, orgunitTypes, 'orgunit_types'],
    [L.memberTypes, memberTypes, 'member_types'],
    [L.oestat6Categories, oestat6Categories, 'oestat6_categories'],
  ] as const) {
    log(`Importing ${label} (${rows.length} rows)`);
    await upsertBatch(db, table, rows as unknown as Record<string, unknown>[],
      'webdbUid', LOOKUP_UPDATE);
  }
}

// ===========================================================================
// 2. Core entities
// ===========================================================================

async function importOrgunits(
  db: IngestDb, batch: CanonicalBatch, runIso: string,
) {
  const typeMap = await fkMap(db, orgunitTypes);
  const rows = batch.orgunits.map((c) => ({
    webdbUid: c.webdbUid,
    nameDe: c.nameDe,
    nameEn: c.nameEn,
    akronymDe: c.akronymDe,
    akronymEn: c.akronymEn,
    urlDe: c.urlDe,
    urlEn: c.urlEn,
    typeId: (c.typeWebdbUid != null && typeMap.get(c.typeWebdbUid)) || null,
    parentWebdbUid: c.parentWebdbUid,
    syncedAt: runIso,
  }));
  log(`Importing orgunits (${rows.length} rows)`);
  await upsertBatch(db, orgunits, rows, 'webdbUid', ORGUNIT_UPDATE);

  const n = await execCountingUpdate(
    db,
    sql`UPDATE orgunits c SET parent_id = p.id FROM orgunits p
        WHERE c.parent_webdb_uid = p.webdb_uid
          AND c.parent_id IS DISTINCT FROM p.id
        RETURNING 1`,
  );
  log(`  orgunit parent FKs resolved (${n})`);
}

async function importExtunits(
  db: IngestDb, batch: CanonicalBatch, runIso: string,
) {
  const rows = batch.extunits.map((c) => ({
    webdbUid: c.webdbUid,
    nameDe: c.nameDe,
    nameEn: c.nameEn,
    logo: c.logo,
    syncedAt: runIso,
  }));
  log(`Importing extunits (${rows.length} rows)`);
  await upsertBatch(db, extunits, rows, 'webdbUid', EXTUNIT_UPDATE);
}

async function importPersons(
  db: IngestDb, batch: CanonicalBatch, runIso: string,
) {
  const memberTypeMap = await fkMap(db, memberTypes);
  const rows = batch.persons.map((c) => ({
    webdbUid: c.webdbUid,
    firstname: c.firstname,
    lastname: c.lastname,
    degreeBefore: c.degreeBefore,
    degreeAfter: c.degreeAfter,
    degreeNonAcademicDe: c.degreeNonAcademicDe,
    degreeNonAcademicEn: c.degreeNonAcademicEn,
    biographyDe: c.biographyDe,
    biographyEn: c.biographyEn,
    email: c.email,
    emailEn: c.emailEn,
    externalLinkDe: c.externalLinkDe,
    externalLinkEn: c.externalLinkEn,
    portrait: c.portrait,
    copyright: c.copyright,
    orcid: c.orcid,
    slug: c.slug,
    oestat3NameDe: c.oestat3NameDe,
    oestat3NameEn: c.oestat3NameEn,
    researchFieldNoOestat: c.researchFieldNoOestat,
    researchFields: c.researchFields,
    selectedPublications: c.selectedPublications,
    memberTypeId:
      (c.memberTypeWebdbUid != null && memberTypeMap.get(c.memberTypeWebdbUid))
      || null,
    external: c.external,
    deceased: c.deceased,
    dateOfDeath: c.dateOfDeath,
    vipDe: c.vipDe,
    vipEn: c.vipEn,
    useVip: c.useVip,
    selectionyear: c.selectionyear,
    syncedAt: runIso,
  }));
  log(`Importing persons (${rows.length} rows)`);
  await upsertBatch(db, persons, rows, 'webdbUid', PERSON_UPDATE);
}

async function importProjects(
  db: IngestDb, batch: CanonicalBatch, runIso: string,
) {
  const rows = batch.projects.map((c) => ({
    webdbUid: c.webdbUid,
    titleDe: c.titleDe,
    titleEn: c.titleEn,
    summaryDe: c.summaryDe,
    summaryEn: c.summaryEn,
    urlDe: c.urlDe,
    urlEn: c.urlEn,
    thematicFocusDe: c.thematicFocusDe,
    thematicFocusEn: c.thematicFocusEn,
    fundingTypeDe: c.fundingTypeDe,
    fundingTypeEn: c.fundingTypeEn,
    startsOn: c.startsOn,
    endsOn: c.endsOn,
    cancelled: c.cancelled,
    typeText: c.typeText,
    parentWebdbUid: c.parentWebdbUid,
    syncedAt: runIso,
  }));
  log(`Importing projects (${rows.length} rows)`);
  await upsertBatch(db, projects, rows, 'webdbUid', PROJECT_UPDATE);

  const n = await execCountingUpdate(
    db,
    sql`UPDATE projects c SET parent_id = p.id FROM projects p
        WHERE c.parent_webdb_uid = p.webdb_uid
          AND c.parent_id IS DISTINCT FROM p.id
        RETURNING 1`,
  );
  log(`  project parent FKs resolved (${n})`);
}

async function importLectures(
  db: IngestDb, batch: CanonicalBatch, runIso: string,
) {
  const typeMap = await fkMap(db, lectureTypes);
  const rows = batch.lectures.map((c) => ({
    webdbUid: c.webdbUid,
    originalTitle: c.originalTitle,
    lectureDate: c.lectureDate,
    city: c.city,
    eventName: c.eventName,
    eventType: c.eventType,
    kind: c.kind,
    typeId: (c.typeWebdbUid != null && typeMap.get(c.typeWebdbUid)) || null,
    popularScience: c.popularScience,
    speaker: c.speaker,
    citation: c.citation,
    url: c.url,
    syncedAt: runIso,
  }));
  log(`Importing lectures (${rows.length} rows)`);
  await upsertBatch(db, lectures, rows, 'webdbUid', LECTURE_UPDATE);
}

// ===========================================================================
// 3. Publications — idempotent upsert by webdb_uid; analysis preserved.
// ===========================================================================

async function importPublications(
  db: IngestDb, batch: CanonicalBatch, runIso: string,
) {
  const pubTypeMap = await fkMap(db, publicationTypes);
  const cps = batch.publications;
  log(`Importing publications (${cps.length} rows)`);

  // DOI dedupe already done in the adapter's normalize() (source quirk).
  const dumpUids = cps.map((c) => c.webdbUid);
  const dumpDois = cps.map((c) => c.doi).filter((d): d is string => !!d);

  // Pre-clean: TYPO3 sometimes recreates a publication with a fresh
  // webdb_uid but the same DOI. The old local row would block the new
  // INSERT via the DOI unique constraint — archive it + null its DOI first
  // so the dump's authoritative row can take the DOI.
  if (dumpDois.length > 0) {
    const n = await execCountingUpdate(
      db,
      sql`UPDATE publications
            SET archived = true, doi = NULL, synced_at = NOW()
          WHERE archived = false
            AND webdb_uid <> ALL(${dumpUids}::int[])
            AND doi = ANY(${dumpDois}::text[])
          RETURNING 1`,
    );
    log(`  pre-cleaned ${n} stale rows whose DOIs collide with the dump`);
  }

  const rows = cps.map((c) => ({
    webdbUid: c.webdbUid,
    title: c.title,
    originalTitle: c.originalTitle,
    summaryDe: c.summaryDe,
    summaryEn: c.summaryEn,
    doi: c.doi,
    doiLink: c.doiLink,
    publishedAt: c.publishedAt,
    ris: c.ris,
    publicationTypeId:
      (c.publicationTypeWebdbUid != null
        && pubTypeMap.get(c.publicationTypeWebdbUid)) || null,
    peerReviewed: c.peerReviewed,
    popularScience: c.popularScience,
    openAccessStatus: c.openAccessStatus,
    openAccess: c.openAccess,
    oaType: c.oaType,
    leadAuthor: c.leadAuthor,
    websiteLink: c.websiteLink,
    downloadLink: c.downloadLink,
    citationApa: c.citationApa,
    citationCbe: c.citationCbe,
    citationHarvard: c.citationHarvard,
    citationMla: c.citationMla,
    citationVancouver: c.citationVancouver,
    citationDe: c.citationDe,
    citationEn: c.citationEn,
    bibtex: c.bibtex,
    endnote: c.endnote,
    citation: c.citation,
    webdbTstamp: c.webdbTstamp,
    webdbCrdate: c.webdbCrdate,
    archived: false,
    syncedAt: runIso,
  }));
  log(`  upserting ${rows.length} rows (analysis fields preserved)`);
  await upsertBatch(db, publications, rows, 'webdbUid',
    PUBLICATION_WEBDB_UPDATE);

  // Archive remaining publications absent from the new dump (TYPO3
  // soft-delete or visibility change). archived=true preserves analysis +
  // downstream FKs.
  const arch = await execCountingUpdate(
    db,
    sql`UPDATE publications SET archived = true, synced_at = NOW()
        WHERE archived = false
          AND webdb_uid <> ALL(${dumpUids}::int[])
        RETURNING 1`,
  );
  log(`  archived ${arch} publications absent from dump`);
}

// ===========================================================================
// 4. Junction tables — TRUNCATE then upsert resolved rows (faithful).
// ===========================================================================

async function importJunctions(db: IngestDb, batch: CanonicalBatch) {
  const personMap = await fkMap(db, persons);
  const orgunitMap = await fkMap(db, orgunits);
  const extunitMap = await fkMap(db, extunits);
  const projectMap = await fkMap(db, projects);
  const lectureMap = await fkMap(db, lectures);
  const publicationMap = await fkMap(db, publications);
  const oestat6Map = await fkMap(db, oestat6Categories);
  const J = batch.junctions;

  // person_publications
  {
    const rows = J.personPublications
      .map((j) => ({
        personId: personMap.get(j.personWebdbUid),
        publicationId: publicationMap.get(j.publicationWebdbUid),
        highlight: j.highlight,
        mahighlight: j.mahighlight,
        authorship: j.authorship,
        sorting: null as number | null,
      }))
      .filter((r) => r.personId && r.publicationId);
    log(`Importing person_publications (${rows.length} of `
      + `${J.personPublications.length} resolvable)`);
    await db.execute(sql`TRUNCATE person_publications`);
    await upsertBatch(db, personPublications, rows,
      ['personId', 'publicationId'],
      ['highlight', 'mahighlight', 'authorship', 'sorting']);
  }

  // orgunit_publications
  {
    const rows = J.orgunitPublications
      .map((j) => ({
        orgunitId: orgunitMap.get(j.orgunitWebdbUid),
        publicationId: publicationMap.get(j.publicationWebdbUid),
        highlight: j.highlight,
        sorting: null as number | null,
      }))
      .filter((r) => r.orgunitId && r.publicationId);
    log(`Importing orgunit_publications (${rows.length} of `
      + `${J.orgunitPublications.length})`);
    await db.execute(sql`TRUNCATE orgunit_publications`);
    await upsertBatch(db, orgunitPublications, rows,
      ['orgunitId', 'publicationId'], ['highlight', 'sorting']);

    // Refresh the cached publications.is_ita_subtree boolean — same
    // predicate as the migration backfill. WebDB-derived recomputation
    // (the .mjs script runs this too); parity-gate compares it new-vs-old.
    const n = await execCountingUpdate(
      db,
      sql`WITH ita_pubs AS (
            SELECT DISTINCT op.publication_id AS pid
            FROM orgunit_publications op
            JOIN orgunits o ON o.id = op.orgunit_id
            WHERE o.akronym_de ILIKE 'ITA%'
          )
          UPDATE publications p
          SET is_ita_subtree = (p.id IN (SELECT pid FROM ita_pubs))
          WHERE p.is_ita_subtree
            IS DISTINCT FROM (p.id IN (SELECT pid FROM ita_pubs))
          RETURNING 1`,
    );
    log(`  refreshed is_ita_subtree on ${n} publications`);
  }

  // publication_projects
  {
    const rows = J.publicationProjects
      .map((j) => ({
        publicationId: publicationMap.get(j.publicationWebdbUid),
        projectId: projectMap.get(j.projectWebdbUid),
        sorting: j.sorting,
      }))
      .filter((r) => r.publicationId && r.projectId);
    log(`Importing publication_projects (${rows.length} of `
      + `${J.publicationProjects.length})`);
    await db.execute(sql`TRUNCATE publication_projects`);
    await upsertBatch(db, publicationProjects, rows,
      ['publicationId', 'projectId'], ['sorting']);
  }

  // person_oestat6 (DO NOTHING — no payload columns)
  {
    const rows = J.personOestat6
      .map((j) => ({
        personId: personMap.get(j.personWebdbUid),
        oestat6Id: oestat6Map.get(j.oestat6WebdbUid),
      }))
      .filter((r) => r.personId && r.oestat6Id);
    log(`Importing person_oestat6 (${rows.length} of `
      + `${J.personOestat6.length})`);
    await db.execute(sql`TRUNCATE person_oestat6`);
    await upsertBatch(db, personOestat6, rows,
      ['personId', 'oestat6Id'], []);
  }

  // lecture_persons
  {
    const rows = J.lecturePersons
      .map((j) => ({
        lectureId: lectureMap.get(j.lectureWebdbUid),
        personId: personMap.get(j.personWebdbUid),
        sorting: null as number | null,
      }))
      .filter((r) => r.lectureId && r.personId);
    log(`Importing lecture_persons (${rows.length} of `
      + `${J.lecturePersons.length})`);
    await db.execute(sql`TRUNCATE lecture_persons`);
    await upsertBatch(db, lecturePersons, rows,
      ['lectureId', 'personId'], ['sorting']);
  }

  // lecture_orgunits
  {
    const rows = J.lectureOrgunits
      .map((j) => ({
        lectureId: lectureMap.get(j.lectureWebdbUid),
        orgunitId: orgunitMap.get(j.orgunitWebdbUid),
        sorting: null as number | null,
      }))
      .filter((r) => r.lectureId && r.orgunitId);
    log(`Importing lecture_orgunits (${rows.length} of `
      + `${J.lectureOrgunits.length})`);
    await db.execute(sql`TRUNCATE lecture_orgunits`);
    await upsertBatch(db, lectureOrgunits, rows,
      ['lectureId', 'orgunitId'], ['sorting']);
  }

  // project_lectures
  {
    const rows = J.projectLectures
      .map((j) => ({
        projectId: projectMap.get(j.projectWebdbUid),
        lectureId: lectureMap.get(j.lectureWebdbUid),
        sorting: null as number | null,
      }))
      .filter((r) => r.projectId && r.lectureId);
    log(`Importing project_lectures (${rows.length} of `
      + `${J.projectLectures.length})`);
    await db.execute(sql`TRUNCATE project_lectures`);
    await upsertBatch(db, projectLectures, rows,
      ['projectId', 'lectureId'], ['sorting']);
  }

  // extunit_persons
  {
    const rows = J.extunitPersons
      .map((j) => ({
        extunitId: extunitMap.get(j.extunitWebdbUid),
        personId: personMap.get(j.personWebdbUid),
        sorting: null as number | null,
      }))
      .filter((r) => r.extunitId && r.personId);
    log(`Importing extunit_persons (${rows.length} of `
      + `${J.extunitPersons.length})`);
    await db.execute(sql`TRUNCATE extunit_persons`);
    await upsertBatch(db, extunitPersons, rows,
      ['extunitId', 'personId'], ['sorting']);
  }

  // orgunit_persons
  {
    const rows = J.orgunitPersons
      .map((j) => ({
        orgunitId: orgunitMap.get(j.orgunitWebdbUid),
        personId: personMap.get(j.personWebdbUid),
        role: j.role,
        phone: j.phone,
        scientist: j.scientist,
        sorting: null as number | null,
      }))
      .filter((r) => r.orgunitId && r.personId);
    log(`Importing orgunit_persons (${rows.length} of `
      + `${J.orgunitPersons.length})`);
    await db.execute(sql`TRUNCATE orgunit_persons`);
    await upsertBatch(db, orgunitPersons, rows,
      ['orgunitId', 'personId'], ['role', 'phone', 'scientist', 'sorting']);
  }
}
