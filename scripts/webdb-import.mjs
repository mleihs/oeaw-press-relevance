// WebDB → Postgres ETL.
// Reads from a MySQL DB containing the HeboWebDB dump, writes to local Postgres.
//
// Usage (defaults match the local stacks we already have running):
//   node scripts/webdb-import.mjs
//
// Override via env: MYSQL_HOST, MYSQL_PORT, PG_DATABASE_URL, BATCH_SIZE.
//
// Match strategy for publications: prefer existing row by DOI (preserves
// analysis); else insert new. Old rows not present in the dump get archived.

import mysql from 'mysql2/promise';
import pg from 'pg';
import { extractDoiFromRow } from './lib/doi-extract.mjs';

const MYSQL = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 54499),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'root',
  database: process.env.MYSQL_DATABASE || 'webdb',
  charset: 'utf8mb4',
};
const PG_URL = process.env.PG_DATABASE_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54422/postgres';
const BATCH = Number(process.env.BATCH_SIZE || 1000);

const my = await mysql.createConnection(MYSQL);
const pgClient = new pg.Client({ connectionString: PG_URL });
await pgClient.connect();

const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

// Convert TYPO3 unix timestamp to ISO date or null. 0 = unset.
const tsDate = (n) => (n && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null);
const tsTimestamp = (n) => (n && n > 0 ? new Date(n * 1000).toISOString() : null);
const nullIfEmpty = (s) => (s === '' || s == null ? null : s);
const truthy = (n) => Number(n) === 1;

// Bulk insert with ON CONFLICT (webdb_uid) DO UPDATE on the listed columns.
async function upsert(table, rows, conflictKey, updateCols) {
  if (rows.length === 0) return 0;
  const cols = Object.keys(rows[0]);
  let copied = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const placeholders = slice
      .map((_, ri) =>
        '(' + cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',') + ')',
      )
      .join(',');
    const values = slice.flatMap((r) => cols.map((c) => r[c]));
    const conflictAction = updateCols.length === 0
      ? 'DO NOTHING'
      : 'DO UPDATE SET ' + updateCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    const sql = `
      INSERT INTO ${table} (${cols.join(',')})
      VALUES ${placeholders}
      ON CONFLICT (${conflictKey}) ${conflictAction}`;
    await pgClient.query(sql, values);
    copied += slice.length;
    process.stdout.write(`\r  ${table}: ${copied}/${rows.length}`);
  }
  process.stdout.write('\n');
  return copied;
}

// ============================================================
// 1. Lookup tables
// ============================================================

async function importLookups() {
  for (const [my_table, pg_table] of [
    ['tx_hebowebdb_domain_model_publicationtype', 'publication_types'],
    ['tx_hebowebdb_domain_model_lecturetype', 'lecture_types'],
    ['tx_hebowebdb_domain_model_orgunittype', 'orgunit_types'],
    ['tx_hebowebdb_domain_model_membertype', 'member_types'],
  ]) {
    const [rows] = await my.query(
      `SELECT uid, name_de, name_en FROM ${my_table} WHERE deleted=0`,
    );
    log(`Importing ${pg_table} (${rows.length} rows)`);
    await upsert(
      pg_table,
      rows.map((r) => ({
        webdb_uid: r.uid,
        name_de: r.name_de || '',
        name_en: r.name_en || '',
      })),
      'webdb_uid',
      ['name_de', 'name_en'],
    );
  }

  const [oestat6] = await my.query(
    `SELECT uid, name_de, name_en FROM tx_hebowebdb_domain_model_oestat6 WHERE deleted=0`,
  );
  log(`Importing oestat6_categories (${oestat6.length} rows)`);
  await upsert(
    'oestat6_categories',
    oestat6.map((r) => ({
      webdb_uid: r.uid,
      name_de: r.name_de || '',
      name_en: r.name_en || '',
    })),
    'webdb_uid',
    ['name_de', 'name_en'],
  );
}

// ============================================================
// 2. Core entities
// ============================================================

