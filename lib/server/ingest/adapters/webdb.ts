// WebDB SourceAdapter (ADR 0017) — adapter #1.
//
// `fetch()` pulls the HeboWebDB MySQL dump (the EXACT SELECTs of
// scripts/webdb-import.mjs, same WHERE deleted=0 placement). `normalize()`
// delegates to the pure `normalizeWebdb` with an injected DOI extractor
// (the v2 script passes the shared scripts/lib/doi-extract.mjs — literal
// reuse, no fork, no server->scripts boundary edge; see ADR 0017).
//
// mysql2 is a devDependency: this adapter is reachable only from
// scripts/webdb-import-v2.ts and unit tests, never from the Next app graph
// (so it is never bundled), exactly like the legacy .mjs script.

import mysql from 'mysql2/promise';
import type { SourceAdapter } from '../source-adapter';
import type { CanonicalBatch } from '../canonical';
import {
  normalizeWebdb,
  type RawWebdb,
  type ExtractDoiFromRow,
} from './webdb-normalize';

export interface WebdbMysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

/** Defaults are byte-identical to scripts/webdb-import.mjs. */
export function webdbMysqlConfigFromEnv(): WebdbMysqlConfig {
  return {
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 54499),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'root',
    database: process.env.MYSQL_DATABASE || 'webdb',
  };
}

export class WebdbAdapter implements SourceAdapter<RawWebdb> {
  readonly name = 'webdb';
  private readonly mysqlConfig: WebdbMysqlConfig;
  private readonly extractDoiFromRow: ExtractDoiFromRow;

  constructor(opts: {
    extractDoiFromRow: ExtractDoiFromRow;
    mysqlConfig?: WebdbMysqlConfig;
  }) {
    this.extractDoiFromRow = opts.extractDoiFromRow;
    this.mysqlConfig = opts.mysqlConfig ?? webdbMysqlConfigFromEnv();
  }

  async fetch(): Promise<RawWebdb> {
    const my = await mysql.createConnection({
      ...this.mysqlConfig,
      charset: 'utf8mb4',
    });
    try {
      const q = async <T>(sql: string): Promise<T[]> => {
        const [rows] = await my.query(sql);
        return rows as T[];
      };
      const lk = (t: string) =>
        q<RawWebdb['publicationTypes'][number]>(
          `SELECT uid, name_de, name_en FROM ${t} WHERE deleted=0`,
        );

      return {
        publicationTypes: await lk(
          'tx_hebowebdb_domain_model_publicationtype'),
        lectureTypes: await lk('tx_hebowebdb_domain_model_lecturetype'),
        orgunitTypes: await lk('tx_hebowebdb_domain_model_orgunittype'),
        memberTypes: await lk('tx_hebowebdb_domain_model_membertype'),
        oestat6Categories: await lk('tx_hebowebdb_domain_model_oestat6'),

        orgunits: await q<RawWebdb['orgunits'][number]>(`
          SELECT uid, name_de, name_en, akronym_de, akronym_en,
                 url_de, url_en, type, superior_organizational_unit
          FROM tx_hebowebdb_domain_model_orgunit WHERE deleted=0`),
        extunits: await q<RawWebdb['extunits'][number]>(`
          SELECT uid, name_de, name_en, logo
          FROM tx_hebowebdb_domain_model_extunit WHERE deleted=0`),
        persons: await q<RawWebdb['persons'][number]>(`
          SELECT uid, firstname, lastname, degree_before, degree_after,
                 degree_non_academic_de, degree_non_academic_en,
                 biography_de, biography_en, email, email_en,
                 external_link_de, external_link_en, portrait, copyright,
                 orcid, slug, oestat3_name_de, oestat3_name_en,
                 research_field_no_oestat, research_fields,
                 selected_publications, member_type, external, deceased,
                 date_of_death, vip_de, vip_en, use_vip, selectionyear
          FROM tx_hebowebdb_domain_model_person WHERE deleted=0`),
        projects: await q<RawWebdb['projects'][number]>(`
          SELECT uid, title_de, title_en, summary_de, summary_en,
                 url_de, url_en, thematic_focus_de, thematic_focus_en,
                 funding_type_de, funding_type_en, starts_on, ends_on,
                 cancelled, superior_project
          FROM tx_hebowebdb_domain_model_project WHERE deleted=0`),
        lectures: await q<RawWebdb['lectures'][number]>(`
          SELECT uid, original_title, lecture_date, city, event_name,
                 event_type, kind, type, popular_science, speaker,
                 citation, url
          FROM tx_hebowebdb_domain_model_lecture WHERE deleted=0`),
        publications: await q<RawWebdb['publications'][number]>(`
          SELECT uid, original_title, summary_de, summary_en, doi_link,
                 pub_date, ris, type, peer_reviewed, popular_science,
                 open_access, lead_author, website_link, download_link,
                 citation_apa, citation_cbe, citation_harvard,
                 citation_mla, citation_vancouver, citation_de,
                 citation_en, bibtex, endnote, tstamp, crdate
          FROM tx_hebowebdb_domain_model_publication WHERE deleted=0`),

        personPublications: await q<RawWebdb['personPublications'][number]>(`
          SELECT person, publication, highlight, mahighlight, authorship
          FROM tx_hebowebdb_domain_model_personpublication`),
        orgunitPublications: await q<RawWebdb['orgunitPublications'][number]>(`
          SELECT organizational_unit, publication, highlight
          FROM tx_hebowebdb_domain_model_orgunitpublication`),
        publicationProjects: await q<RawWebdb['publicationProjects'][number]>(`
          SELECT uid_local AS publication_uid, uid_foreign AS project_uid,
                 sorting
          FROM tx_hebowebdb_publication_project_mm`),
        personOestat6: await q<RawWebdb['personOestat6'][number]>(`
          SELECT uid_local AS person_uid, uid_foreign AS oestat6_uid
          FROM tx_hebowebdb_person_oestat6_mm`),
        lecturePersons: await q<RawWebdb['lecturePersons'][number]>(`
          SELECT person, lecture
          FROM tx_hebowebdb_domain_model_lectureperson`),
        lectureOrgunits: await q<RawWebdb['lectureOrgunits'][number]>(`
          SELECT uid_local AS lecture_uid, uid_foreign AS orgunit_uid
          FROM tx_hebowebdb_lecture_orgunit_mm`),
        projectLectures: await q<RawWebdb['projectLectures'][number]>(`
          SELECT uid_local AS project_uid, uid_foreign AS lecture_uid
          FROM tx_hebowebdb_project_lecture_mm`),
        extunitPersons: await q<RawWebdb['extunitPersons'][number]>(`
          SELECT person, external_unit
          FROM tx_hebowebdb_domain_model_extunitperson`),
        orgunitPersons: await q<RawWebdb['orgunitPersons'][number]>(`
          SELECT person, organizational_unit, role, phone, scientist
          FROM tx_hebowebdb_domain_model_orgunitperson WHERE deleted=0`),
      };
    } finally {
      await my.end();
    }
  }

  normalize(raw: RawWebdb): CanonicalBatch {
    return normalizeWebdb(raw, this.extractDoiFromRow);
  }
}
