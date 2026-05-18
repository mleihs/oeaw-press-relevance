// Public surface of the ingest boundary (ADR 0017).
//
// The WebdbAdapter is intentionally NOT re-exported here: it pulls in
// mysql2 (devDep, script-only). Import it from its own path
// (`@/lib/server/ingest/adapters/webdb`) in scripts/tests so this barrel
// stays infra-free for any future server-side consumer.

export type {
  CanonicalBatch, CanonicalLookup, CanonicalOrgunit, CanonicalExtunit,
  CanonicalPerson, CanonicalProject, CanonicalLecture, CanonicalPublication,
  CanonicalPersonPublication, CanonicalOrgunitPublication,
  CanonicalPublicationProject, CanonicalPersonOestat6,
  CanonicalLecturePerson, CanonicalLectureOrgunit, CanonicalProjectLecture,
  CanonicalExtunitPerson, CanonicalOrgunitPerson,
} from './canonical';
export {
  PUBLICATION_WEBDB_UPDATE, PUBLICATION_ANALYSIS_COLUMNS,
} from './canonical';
export type { SourceAdapter } from './source-adapter';
export { runIngest, type IngestOptions } from './loader';
export type { IngestDb } from './upsert';