async function importOrgunits() {
  // Fetch the orgunit_type lookup so we can resolve type FK by webdb_uid.
  const orgunitTypeMap = await fkMap('orgunit_types');

  const [rows] = await my.query(`
    SELECT uid, name_de, name_en, akronym_de, akronym_en, url_de, url_en,
           type, superior_organizational_unit
    FROM tx_hebowebdb_domain_model_orgunit
    WHERE deleted=0`);
  log(`Importing orgunits (${rows.length} rows)`);
  await upsert(
    'orgunits',
    rows.map((r) => ({
      webdb_uid: r.uid,
      name_de: r.name_de || '',
      name_en: nullIfEmpty(r.name_en),
      akronym_de: nullIfEmpty(r.akronym_de),
      akronym_en: nullIfEmpty(r.akronym_en),
      url_de: nullIfEmpty(r.url_de),
      url_en: nullIfEmpty(r.url_en),
      type_id: orgunitTypeMap.get(r.type) || null,
      parent_webdb_uid: r.superior_organizational_unit || null,
    })),
    'webdb_uid',
    ['name_de', 'name_en', 'akronym_de', 'akronym_en', 'url_de', 'url_en',
     'type_id', 'parent_webdb_uid', 'synced_at'],
  );

  // Resolve parent FK in a 2nd pass.
  await pgClient.query(`
    UPDATE orgunits c
    SET parent_id = p.id
    FROM orgunits p
    WHERE c.parent_webdb_uid = p.webdb_uid AND c.parent_id IS DISTINCT FROM p.id`);
  log('  orgunit parent FKs resolved');
}

async function importExtunits() {
  const [rows] = await my.query(`
    SELECT uid, name_de, name_en, logo
    FROM tx_hebowebdb_domain_model_extunit
    WHERE deleted=0`);
  log(`Importing extunits (${rows.length} rows)`);
  await upsert(
    'extunits',
    rows.map((r) => ({
      webdb_uid: r.uid,
      name_de: r.name_de || '',
      name_en: nullIfEmpty(r.name_en),
      logo: nullIfEmpty(r.logo),
    })),
    'webdb_uid',
    ['name_de', 'name_en', 'logo', 'synced_at'],
  );
}

async function importPersons() {
  const memberTypeMap = await fkMap('member_types');

  const [rows] = await my.query(`
    SELECT uid, firstname, lastname, degree_before, degree_after,
           degree_non_academic_de, degree_non_academic_en,
           biography_de, biography_en, email, email_en,
           external_link_de, external_link_en, portrait, copyright,
           orcid, slug, oestat3_name_de, oestat3_name_en,
           research_field_no_oestat, research_fields, selected_publications,
           member_type, external, deceased, date_of_death,
           vip_de, vip_en, use_vip, selectionyear
    FROM tx_hebowebdb_domain_model_person
    WHERE deleted=0`);
  log(`Importing persons (${rows.length} rows)`);
  await upsert(
    'persons',
    rows.map((r) => ({
      webdb_uid: r.uid,
      firstname: r.firstname || '',
      lastname: r.lastname || '',
      degree_before: nullIfEmpty(r.degree_before),
      degree_after: nullIfEmpty(r.degree_after),
      degree_non_academic_de: nullIfEmpty(r.degree_non_academic_de),
      degree_non_academic_en: nullIfEmpty(r.degree_non_academic_en),
      biography_de: nullIfEmpty(r.biography_de),
      biography_en: nullIfEmpty(r.biography_en),
      email: nullIfEmpty(r.email),
      email_en: nullIfEmpty(r.email_en),
      external_link_de: nullIfEmpty(r.external_link_de),
      external_link_en: nullIfEmpty(r.external_link_en),
      portrait: nullIfEmpty(r.portrait),
      copyright: nullIfEmpty(r.copyright),
      orcid: nullIfEmpty(r.orcid),
      slug: nullIfEmpty(r.slug),
      oestat3_name_de: nullIfEmpty(r.oestat3_name_de),
      oestat3_name_en: nullIfEmpty(r.oestat3_name_en),
      research_field_no_oestat: nullIfEmpty(r.research_field_no_oestat),
      research_fields: nullIfEmpty(r.research_fields),
      selected_publications: nullIfEmpty(r.selected_publications),
      member_type_id: memberTypeMap.get(r.member_type) || null,
      external: truthy(r.external),
      deceased: truthy(r.deceased),
      date_of_death: tsDate(r.date_of_death),
      vip_de: nullIfEmpty(r.vip_de),
      vip_en: nullIfEmpty(r.vip_en),
      use_vip: truthy(r.use_vip),
      selectionyear: r.selectionyear || null,
    })),
    'webdb_uid',
    ['firstname', 'lastname', 'degree_before', 'degree_after',
     'degree_non_academic_de', 'degree_non_academic_en',
     'biography_de', 'biography_en', 'email', 'email_en',
     'external_link_de', 'external_link_en', 'portrait', 'copyright',
     'orcid', 'slug', 'oestat3_name_de', 'oestat3_name_en',
     'research_field_no_oestat', 'research_fields', 'selected_publications',
     'member_type_id', 'external', 'deceased', 'date_of_death',
     'vip_de', 'vip_en', 'use_vip', 'selectionyear', 'synced_at'],
  );
}

