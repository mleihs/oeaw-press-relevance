#!/usr/bin/env tsx
/**
 * Parity gate (ADR 0017, production_db_safety) — the MANDATORY data
 * guardrail. Proves the v2 Drizzle loader is byte-equivalent to the legacy
 * scripts/webdb-import.mjs on the local canonical DB BEFORE any prod ETL.
 *
 * Read-only. Local-only (refuses non-127.0.0.1). Snapshots go to
 * data/parity/<label>.json (gitignored, run-specific).
 *
 * PROTOCOL (run with the local Supabase 54422 + the MySQL dump 54499 up):
 *
 *   1. pg_dump backup (mandated):
 *      data/backups/publications-pre-import-<ts>.sql.gz
 *   2. tsx scripts/parity-gate.ts snapshot baseline      # canonical, pre-ETL
 *   3. node scripts/webdb-import.mjs                      # LEGACY path
 *   4. tsx scripts/parity-gate.ts snapshot old
 *   5. restore the backup (psql < backup)  -> DB == baseline again
 *   6. tsx scripts/webdb-import-v2.ts                     # NEW path
 *   7. tsx scripts/parity-gate.ts snapshot new
 *   8. tsx scripts/parity-gate.ts gate baseline old new
 *
 * `gate` exits 0 ONLY IF:
 *   - diff(old, new):   row counts + WebDB/transform fingerprints +
 *                       pub breakdown identical  (transform parity)
 *   - preserved(base,new): LLM/review/enrichment fingerprint identical AND
 *                       analyzed/haiku/decided counts not reduced
 *                       (analysis-field preservation)
 * A clean exit is the only thing that clears webdb-import-v2 for prod.
 *
 * Usage:
 *   tsx scripts/parity-gate.ts snapshot <label>
 *   tsx scripts/parity-gate.ts diff <labelA> <labelB>
 *   tsx scripts/parity-gate.ts preserved <baseline> <new>
 *   tsx scripts/parity-gate.ts gate <baseline> <old> <new>
 */

import postgres from 'postgres';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_LOCAL_URL =
  'postgresql://postgres:postgres@127.0.0.1:54422/postgres';
const SNAP_DIR = 'data/parity';

function resolveLocalPgUrl(): { url: string; host: string } {
  const url = process.env.PG_DATABASE_URL || DEFAULT_LOCAL_URL;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`PG_DATABASE_URL is not a valid URL: ${url}`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `parity-gate is local-only (read-only, but local IS canonical). `
      + `Refusing host "${host}".`,
    );
  }
  return { url, host };
}

const ROW_COUNT_TABLES = [
  'publication_types', 'lecture_types', 'orgunit_types', 'member_types',
  'oestat6_categories', 'orgunits', 'extunits', 'persons', 'projects',
  'lectures', 'publications', 'person_oestat6', 'lecture_persons',
  'lecture_orgunits', 'publication_projects', 'project_lectures',
  'extunit_persons', 'orgunit_publications', 'person_publications',
  'orgunit_persons',
];

// publications: WebDB-owned + recomputed columns (lead_author /
// published_at / is_ita_subtree are WebDB-derived post-steps -> compared
// old-vs-new). synced_at excluded (run timestamp). publication_type_id is
// resolved to its STABLE webdb_uid via join (random uuids for genuinely-new
// type rows must not false-positive).
const PUB_WEBDB_COLS = [
  'p.title', 'p.original_title', 'p.summary_de', 'p.summary_en', 'p.doi',
  'p.doi_link', 'p.published_at', 'p.ris', 'pt.webdb_uid', 'p.peer_reviewed',
  'p.popular_science', 'p.open_access_status', 'p.open_access', 'p.oa_type',
  'p.lead_author', 'p.website_link', 'p.download_link', 'p.citation_apa',
  'p.citation_de', 'p.citation_en', 'p.bibtex',
  'p.endnote', 'p.citation', 'p.webdb_tstamp', 'p.webdb_crdate',
  'p.archived', 'p.is_ita_subtree',
];