async function importProjects() {
  const [rows] = await my.query(`
    SELECT uid, title_de, title_en, summary_de, summary_en, url_de, url_en,
           thematic_focus_de, thematic_focus_en, funding_type_de, funding_type_en,
           starts_on, ends_on, cancelled, superior_project
    FROM tx_hebowebdb_domain_model_project
    WHERE deleted=0`);
  log(`Importing projects (${rows.length} rows)`);
  await upsert(
    'projects',
    rows.map((r) => ({
      webdb_uid: r.uid,
      title_de: nullIfEmpty(r.title_de),
      title_en: nullIfEmpty(r.title_en),
      summary_de: nullIfEmpty(r.summary_de),
      summary_en: nullIfEmpty(r.summary_en),
      url_de: nullIfEmpty(r.url_de),
      url_en: nullIfEmpty(r.url_en),
      thematic_focus_de: nullIfEmpty(r.thematic_focus_de),
      thematic_focus_en: nullIfEmpty(r.thematic_focus_en),
      funding_type_de: nullIfEmpty(r.funding_type_de),
      funding_type_en: nullIfEmpty(r.funding_type_en),
      starts_on: tsDate(r.starts_on),
      ends_on: tsDate(r.ends_on),
      cancelled: truthy(r.cancelled),
      type_text: null,
      parent_webdb_uid: r.superior_project || null,
    })),
    'webdb_uid',
    ['title_de', 'title_en', 'summary_de', 'summary_en', 'url_de', 'url_en',
     'thematic_focus_de', 'thematic_focus_en',
     'funding_type_de', 'funding_type_en', 'starts_on', 'ends_on',
     'cancelled', 'type_text', 'parent_webdb_uid', 'synced_at'],
  );

  await pgClient.query(`
    UPDATE projects c
    SET parent_id = p.id
    FROM projects p
    WHERE c.parent_webdb_uid = p.webdb_uid AND c.parent_id IS DISTINCT FROM p.id`);
  log('  project parent FKs resolved');
}