// publications: LLM / review / enrichment state. MUST be byte-identical
// between baseline and a post-v2 DB (the loader must never touch these).
const PUB_PRESERVED_COLS = [
  'p.abstract', 'p.enrichment_status', 'p.enriched_abstract',
  'p.enriched_keywords', 'p.enriched_journal', 'p.enriched_source',
  'p.full_text_snippet', 'p.word_count', 'p.analysis_status',
  'p.press_score', 'p.public_accessibility', 'p.societal_relevance',
  'p.novelty_factor', 'p.storytelling_potential', 'p.media_timeliness',
  'p.pitch_suggestion', 'p.target_audience', 'p.suggested_angle',
  'p.reasoning', 'p.llm_model', 'p.analysis_cost', 'p.import_batch',
  'p.csv_uid', 'p.haiku', 'p.meistertask_task_id',
  'p.meistertask_task_token', 'p.decision', 'p.decided_at', 'p.decided_by',
  'p.decision_rationale', 'p.snooze_until', 'p.flag_notes',
  'p.decided_in_session', 'p.press_similarity', 'p.created_at',
];

const ENTITY_FP = {
  orgunits:
    `SELECT md5(string_agg(t, E'\\n' ORDER BY t)) AS h FROM (
       SELECT concat_ws('|', o.webdb_uid, coalesce(o.name_de,'~'),
         coalesce(o.name_en,'~'), coalesce(o.akronym_de,'~'),
         coalesce(o.akronym_en,'~'), coalesce(o.url_de,'~'),
         coalesce(o.url_en,'~'), coalesce(ot.webdb_uid::text,'~'),
         coalesce(o.parent_webdb_uid::text,'~')) AS t
       FROM orgunits o LEFT JOIN orgunit_types ot ON ot.id = o.type_id) s`,
  persons:
    `SELECT md5(string_agg(t, E'\\n' ORDER BY t)) AS h FROM (
       SELECT concat_ws('|', pe.webdb_uid, coalesce(pe.firstname,'~'),
         coalesce(pe.lastname,'~'), coalesce(pe.orcid,'~'),
         coalesce(pe.slug,'~'), coalesce(mt.webdb_uid::text,'~'),
         pe.external, pe.deceased, coalesce(pe.date_of_death::text,'~'),
         pe.use_vip, coalesce(pe.selectionyear::text,'~')) AS t
       FROM persons pe LEFT JOIN member_types mt
         ON mt.id = pe.member_type_id) s`,
  projects:
    `SELECT md5(string_agg(t, E'\\n' ORDER BY t)) AS h FROM (
       SELECT concat_ws('|', pr.webdb_uid, coalesce(pr.title_de,'~'),
         coalesce(pr.title_en,'~'), coalesce(pr.starts_on::text,'~'),
         coalesce(pr.ends_on::text,'~'), pr.cancelled,
         coalesce(pr.parent_webdb_uid::text,'~')) AS t
       FROM projects pr) s`,
  lectures:
    `SELECT md5(string_agg(t, E'\\n' ORDER BY t)) AS h FROM (
       SELECT concat_ws('|', l.webdb_uid, coalesce(l.original_title,'~'),
         coalesce(l.lecture_date::text,'~'), coalesce(l.city,'~'),
         coalesce(lt.webdb_uid::text,'~'), l.popular_science) AS t
       FROM lectures l LEFT JOIN lecture_types lt ON lt.id = l.type_id) s`,
  extunits:
    `SELECT md5(string_agg(t, E'\\n' ORDER BY t)) AS h FROM (
       SELECT concat_ws('|', e.webdb_uid, coalesce(e.name_de,'~'),
         coalesce(e.name_en,'~'), coalesce(e.logo,'~')) AS t
       FROM extunits e) s`,
  // person_publications via stable webdb_uid joins (the highest-signal
  // junction: highlight/mahighlight/authorship). Other junctions are
  // count-checked (rowCounts) — uuid-keyed content checks would
  // false-positive on genuinely-new entities.
  personPublications:
    `SELECT md5(string_agg(t, E'\\n' ORDER BY t)) AS h FROM (
       SELECT concat_ws('|', pe.webdb_uid, pu.webdb_uid, pp.highlight,
         pp.mahighlight, coalesce(pp.authorship,'~')) AS t
       FROM person_publications pp
       JOIN persons pe ON pe.id = pp.person_id
       JOIN publications pu ON pu.id = pp.publication_id) s`,
} as const;