async function importLectures() {
  const lectureTypeMap = await fkMap('lecture_types');
  const [rows] = await my.query(`
    SELECT uid, original_title, lecture_date, city, event_name, event_type,
           kind, type, popular_science, speaker, citation, url
    FROM tx_hebowebdb_domain_model_lecture
    WHERE deleted=0`);
  log(`Importing lectures (${rows.length} rows)`);
  await upsert(
    'lectures',
    rows.map((r) => ({
      webdb_uid: r.uid,
      original_title: r.original_title || '',
      lecture_date: tsDate(r.lecture_date),
      city: nullIfEmpty(r.city),
      event_name: nullIfEmpty(r.event_name),
      event_type: nullIfEmpty(r.event_type),
      kind: nullIfEmpty(r.kind),
      type_id: lectureTypeMap.get(r.type) || null,
      popular_science: truthy(r.popular_science),
      speaker: nullIfEmpty(r.speaker),
      citation: nullIfEmpty(r.citation),
      url: nullIfEmpty(r.url),
    })),
    'webdb_uid',
    ['original_title', 'lecture_date', 'city', 'event_name', 'event_type',
     'kind', 'type_id', 'popular_science', 'speaker', 'citation', 'url',
     'synced_at'],
  );
}

// ============================================================
// 3. Publications. Idempotent upsert by webdb_uid; analysis preserved.
// ============================================================

async function importPublications() {
  const pubTypeMap = await fkMap('publication_types');

  const [rows] = await my.query(`
    SELECT uid, original_title, summary_de, summary_en, doi_link, pub_date,
           ris, type, peer_reviewed, popular_science, open_access, lead_author,
           website_link, download_link,
           citation_apa, citation_cbe, citation_harvard, citation_mla,
           citation_vancouver, citation_de, citation_en, bibtex, endnote,
           tstamp, crdate
    FROM tx_hebowebdb_domain_model_publication
    WHERE deleted=0`);
  log(`Importing publications (${rows.length} rows)`);

  // Source-of-truth model: the WebDB dump is canonical for the columns it
  // owns. Upsert by webdb_uid; analysis fields (analysis_status, reasoning,
  // pitch_suggestion, suggested_angle, press_score, llm_model, haiku,
  // target_audience, score components) are NOT in the insertable object,
  // so ON CONFLICT DO UPDATE leaves them untouched. Pubs missing from the
  // new dump get archived=true, not deleted, so FKs and analysis history
  // remain intact.
  const transformed = rows.map((r) => {
    const doiClean = extractDoiFromRow(r);
    return {
      webdb_uid: r.uid,
      title: r.original_title || '(untitled)',
      original_title: r.original_title || null,
      summary_de: nullIfEmpty(r.summary_de),
      summary_en: nullIfEmpty(r.summary_en),
      doi: doiClean,
      doi_link: nullIfEmpty(r.doi_link),
      published_at: tsDate(r.pub_date),
      ris: nullIfEmpty(r.ris),
      publication_type_id: pubTypeMap.get(r.type) || null,
      peer_reviewed: truthy(r.peer_reviewed),
      popular_science: truthy(r.popular_science),
      open_access_status: nullIfEmpty(r.open_access),
      open_access: !!r.open_access && r.open_access.startsWith('oa_'),
      oa_type: nullIfEmpty(r.open_access),
      lead_author: nullIfEmpty(r.lead_author),
      website_link: nullIfEmpty(r.website_link),
      download_link: nullIfEmpty(r.download_link),
      citation_apa: nullIfEmpty(r.citation_apa),
      citation_cbe: nullIfEmpty(r.citation_cbe),
      citation_harvard: nullIfEmpty(r.citation_harvard),
      citation_mla: nullIfEmpty(r.citation_mla),
      citation_vancouver: nullIfEmpty(r.citation_vancouver),
      citation_de: nullIfEmpty(r.citation_de),
      citation_en: nullIfEmpty(r.citation_en),
      bibtex: nullIfEmpty(r.bibtex),
      endnote: nullIfEmpty(r.endnote),
      citation: nullIfEmpty(r.citation_de) || nullIfEmpty(r.citation_apa),
      webdb_tstamp: tsTimestamp(r.tstamp),
      webdb_crdate: tsTimestamp(r.crdate),
      archived: false,
    };
  });
  // Dedupe DOIs: HeboWebDB itself contains 286 DOIs that appear in multiple
  // rows. Our DOI unique constraint would block the second insert. Keep the
  // DOI on the lowest-uid row (stable choice) and null it on the rest. All
  // rows still import — webdb_uid is the canonical key.
  const seenDoi = new Set();
  for (const r of transformed.sort((a, b) => a.webdb_uid - b.webdb_uid)) {
    if (!r.doi) continue;
    if (seenDoi.has(r.doi)) {
      r.doi = null;
    } else {
      seenDoi.add(r.doi);
    }
  }

  // Pre-clean: TYPO3 sometimes recreates a publication with a fresh webdb_uid
  // but the same DOI (e.g. data cleanup, duplicate merge). When that happens,
  // the old local row would block the new INSERT via the DOI unique constraint.
  // Archive the orphaned local rows and null their DOI before the upsert so
  // the dump's authoritative row can take over the DOI.
  const dumpUids = transformed.map((r) => r.webdb_uid);
  const dumpDois = transformed.map((r) => r.doi).filter(Boolean);
  if (dumpDois.length > 0) {
    const preCleanResult = await pgClient.query(
      `UPDATE publications
          SET archived = true, doi = NULL, synced_at = NOW()
        WHERE archived = false
          AND webdb_uid <> ALL($1::int[])
          AND doi = ANY($2::text[])`,
      [dumpUids, dumpDois],
    );
    log(`  pre-cleaned ${preCleanResult.rowCount} stale rows whose DOIs collide with the dump`);
  }

  log(`  upserting ${transformed.length} rows (analysis fields preserved)`);
  const insertable = transformed.map((r) => ({ ...r, synced_at: new Date().toISOString() }));
  await upsert(
    'publications',
    insertable,
    'webdb_uid',
    Object.keys(insertable[0]).filter((k) => k !== 'webdb_uid'),
  );

  // Archive remaining publications absent from the new dump (TYPO3 soft-delete
  // or visibility change). archived=true preserves analysis + downstream FKs.
  const archResult = await pgClient.query(
    `UPDATE publications
        SET archived = true, synced_at = NOW()
      WHERE archived = false
        AND webdb_uid <> ALL($1::int[])`,
    [dumpUids],
  );
  log(`  archived ${archResult.rowCount} publications absent from dump`);
}

// ============================================================
// 4. Junction tables
// ============================================================

async function importJunctions() {
  const personMap = await fkMap('persons');
  const orgunitMap = await fkMap('orgunits');
  const extunitMap = await fkMap('extunits');
  const projectMap = await fkMap('projects');
  const lectureMap = await fkMap('lectures');
  const publicationMap = await fkMap('publications');
  const oestat6Map = await fkMap('oestat6_categories');
  const memberTypeMap = await fkMap('member_types');

  // person_publications
  {
    const [rows] = await my.query(`
      SELECT person, publication, highlight, mahighlight, authorship
      FROM tx_hebowebdb_domain_model_personpublication`);
    const filtered = rows
      .map((r) => ({
        person_id: personMap.get(r.person),
        publication_id: publicationMap.get(r.publication),
        highlight: truthy(r.highlight),
        mahighlight: truthy(r.mahighlight),
        authorship: r.authorship === '?' ? null : nullIfEmpty(r.authorship),
        sorting: null,
      }))
      .filter((r) => r.person_id && r.publication_id);
    log(`Importing person_publications (${filtered.length} of ${rows.length} resolvable)`);
    await pgClient.query('TRUNCATE person_publications');
    await upsert('person_publications', filtered, 'person_id, publication_id',
      ['highlight', 'mahighlight', 'authorship', 'sorting']);
  }

  // orgunit_publications
  {
    const [rows] = await my.query(`
      SELECT organizational_unit, publication, highlight
      FROM tx_hebowebdb_domain_model_orgunitpublication`);
    const filtered = rows
      .map((r) => ({
        orgunit_id: orgunitMap.get(r.organizational_unit),
        publication_id: publicationMap.get(r.publication),
        highlight: truthy(r.highlight),
        sorting: null,
      }))
      .filter((r) => r.orgunit_id && r.publication_id);
    log(`Importing orgunit_publications (${filtered.length} of ${rows.length})`);
    await pgClient.query('TRUNCATE orgunit_publications');
    await upsert('orgunit_publications', filtered, 'orgunit_id, publication_id',
      ['highlight', 'sorting']);

    // Refresh the cached publications.is_ita_subtree boolean. Same predicate
    // as the migration's initial backfill — flips the column for any pub
    // whose ITA-membership changed since the previous import.
    const itaRefresh = await pgClient.query(`
      WITH ita_pubs AS (
        SELECT DISTINCT op.publication_id AS pid
        FROM orgunit_publications op
        JOIN orgunits o ON o.id = op.orgunit_id
        WHERE o.akronym_de ILIKE 'ITA%'
      )
      UPDATE publications p
      SET is_ita_subtree = (p.id IN (SELECT pid FROM ita_pubs))
      WHERE p.is_ita_subtree IS DISTINCT FROM (p.id IN (SELECT pid FROM ita_pubs))
    `);
    log(`  refreshed is_ita_subtree on ${itaRefresh.rowCount} publications`);
  }

  // publication_projects
  {
    const [rows] = await my.query(`
      SELECT uid_local AS publication_uid, uid_foreign AS project_uid, sorting
      FROM tx_hebowebdb_publication_project_mm`);
    const filtered = rows
      .map((r) => ({
        publication_id: publicationMap.get(r.publication_uid),
        project_id: projectMap.get(r.project_uid),
        sorting: r.sorting || null,
      }))
      .filter((r) => r.publication_id && r.project_id);
    log(`Importing publication_projects (${filtered.length} of ${rows.length})`);
    await pgClient.query('TRUNCATE publication_projects');
    await upsert('publication_projects', filtered, 'publication_id, project_id', ['sorting']);
  }

  // person_oestat6
  {
    const [rows] = await my.query(`
      SELECT uid_local AS person_uid, uid_foreign AS oestat6_uid
      FROM tx_hebowebdb_person_oestat6_mm`);
    const filtered = rows
      .map((r) => ({
        person_id: personMap.get(r.person_uid),
        oestat6_id: oestat6Map.get(r.oestat6_uid),
      }))
      .filter((r) => r.person_id && r.oestat6_id);
    log(`Importing person_oestat6 (${filtered.length} of ${rows.length})`);
    await pgClient.query('TRUNCATE person_oestat6');
    await upsert('person_oestat6', filtered, 'person_id, oestat6_id', []);
  }

  // lecture_persons
  {
    const [rows] = await my.query(`
      SELECT person, lecture
      FROM tx_hebowebdb_domain_model_lectureperson`);
    const filtered = rows
      .map((r) => ({
        lecture_id: lectureMap.get(r.lecture),
        person_id: personMap.get(r.person),
        sorting: null,
      }))
      .filter((r) => r.lecture_id && r.person_id);
    log(`Importing lecture_persons (${filtered.length} of ${rows.length})`);
    await pgClient.query('TRUNCATE lecture_persons');
    await upsert('lecture_persons', filtered, 'lecture_id, person_id', ['sorting']);
  }

  // lecture_orgunits
  {
    const [rows] = await my.query(`
      SELECT uid_local AS lecture_uid, uid_foreign AS orgunit_uid
      FROM tx_hebowebdb_lecture_orgunit_mm`);
    const filtered = rows
      .map((r) => ({
        lecture_id: lectureMap.get(r.lecture_uid),
        orgunit_id: orgunitMap.get(r.orgunit_uid),
        sorting: null,
      }))
      .filter((r) => r.lecture_id && r.orgunit_id);
    log(`Importing lecture_orgunits (${filtered.length} of ${rows.length})`);
    await pgClient.query('TRUNCATE lecture_orgunits');
    await upsert('lecture_orgunits', filtered, 'lecture_id, orgunit_id', ['sorting']);
  }

  // project_lectures
  {
    const [rows] = await my.query(`
      SELECT uid_local AS project_uid, uid_foreign AS lecture_uid
      FROM tx_hebowebdb_project_lecture_mm`);
    const filtered = rows
      .map((r) => ({
        project_id: projectMap.get(r.project_uid),
        lecture_id: lectureMap.get(r.lecture_uid),
        sorting: null,
      }))
      .filter((r) => r.project_id && r.lecture_id);
    log(`Importing project_lectures (${filtered.length} of ${rows.length})`);
    await pgClient.query('TRUNCATE project_lectures');
    await upsert('project_lectures', filtered, 'project_id, lecture_id', ['sorting']);
  }

  // extunit_persons
  {
    const [rows] = await my.query(`
      SELECT person, external_unit
      FROM tx_hebowebdb_domain_model_extunitperson`);
    const filtered = rows
      .map((r) => ({
        extunit_id: extunitMap.get(r.external_unit),
        person_id: personMap.get(r.person),
        sorting: null,
      }))
      .filter((r) => r.extunit_id && r.person_id);
    log(`Importing extunit_persons (${filtered.length} of ${rows.length})`);
    await pgClient.query('TRUNCATE extunit_persons');
    await upsert('extunit_persons', filtered, 'extunit_id, person_id', ['sorting']);
  }

  // orgunit_persons
  {
    const [rows] = await my.query(`
      SELECT person, organizational_unit, role, phone, scientist
      FROM tx_hebowebdb_domain_model_orgunitperson
      WHERE deleted=0`);
    const filtered = rows
      .map((r) => ({
        orgunit_id: orgunitMap.get(r.organizational_unit),
        person_id: personMap.get(r.person),
        role: nullIfEmpty(r.role),
        phone: nullIfEmpty(r.phone),
        scientist: truthy(r.scientist),
        sorting: null,
      }))
      .filter((r) => r.orgunit_id && r.person_id);
    log(`Importing orgunit_persons (${filtered.length} of ${rows.length})`);
    await pgClient.query('TRUNCATE orgunit_persons');
    await upsert('orgunit_persons', filtered, 'orgunit_id, person_id',
      ['role', 'phone', 'scientist', 'sorting']);
  }
}