function pubFingerprintSql(cols: string[]): string {
  const list = cols.map((c) => `coalesce(${c}::text,'~')`).join(", ");
  return `SELECT md5(string_agg(t, E'\\n'
            ORDER BY p.webdb_uid NULLS LAST, p.id)) AS h
          FROM (
            SELECT p.webdb_uid, p.id,
              concat_ws('|', coalesce(p.webdb_uid::text,'~'), ${list}) AS t
            FROM publications p
            LEFT JOIN publication_types pt
              ON pt.id = p.publication_type_id
          ) p`;
}

interface Snapshot {
  label: string;
  takenAt: string;
  pgHost: string;
  rowCounts: Record<string, number>;
  pubBreakdown: {
    total: number; archived: number; analyzed: number;
    scored: number; haiku: number; decided: number;
  };
  fingerprints: Record<string, string>;
}

async function buildSnapshot(
  sql: postgres.Sql, label: string, host: string,
): Promise<Snapshot> {
  const rowCounts: Record<string, number> = {};
  for (const t of ROW_COUNT_TABLES) {
    const r = await sql.unsafe(`SELECT count(*)::int AS n FROM ${t}`);
    rowCounts[t] = r[0].n;
  }
  const [bd] = await sql.unsafe(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE archived)::int AS archived,
      count(*) FILTER (WHERE analysis_status='analyzed')::int AS analyzed,
      count(*) FILTER (WHERE press_score IS NOT NULL)::int AS scored,
      count(*) FILTER (WHERE haiku IS NOT NULL)::int AS haiku,
      count(*) FILTER (WHERE decision<>'undecided')::int AS decided
    FROM publications`);

  const fingerprints: Record<string, string> = {};
  fingerprints.publicationsWebdb =
    (await sql.unsafe(pubFingerprintSql(PUB_WEBDB_COLS)))[0].h ?? 'empty';
  fingerprints.publicationsPreserved =
    (await sql.unsafe(pubFingerprintSql(PUB_PRESERVED_COLS)))[0].h ?? 'empty';
  for (const [k, q] of Object.entries(ENTITY_FP)) {
    fingerprints[k] = (await sql.unsafe(q))[0].h ?? 'empty';
  }

  return {
    label,
    takenAt: new Date().toISOString(),
    pgHost: host,
    rowCounts,
    pubBreakdown: {
      total: bd.total, archived: bd.archived, analyzed: bd.analyzed,
      scored: bd.scored, haiku: bd.haiku, decided: bd.decided,
    },
    fingerprints,
  };
}

function snapPath(label: string) {
  return `${SNAP_DIR}/${label}.json`;
}
function loadSnapshot(label: string): Snapshot {
  return JSON.parse(readFileSync(snapPath(label), 'utf-8')) as Snapshot;
}

function reportDiff(a: Snapshot, b: Snapshot): string[] {
  const issues: string[] = [];
  for (const t of ROW_COUNT_TABLES) {
    if (a.rowCounts[t] !== b.rowCounts[t]) {
      issues.push(
        `rowCount[${t}]: ${a.label}=${a.rowCounts[t]} `
        + `${b.label}=${b.rowCounts[t]}`,
      );
    }
  }
  for (const k of Object.keys(a.pubBreakdown) as (keyof Snapshot['pubBreakdown'])[]) {
    if (a.pubBreakdown[k] !== b.pubBreakdown[k]) {
      issues.push(
        `pubBreakdown.${k}: ${a.label}=${a.pubBreakdown[k]} `
        + `${b.label}=${b.pubBreakdown[k]}`,
      );
    }
  }
  // Transform-parity fingerprints (preserved fp handled by `preserved`).
  for (const k of Object.keys(a.fingerprints)) {
    if (k === 'publicationsPreserved') continue;
    if (a.fingerprints[k] !== b.fingerprints[k]) {
      issues.push(`fingerprint[${k}] differs (${a.label} vs ${b.label})`);
    }
  }
  return issues;
}

function reportPreserved(base: Snapshot, fresh: Snapshot): string[] {
  const issues: string[] = [];
  if (
    base.fingerprints.publicationsPreserved
    !== fresh.fingerprints.publicationsPreserved
  ) {
    issues.push(
      'ANALYSIS PRESERVATION VIOLATED: publicationsPreserved fingerprint '
      + `changed (${base.label} -> ${fresh.label}). The v2 loader mutated `
      + 'an LLM/review/enrichment column.',
    );
  }
  for (const k of ['analyzed', 'scored', 'haiku', 'decided'] as const) {
    if (fresh.pubBreakdown[k] < base.pubBreakdown[k]) {
      issues.push(
        `analysis loss: ${k} dropped ${base.pubBreakdown[k]} -> `
        + `${fresh.pubBreakdown[k]}`,
      );
    }
  }
  return issues;
}

async function main() {
  const [cmd, ...labels] = process.argv.slice(2);
  if (!cmd) throw new Error('usage: snapshot|diff|preserved|gate ...');

  if (cmd === 'snapshot') {
    const label = labels[0];
    if (!label) throw new Error('usage: snapshot <label>');
    const { url, host } = resolveLocalPgUrl();
    const sql = postgres(url, { max: 1, prepare: false });
    try {
      const snap = await buildSnapshot(sql, label, host);
      mkdirSync(SNAP_DIR, { recursive: true });
      writeFileSync(snapPath(label), JSON.stringify(snap, null, 2));
      console.log(
        `[parity-gate] snapshot "${label}" -> ${snapPath(label)}\n`
        + `  publications=${snap.pubBreakdown.total} `
        + `archived=${snap.pubBreakdown.archived} `
        + `analyzed=${snap.pubBreakdown.analyzed} `
        + `haiku=${snap.pubBreakdown.haiku}`,
      );
    } finally {
      await sql.end();
    }
    return;
  }

  if (cmd === 'diff') {
    const [a, b] = labels;
    if (!a || !b) throw new Error('usage: diff <labelA> <labelB>');
    const issues = reportDiff(loadSnapshot(a), loadSnapshot(b));
    if (issues.length) {
      console.error(`[parity-gate] DIFF FAILED (${a} vs ${b}):`);
      for (const i of issues) console.error('  - ' + i);
      process.exit(1);
    }
    console.log(`[parity-gate] diff ${a} vs ${b}: IDENTICAL (transform parity)`);
    return;
  }

  if (cmd === 'preserved') {
    const [base, fresh] = labels;
    if (!base || !fresh) throw new Error('usage: preserved <baseline> <new>');
    const issues = reportPreserved(loadSnapshot(base), loadSnapshot(fresh));
    if (issues.length) {
      console.error(`[parity-gate] PRESERVATION FAILED (${base} -> ${fresh}):`);
      for (const i of issues) console.error('  - ' + i);
      process.exit(1);
    }
    console.log(
      `[parity-gate] preserved ${base} -> ${fresh}: analysis intact`,
    );
    return;
  }

  if (cmd === 'gate') {
    const [base, old, fresh] = labels;
    if (!base || !old || !fresh) {
      throw new Error('usage: gate <baseline> <old> <new>');
    }
    const sBase = loadSnapshot(base);
    const sOld = loadSnapshot(old);
    const sNew = loadSnapshot(fresh);
    const issues = [
      ...reportDiff(sOld, sNew),
      ...reportPreserved(sBase, sNew),
    ];
    if (issues.length) {
      console.error('[parity-gate] GATE FAILED — v2 is NOT cleared for prod:');
      for (const i of issues) console.error('  - ' + i);
      process.exit(1);
    }
    console.log(
      '[parity-gate] GATE PASSED: webdb-import-v2 is byte-equivalent to the '
      + 'legacy .mjs and preserved all analysis state. Cleared for prod ETL.',
    );
    return;
  }

  throw new Error(`unknown command: ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