// ============================================================
// Helpers
// ============================================================

async function fkMap(table) {
  const { rows } = await pgClient.query(`SELECT id, webdb_uid FROM ${table}`);
  const m = new Map();
  for (const r of rows) m.set(r.webdb_uid, r.id);
  return m;
}

// DOI-Extraction-Helfer leben in scripts/lib/doi-extract.mjs (geteilt mit
// session-pipeline.mjs doi-backfill, damit ETL und Bestand nicht driften).

// ============================================================
// Main
// ============================================================

const t0 = Date.now();
try {
  await importLookups();
  await importOrgunits();
  await importExtunits();
  await importPersons();
  await importProjects();
  await importLectures();
  await importPublications();
  await importJunctions();
  // WebDB pflegt das skalare lead_author-Feld manuell — bei Buchkapiteln und
  // Tagungsbeiträgen ist es oft leer, obwohl die Junction person_publications
  // Autor:innen kennt. Ohne Backfill zeigt UI „Unbekannt". Idempotent.
  // Migration: 20260505000003.
  const ladr = await pgClient.query('SELECT backfill_lead_author_from_persons() AS filled');
  log(`Backfilled lead_author from person_publications: ${ladr.rows[0].filled} pubs`);
  // published_at-Backfill aus bibtex/citation/ris/endnote — WebDB pflegt
  // pub_date oft nicht, aber im bibtex steht das Erscheinungsjahr fast
  // immer. Idempotent. Migration: 20260505000004.
  const yr = await pgClient.query('SELECT backfill_published_at_from_text() AS filled');
  log(`Backfilled published_at from bibtex/citation: ${yr.rows[0].filled} pubs`);
  log('Refreshing publication_oestat6 matview…');
  await pgClient.query('REFRESH MATERIALIZED VIEW CONCURRENTLY publication_oestat6');
  log(`DONE in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
} finally {
  await my.end();
  await pgClient.end();
}
