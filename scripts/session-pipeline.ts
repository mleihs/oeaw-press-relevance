#!/usr/bin/env tsx
// Session-based enrichment + scoring pipeline (Publikationen).
//
// Sub-commands:
//   status              Read-only DB summary (enrichment + analysis counts).
//   enrich-free         WebDB-native enrichment (summary_de/en → enriched_abstract).
//                       DRY-RUN by default. Pass --apply to actually UPDATE.
//   doi-backfill        DOIs aus bibtex/citation in die doi-Spalte rückführen.
//   candidates [N]      Emit a JSON batch of N pending pubs to stdout, formatted
//                       for the in-session scoring model. Status logs go to stderr.
//   apply <file|->      Read evaluation JSON (file path or "-" for stdin),
//                       validate, optionally UPDATE. DRY-RUN by default.
//
// Ziel-DB: --target=local (Default) | --target=prod. Prod läuft über
// scripts/lib/db.mjs → connectDb, das die Zugangsdaten liest, den SSH-Tunnel
// (PROD_DB_TUNNEL=1) kennt und das self-signed Pooler-Zertifikat
// verbindungsgebunden akzeptiert. Es braucht deshalb WEDER ein manuelles
// `export PG_DATABASE_URL` NOCH ein Umschreiben von sslmode.
//
// PG_DATABASE_URL bleibt als Override erhalten (repo-weiter Skript-Vertrag,
// vgl. webdb-import.mjs, parity-gate.ts): ohne --target-Flag gewinnt die
// Variable. Ein explizites --target schlägt sie bewusst, damit ein in der Shell
// hängengebliebenes PG_DATABASE_URL einen Prod-Lauf nicht still umlenkt.
//
// Default model tag written to publications.llm_model when scored via this
// path: siehe lib/shared/session-model.json. Cost = 0 (no external API call).
//
// Aufruf: npx tsx scripts/session-pipeline.ts <command> [options]
//         npm run session-pipeline -- <command> [options]

import pg from 'pg';
import { readFileSync } from 'node:fs';
import {
  extractDoiFromRow,
  DOI_CANDIDATE_WHERE_CLAUSE,
} from '@/lib/shared/doi-extract.mjs';
import { connectDb, confirmProd, loadDbUrl, parseScriptArgs } from './lib/db.mjs';
import { checkHaikus } from './lib/haiku-syllables.mjs';
import { initScriptSentry, captureScriptError, flushAndExit } from './lib/sentry.mjs';
import { SCORE_DIMENSIONS, type ScoreDimension } from '@/lib/shared/constants';
import { computeStoredPressScore } from '@/lib/shared/scoring';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';
// Single source of truth: lib/shared/score-weights.json. Both this script and
// lib/shared/constants.ts import it, so drift is impossible by construction.
import SCORE_WEIGHTS from '@/lib/shared/score-weights.json';
// Same single-source-of-truth pattern for the session model tag — shared
// verbatim with lib/server/analysis/score.ts so the writer tag (.tag) and the
// generation-agnostic stats detector (.likePattern) can never drift.
import SESSION_MODEL from '@/lib/shared/session-model.json';

// Tag WRITTEN to publications.llm_model for scores produced by the current
// Claude Code session model. Historical session scores carry the 4.7 tag —
// SESSION_MODEL_LIKE is the generation-agnostic detector used for stats.
const SESSION_MODEL_TAG = SESSION_MODEL.tag;
const SESSION_MODEL_LIKE = SESSION_MODEL.likePattern;
const WEBDB_SOURCE_TAG = 'webdb_summary';

// ITA-Subtree-Exclusion: Pubs die zu ITA oder einer Sub-Unit gehören werden
// per Default aus Scoring + Enrichment ausgeschlossen. ITA-Scores kommen aus
// der Prod-DB (siehe HANDOVER). --include-ita überschreibt das.
const ITA_EXCLUDE_CLAUSE = `NOT EXISTS (
  SELECT 1 FROM orgunit_publications op
  WHERE op.publication_id = p.id
    AND op.orgunit_id IN (
      WITH RECURSIVE ita_tree AS (
        SELECT id FROM orgunits WHERE akronym_de = 'ITA'
        UNION ALL
        SELECT o.id FROM orgunits o JOIN ita_tree it ON o.parent_id = it.id
      )
      SELECT id FROM ita_tree
    )
)`;

const TEXT_EVAL_FIELDS = [
  'pitch_suggestion',
  'target_audience',
  'suggested_angle',
  'reasoning',
] as const;
// `haiku` steht bewusst in der Pflichtliste: es war bis 2026-09-03 optional, und
// genau deshalb fehlte es im gesamten 49er-Batch dieses Tages. Die Form pruefen
// dann die Gates unten (Struktur + 5-7-5).
const REQUIRED_EVAL_FIELDS: string[] = ['id', ...SCORE_DIMENSIONS, ...TEXT_EVAL_FIELDS, 'haiku'];

const log = (msg: string) => process.stderr.write(msg + '\n');
const out = (msg: string) => process.stdout.write(msg + '\n');

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

type FlagValue = string | boolean;
type Flags = Record<string, FlagValue>;
type Target = 'local' | 'prod';

/** Sub-command flags. Accepts both `--key value` and `--key=value`; a flag
 *  without a value is `true`. The shared parseScriptArgs() only knows the
 *  `--target=prod` form and cannot carry values like `--imported-after DATE`,
 *  so the richer parser stays — it reads the same argv. */
function parseArgs(argv: string[]): { args: Flags; positional: string[] } {
  const args: Flags = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) {
        args[a.slice(2, eq)] = a.slice(eq + 1);
        continue;
      }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { args, positional };
}

function bool(args: Flags, key: string): boolean {
  return args[key] === true || args[key] === 'true';
}

function str(args: Flags, key: string): string | null {
  const v = args[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// ---------------------------------------------------------------------------
// DB-Anbindung
// ---------------------------------------------------------------------------

let dbTarget: Target = 'local';
let dbOverrideUrl: string | null = null;
let rawFlags: string[] = [];

function isLocalUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

/** True wenn der Lauf gegen eine nicht-lokale DB geht — steuert confirmProd.
 *  Ein PG_DATABASE_URL-Override auf einen fremden Host zählt mit, sonst
 *  schriebe der Override-Pfad ungefragt auf Prod. */
function isProdRun(): boolean {
  if (dbOverrideUrl) return !isLocalUrl(dbOverrideUrl);
  return dbTarget === 'prod';
}

function describeTarget(): string {
  if (dbOverrideUrl) {
    return `PG_DATABASE_URL (${isLocalUrl(dbOverrideUrl) ? 'lokal' : 'REMOTE'})`;
  }
  return dbTarget;
}

async function openClient(): Promise<pg.Client> {
  if (dbOverrideUrl) {
    const client = new pg.Client({ connectionString: dbOverrideUrl });
    await client.connect();
    return client;
  }
  return connectDb({ target: dbTarget });
}

async function withClient<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = await openClient();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Sub-commands
// ---------------------------------------------------------------------------

async function cmdStatus(): Promise<void> {
  await withClient(async (c) => {
    const r1 = await c.query<{ enrichment_status: string; count: number }>(`
      SELECT enrichment_status, count(*)::int AS count
      FROM publications WHERE archived = false
      GROUP BY enrichment_status ORDER BY count DESC
    `);
    const r2 = await c.query<{ analysis_status: string; count: number }>(`
      SELECT analysis_status, count(*)::int AS count
      FROM publications WHERE archived = false
      GROUP BY analysis_status ORDER BY count DESC
    `);
    // Pool counts berücksichtigen die ITA-Exclusion (Default-Workflow).
    const r3 = await c.query(`
      SELECT
        count(*) FILTER (WHERE p.summary_de IS NOT NULL)                         AS with_de,
        count(*) FILTER (WHERE p.summary_en IS NOT NULL)                         AS with_en,
        count(*) FILTER (WHERE p.press_score IS NOT NULL)                        AS with_score,
        count(*) FILTER (WHERE p.llm_model LIKE $1)                              AS by_session,
        -- WITH ITA (volle Pools)
        count(*) FILTER (WHERE p.enrichment_status IN ('enriched', 'partial') AND p.analysis_status = 'pending') AS pool_a_all,
        count(*) FILTER (WHERE p.enrichment_status = 'pending')                                                  AS pool_b_all,
        count(*) FILTER (WHERE p.enrichment_status = 'pending' AND p.doi IS NOT NULL)                            AS pool_b_doi_all,
        -- WITHOUT ITA (Default-Scope für Scoring)
        count(*) FILTER (WHERE p.enrichment_status IN ('enriched', 'partial') AND p.analysis_status = 'pending' AND ${ITA_EXCLUDE_CLAUSE}) AS pool_a_no_ita,
        count(*) FILTER (WHERE p.enrichment_status = 'pending' AND ${ITA_EXCLUDE_CLAUSE})                                                  AS pool_b_no_ita,
        count(*) FILTER (WHERE p.enrichment_status = 'pending' AND p.doi IS NOT NULL AND ${ITA_EXCLUDE_CLAUSE})                            AS pool_b_doi_no_ita
      FROM publications p WHERE p.archived = false
    `, [SESSION_MODEL_LIKE]);

    log(`=== Ziel-DB: ${describeTarget()} ===`);
    log('=== Enrichment status ===');
    for (const row of r1.rows) log(`  ${String(row.enrichment_status).padEnd(10)} ${row.count}`);
    log('=== Analysis status ===');
    for (const row of r2.rows) log(`  ${String(row.analysis_status).padEnd(10)} ${row.count}`);
    log('=== WebDB / scoring summary ===');
    log(`  Pubs mit summary_de:                       ${r3.rows[0].with_de}`);
    log(`  Pubs mit summary_en:                       ${r3.rows[0].with_en}`);
    log(`  Pubs mit press_score:                      ${r3.rows[0].with_score}`);
    log(`  Davon via Session-Modell:                  ${r3.rows[0].by_session}`);

    const poolAall = parseInt(r3.rows[0].pool_a_all, 10);
    const poolBall = parseInt(r3.rows[0].pool_b_all, 10);
    const poolBdoi = parseInt(r3.rows[0].pool_b_doi_all, 10);
    const poolAnoIta = parseInt(r3.rows[0].pool_a_no_ita, 10);
    const poolBnoIta = parseInt(r3.rows[0].pool_b_no_ita, 10);
    const poolBdoiNoIta = parseInt(r3.rows[0].pool_b_doi_no_ita, 10);
    const itaInPoolA = poolAall - poolAnoIta;

    log('=== Workflow-Pools (Default-Scope: OHNE ITA) ===');
    log(`  Pool A (scoring-ready, ohne ITA):     ${poolAnoIta}    [mit ITA: ${poolAall}, ITA-Anteil: ${itaInPoolA}]`);
    log(`  Pool B (enrichment-pending, ohne ITA): ${poolBnoIta}    [mit ITA: ${poolBall}]`);
    log(`     ↳ davon mit DOI (API-Chance):       ${poolBdoiNoIta}    [mit ITA: ${poolBdoi}]`);
    log(`  ITA-Subtree wird per Default ausgeschlossen — Scores kommen aus Prod-Sync.`);

    if (poolAnoIta > 0) {
      log('=== Session-Kapazitätsprognose (Pool A no ITA → Scoring) ===');
      log(`  Bei 50 Pubs/Session:  ~${Math.ceil(poolAnoIta / 50)} Sessions`);
      log(`  Bei 100 Pubs/Session: ~${Math.ceil(poolAnoIta / 100)} Sessions`);
    }
    if (poolBnoIta > 0) {
      // Kein CLI-Anstoß mehr: Enrichment läuft seit 7630070 automatisch beim
      // Import (Nacht-Ingest 06:30; manuell: docs/INCHAT_SCORING.md Schritt 0.5).
      log('=== Pool B (enrichment-pending) ===');
      log(`  Anreicherung läuft automatisch beim Import (Nacht-Ingest).`);
      log(`  Manuell anstoßen: docs/INCHAT_SCORING.md, Schritt 0.5.`);
    }

    log(`  Session-Modell-Tag: ${SESSION_MODEL_TAG}`);
  });
}

async function cmdEnrichFree(args: Flags): Promise<void> {
  const apply = bool(args, 'apply');
  if (apply) {
    await confirmProd({ isProd: isProdRun(), flags: rawFlags, label: 'session-pipeline enrich-free' });
  }
  await withClient(async (c) => {
    const cnt = await c.query<{ n: number }>(`
      SELECT count(*)::int AS n FROM publications
      WHERE archived = false
        AND enrichment_status = 'pending'
        AND (summary_de IS NOT NULL OR summary_en IS NOT NULL)
    `);
    const n = cnt.rows[0].n;
    log(`Free WebDB-Enrichment: ${n} Publikationen kandidieren (pending + summary_de/en).`);
    if (n === 0) return;
    if (!apply) {
      log('[DRY-RUN] keine UPDATEs ausgeführt. Mit --apply tatsächlich schreiben.');
      return;
    }
    const r = await c.query(`
      UPDATE publications SET
        enrichment_status = 'enriched',
        enriched_abstract = COALESCE(enriched_abstract, summary_de, summary_en),
        enriched_source = CASE
          WHEN enriched_source IS NULL OR enriched_source = '' THEN $1
          WHEN position($1 in enriched_source) > 0 THEN enriched_source
          ELSE $1 || '+' || enriched_source
        END,
        word_count = CASE
          WHEN word_count > 0 THEN word_count
          ELSE COALESCE(
            ARRAY_LENGTH(STRING_TO_ARRAY(TRIM(COALESCE(summary_de, summary_en, '')), ' '), 1),
            0
          )
        END,
        updated_at = NOW()
      WHERE archived = false
        AND enrichment_status = 'pending'
        AND (summary_de IS NOT NULL OR summary_en IS NOT NULL)
    `, [WEBDB_SOURCE_TAG]);
    log(`Updated ${r.rowCount} Publikationen → enrichment_status='enriched'.`);
  });
}

interface CandidateRow {
  id: string;
  webdb_uid: string | null;
  title: string | null;
  original_title: string | null;
  lead_author: string | null;
  published_at: string | null;
  peer_reviewed: boolean | null;
  popular_science: boolean | null;
  summary_de: string | null;
  summary_en: string | null;
  enriched_abstract: string | null;
  abstract: string | null;
  enriched_keywords: unknown;
  is_mahighlight: boolean;
  institute_akronyms: string[] | null;
}

async function cmdCandidates(args: Flags, positional: string[]): Promise<void> {
  const limit = parseInt(str(args, 'limit') ?? positional[0] ?? '10', 10);
  if (!Number.isFinite(limit) || limit <= 0 || limit > 200) {
    log('limit muss zwischen 1 und 200 liegen.');
    process.exit(1);
  }
  const onlySummaryDe = bool(args, 'only-summary-de');
  const requireMahighlight = bool(args, 'mahighlight');
  const requirePopSci = bool(args, 'popular-science');
  const includeIta = bool(args, 'include-ita');
  const apiEnriched = bool(args, 'api-enriched');
  const fromDate = str(args, 'from');
  const toDate = str(args, 'to');
  const importedAfter = str(args, 'imported-after');
  const includeAll = bool(args, 'all');

  // Basis-Prädikat („bewertbar") lebt in der kanonischen View
  // publication_scoring_candidates (eine Wahrheit, geteilt mit dem Server-
  // Batch-Pfad lib/server/analysis/batch.ts und der Status-Kachel). Default
  // (ohne ITA) selektiert direkt aus der View. Der includeIta-Override ist ein
  // seltener Debug-Escape-Hatch — die View schließt ITA fest aus, also wird das
  // Prädikat dort inline nachgebaut (ohne ITA-Klausel), semantisch identisch.
  const MIN_CONTENT_LEN = 120; // Mindestlänge in Zeichen für „bewertbar".
  const baseRelation = includeIta ? 'publications p' : 'publication_scoring_candidates p';
  const conditions: string[] = [];
  if (includeIta) {
    conditions.push(
      'p.archived = false',
      "p.analysis_status IN ('pending', 'failed')",
      'p.press_score IS NULL',
      "p.enrichment_status IN ('enriched', 'partial', 'failed')",
      `GREATEST(
        length(COALESCE(p.summary_de,'')),
        length(COALESCE(p.summary_en,'')),
        length(COALESCE(p.enriched_abstract,'')),
        length(COALESCE(p.abstract,''))
      ) >= ${MIN_CONTENT_LEN}`,
    );
  }
  const params: unknown[] = [];
  if (onlySummaryDe) {
    conditions.push('p.summary_de IS NOT NULL');
  }
  if (requirePopSci) {
    conditions.push('p.popular_science = true');
  }
  if (fromDate) {
    params.push(fromDate);
    conditions.push(`p.published_at >= $${params.length}`);
  }
  if (toDate) {
    params.push(toDate);
    conditions.push(`p.published_at <= $${params.length}`);
  }

  // Zeitfenster. Default = SCORING_RECENT_DAYS, also dieselbe Menge, die der
  // Bewerten-Knopf im Web erfasst (lib/shared/dashboard.ts). Ohne Fenster ist
  // die Sortierung zwar „neueste zuerst", der Pool aber der gesamte Altbestand
  // — wer 25 Kandidaten zieht, landet dann irgendwo in 2023. --imported-after
  // setzt ein eigenes Datum, --all öffnet den Altbestand bewusst.
  let windowDays: number | null = SCORING_RECENT_DAYS;
  if (importedAfter) {
    windowDays = null;
    params.push(importedAfter);
    conditions.push(`p.created_at >= $${params.length}`);
  } else if (includeAll) {
    windowDays = null;
  } else {
    params.push(SCORING_RECENT_DAYS);
    conditions.push(`p.created_at >= now() - make_interval(days => $${params.length}::int)`);
  }

  if (apiEnriched) {
    // Pubs mit enriched_keywords IS NOT NULL haben den API-Cascade-Loop hinter sich
    // (CrossRef/OpenAlex haben Keywords gesetzt). Schließt enrich-free-only Pubs aus,
    // die nur summary_de in enriched_abstract gespiegelt haben.
    conditions.push('p.enriched_keywords IS NOT NULL');
  }
  if (requireMahighlight) {
    conditions.push(`EXISTS (
      SELECT 1 FROM person_publications pp
      WHERE pp.publication_id = p.id AND pp.mahighlight = true
    )`);
  }

  const scopeNote = importedAfter
    ? `created_at >= ${importedAfter}`
    : includeAll
      ? 'gesamter Altbestand (--all)'
      : `letzte ${SCORING_RECENT_DAYS} Tage (SCORING_RECENT_DAYS)`;
  log(`Ziel-DB: ${describeTarget()} · Fenster: ${scopeNote} · limit=${limit}`);

  await withClient(async (c) => {
    const sql = `
      SELECT
        p.id,
        p.webdb_uid,
        p.title,
        p.original_title,
        p.lead_author,
        p.published_at::text AS published_at,
        p.peer_reviewed,
        p.popular_science,
        p.summary_de,
        p.summary_en,
        p.enriched_abstract,
        p.abstract,
        p.enriched_keywords,
        EXISTS (
          SELECT 1 FROM person_publications pp
          WHERE pp.publication_id = p.id AND pp.mahighlight = true
        ) AS is_mahighlight,
        ARRAY(
          SELECT DISTINCT ou.akronym_de
          FROM orgunit_publications op
          JOIN orgunits ou ON ou.id = op.orgunit_id
          WHERE op.publication_id = p.id AND ou.akronym_de IS NOT NULL
        ) AS institute_akronyms
      FROM ${baseRelation}
      WHERE ${conditions.length ? conditions.join(' AND ') : 'true'}
      ORDER BY
        ${requireMahighlight ? '' : 'p.popular_science DESC,'}
        p.published_at DESC NULLS LAST,
        p.webdb_uid
      LIMIT ${limit}
    `;
    const r = await c.query<CandidateRow>(sql, params);

    const pubs = r.rows.map((row) => {
      let contentSource: string | null = null;
      let content: string | null = null;
      if (row.summary_de?.trim()) { contentSource = 'summary_de'; content = row.summary_de.trim(); }
      else if (row.summary_en?.trim()) { contentSource = 'summary_en'; content = row.summary_en.trim(); }
      else if (row.enriched_abstract?.trim()) { contentSource = 'enriched_abstract'; content = row.enriched_abstract.trim(); }
      else if (row.abstract?.trim()) { contentSource = 'abstract'; content = row.abstract.trim(); }

      if (content) {
        const words = content.split(/\s+/);
        if (words.length > 500) content = words.slice(0, 500).join(' ') + '…';
      }

      return {
        id: row.id,
        webdb_uid: row.webdb_uid,
        title: row.title,
        original_title: row.original_title && row.original_title !== row.title ? row.original_title : null,
        lead_author: row.lead_author,
        institute_akronyms: row.institute_akronyms || [],
        published_at: row.published_at,
        peer_reviewed: row.peer_reviewed,
        popular_science: row.popular_science,
        is_mahighlight: row.is_mahighlight,
        enriched_keywords: row.enriched_keywords,
        content_source: contentSource,
        content,
      };
    });

    out(JSON.stringify({
      model: SESSION_MODEL_TAG,
      target: describeTarget(),
      weights: SCORE_WEIGHTS,
      count: pubs.length,
      filters: {
        only_summary_de: onlySummaryDe,
        require_mahighlight: requireMahighlight,
        require_popular_science: requirePopSci,
        include_ita: includeIta,
        api_enriched: apiEnriched,
        from: fromDate,
        to: toDate,
        imported_after: importedAfter,
        window_days: windowDays,
        all: includeAll,
      },
      publications: pubs,
    }, null, 2));
  });
}

type Evaluation = Record<string, unknown> & { id: string };

// Sanitize textual fields: strip HTML, normalize entities that often cause JSON
// breakage, collapse whitespace. Applied to all string-valued fields.
const SANITIZED_FIELDS: string[] = [...TEXT_EVAL_FIELDS, 'haiku'];

function sanitizeText(s: unknown): unknown {
  if (typeof s !== 'string') return s;
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Em-dashes (U+2014) read as machine-generated; the project forbids them
    // in UI copy (docs/writing-style.md + the ESLint/MDX gates). A static
    // linter can't reach generated DB content, so normalize on ingest here:
    // an em-dash becomes a comma. Mirrors scripts/cleanup-emdash-prod.mjs.
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*([,.;:!?])/g, '$1')
    .trim();
}

function dimsOf(e: Evaluation): Record<ScoreDimension, number> {
  return {
    public_accessibility: e.public_accessibility as number,
    societal_relevance: e.societal_relevance as number,
    novelty_factor: e.novelty_factor as number,
    storytelling_potential: e.storytelling_potential as number,
    media_timeliness: e.media_timeliness as number,
  };
}

// ---------------------------------------------------------------------------
// Re-Pitch: NUR den Pitch-Text neu schreiben, Scores unberührt lassen.
//
// ANLASS (2026-08-28). Ein Kohortenvergleich über 7137 bewertete Publikationen
// zeigte, dass die Pitches der Kohorte `opus-4.8-session` in 0 % der Fälle das
// Institut, das Journal oder die Forschenden benennen, gegen 28 / 4 / 4 % in der
// älteren Kohorte. Nicht weniger, sondern null. Ursache war die Rubrik, die das
// Benennen nirgends verlangte und an drei Stellen dagegen zog; behoben in
// `lib/server/analysis/prompts.ts` (Punkt 6, VERANKERUNG).
//
// Die SCORES dieser Läufe sind in Ordnung, nur die Texte sind dünn. Ein voller
// Neulauf würde die Bewertungen anfassen und damit die Kalibrierung gegen den
// Bestand ohne Not bewegen. Deshalb dieser schmale Pfad: er liest dieselben
// Kandidatendaten wie `candidates`, damit die In-Chat-Arbeit identisch abläuft,
// und schreibt am Ende AUSSCHLIESSLICH `pitch_suggestion`.
//
// Bewusst NICHT mit angefasst: `reasoning` begründet den Score und darf sich
// nicht unabhängig von ihm bewegen; `target_audience` und `suggested_angle`
// sind nicht betroffen (die neue Rubrik verschiebt Verwertbarkeits-Aussagen
// sogar dorthin); `haiku` verlangt ohnehin keine Eigennamen; `llm_model` bleibt
// der Marker des Bewertungslaufs, nicht des Textlaufs.

interface RepitchRow extends CandidateRow {
  press_score: number | null;
  pitch_suggestion: string | null;
  pitch_revision: number;
  enrichment_status: string | null;
  enriched_journal: string | null;
}

async function cmdRepitchCandidates(args: Flags, positional: string[]): Promise<void> {
  const limit = Math.min(Number(positional[0] || 25) || 25, 200);
  const model = str(args, 'model');
  // Default: nur was noch nicht nachgezogen wurde. Das ist der Teil, der einen
  // Context-Clear ueberlebt -- der Pool schrumpft mit jedem geschriebenen
  // Batch, ein erneuter Aufruf liefert automatisch den Rest.
  const allRevisions = bool(args, 'all-revisions');
  const params: unknown[] = [];
  const conditions = [
    "p.analysis_status = 'analyzed'",
    'p.press_score IS NOT NULL',
    'p.archived = false',
    // Ohne Substanz kein Pitch. Dieselbe Schwelle wie `candidates` und `apply`:
    // einen Text ohne Inhaltsgrundlage neu zu schreiben wäre Fabrikation.
    `GREATEST(
      length(COALESCE(p.summary_de,'')),
      length(COALESCE(p.summary_en,'')),
      length(COALESCE(p.enriched_abstract,'')),
      length(COALESCE(p.abstract,''))
    ) >= 120`,
  ];
  if (model) {
    params.push(model);
    conditions.push(`p.llm_model = $${params.length}`);
  }
  if (!allRevisions) conditions.push('p.pitch_revision = 0');

  log(`Ziel-DB: ${describeTarget()} · Modell-Filter: ${model ?? '(alle)'} · ` +
      `${allRevisions ? 'ALLE Revisionen' : 'nur pitch_revision=0'} · limit=${limit}`);

  await withClient(async (c) => {
    const r = await c.query<RepitchRow>(`
      SELECT
        p.id, p.webdb_uid, p.title, p.original_title, p.lead_author,
        p.published_at::text AS published_at,
        p.peer_reviewed, p.popular_science,
        p.summary_de, p.summary_en, p.enriched_abstract, p.abstract,
        p.enriched_keywords,
        p.enrichment_status, p.enriched_journal,
        p.press_score, p.pitch_suggestion, p.pitch_revision,
        false AS is_mahighlight,
        ARRAY(
          SELECT DISTINCT ou.akronym_de
          FROM orgunit_publications op
          JOIN orgunits ou ON ou.id = op.orgunit_id
          WHERE op.publication_id = p.id AND ou.akronym_de IS NOT NULL
        ) AS institute_akronyms
      FROM publications p
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.published_at DESC NULLS LAST, p.webdb_uid
      LIMIT ${limit}
    `, params);

    const pubs = r.rows.map((row) => {
      let contentSource: string | null = null;
      let content: string | null = null;
      if (row.summary_de?.trim()) { contentSource = 'summary_de'; content = row.summary_de.trim(); }
      else if (row.summary_en?.trim()) { contentSource = 'summary_en'; content = row.summary_en.trim(); }
      else if (row.enriched_abstract?.trim()) { contentSource = 'enriched_abstract'; content = row.enriched_abstract.trim(); }
      else if (row.abstract?.trim()) { contentSource = 'abstract'; content = row.abstract.trim(); }
      if (content) {
        const words = content.split(/\s+/);
        if (words.length > 500) content = words.slice(0, 500).join(' ') + '…';
      }
      return {
        id: row.id,
        webdb_uid: row.webdb_uid,
        title: row.title,
        original_title: row.original_title && row.original_title !== row.title ? row.original_title : null,
        lead_author: row.lead_author,
        institute_akronyms: row.institute_akronyms || [],
        published_at: row.published_at,
        peer_reviewed: row.peer_reviewed,
        popular_science: row.popular_science,
        enriched_keywords: row.enriched_keywords,
        // Aus der Anreicherung, nicht aus dem WebDB-Satz. Das Publikationsorgan
        // verlangt die Rubrik ausdrücklich (Punkt 6, VERANKERUNG); ohne dieses
        // Feld steht es nirgends im Material und kann folglich nicht genannt
        // werden. `enrichment_status` macht sichtbar, worauf der Text fußt:
        // bei 'failed' gibt es nur den WebDB-Text, kein Journal, keine Keywords.
        enrichment_status: row.enrichment_status,
        enriched_journal: row.enriched_journal,
        content_source: contentSource,
        content,
        // Zum Vergleich mitgeliefert, NICHT als Vorlage: der alte Text ist das,
        // was ersetzt werden soll. Wer ihn umformuliert, reproduziert die Lücke.
        current_pitch: row.pitch_suggestion,
        press_score: row.press_score,
      };
    });

    out(JSON.stringify({
      mode: 'repitch',
      target: describeTarget(),
      model_filter: model,
      count: pubs.length,
      publications: pubs,
    }, null, 2));
  });
}

async function cmdApply(args: Flags, positional: string[]): Promise<void> {
  let raw: string;
  if (positional[0] && positional[0] !== '-') {
    raw = readFileSync(positional[0], 'utf8');
  } else {
    raw = readFileSync(0, 'utf8');
  }
  const data = JSON.parse(raw) as unknown;
  const evals: Evaluation[] = Array.isArray(data)
    ? (data as Evaluation[])
    : ((data as { evaluations?: Evaluation[] })?.evaluations ?? []);
  if (!Array.isArray(evals) || evals.length === 0) {
    log('Keine evaluations gefunden in Input.');
    process.exit(1);
  }

  for (const e of evals) {
    for (const key of SANITIZED_FIELDS) {
      if (key in e) e[key] = sanitizeText(e[key]);
    }
  }

  // Validate
  for (const e of evals) {
    for (const key of REQUIRED_EVAL_FIELDS) {
      if (!(key in e)) {
        log(`Evaluation für id=${e.id || '?'} fehlt Feld: ${key}`);
        process.exit(1);
      }
    }
    for (const dim of SCORE_DIMENSIONS) {
      const v = e[dim];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        log(`Evaluation für id=${e.id} hat ungültigen ${dim}=${v} (erwartet number 0..1)`);
        process.exit(1);
      }
    }
    // Reasoning style guard: forbid variable-name leaks
    const reasoning = String(e.reasoning || '');
    const leaks = /(popular_science|peer_reviewed|mahighlight)\s*=/.exec(reasoning);
    if (leaks) {
      log(`! Evaluation für id=${e.id} enthält Variablennamen im Reasoning: "${leaks[0]}"`);
      process.exit(1);
    }
  }

  // Haiku-Gate. Die letzte Instanz vor der DB: kein Consumer kann eine vierte
  // Silbe von einer fuenften unterscheiden, und geschrieben hat die Zeile ein
  // Modell. Der Lauf bricht ab, statt ein halbes Haiku zu speichern. Wo die
  // Silbenzahl eines Wortes nicht sicher bestimmbar ist, bricht er auch ab — das
  // Wort gehoert dann mit Duden-Beleg in scripts/lib/haiku-lexicon.json.
  const haikuChecks = await checkHaikus(evals.map((e) => e.haiku));
  const haikuFails = haikuChecks
    .map((res, i) => ({ res, id: evals[i].id }))
    .filter(({ res }) => !res.ok);
  if (haikuFails.length > 0) {
    log(`! ${haikuFails.length} von ${evals.length} Haikus halten die Form nicht:`);
    for (const { res, id } of haikuFails) {
      log(`  id=${String(id).slice(0, 8)}…  ${res.text}`);
      for (const issue of res.issues) log(`      ${issue.message}`);
    }
    log('  Regeln: docs/INCHAT_SCORING.md. Unklare Woerter: scripts/lib/haiku-lexicon.json.');
    process.exit(1);
  }

  const apply = bool(args, 'apply');
  const force = bool(args, 'force');
  log(`${evals.length} Evaluations geparst und validiert. Ziel-DB: ${describeTarget()}. ${apply ? '[APPLY]' : '[DRY-RUN]'}${force ? ' [FORCE]' : ''}`);

  if (!apply) {
    log('Vorschau (max 3):');
    for (const e of evals.slice(0, 3)) {
      const score = computeStoredPressScore(dimsOf(e));
      log(`  id=${String(e.id).slice(0, 8)}…  press_score=${score}  pitch="${String(e.pitch_suggestion).slice(0, 80)}…"`);
    }
    log('Mit --apply tatsächlich in DB schreiben.');
    log('Mit --force auch bereits analyzed Pubs überschreiben (default: skip).');
    return;
  }

  await confirmProd({ isProd: isProdRun(), flags: rawFlags, label: 'session-pipeline apply' });

  const MIN_CONTENT_LEN = 120; // mirrors candidates threshold

  await withClient(async (c) => {
    // Pre-check: which IDs already analyzed? Default behaviour: skip them.
    // Pre-check 2: every pub being scored MUST have actual content substance —
    // otherwise the evaluation is by definition fabricated from the title.
    const ids = evals.map((e) => e.id);
    const existing = await c.query<{ id: string; analysis_status: string; content_len: number }>(
      `SELECT id, analysis_status,
        GREATEST(
          length(COALESCE(summary_de,'')),
          length(COALESCE(summary_en,'')),
          length(COALESCE(enriched_abstract,'')),
          length(COALESCE(abstract,''))
        ) AS content_len
       FROM publications WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const statusById = new Map(existing.rows.map((r) => [r.id, r.analysis_status]));
    const contentLenById = new Map(existing.rows.map((r) => [r.id, r.content_len]));
    const missing = ids.filter((id) => !statusById.has(id));
    const alreadyAnalyzed = ids.filter((id) => statusById.get(id) === 'analyzed');
    const tooThin = ids.filter((id) => statusById.has(id) && (contentLenById.get(id) ?? 0) < MIN_CONTENT_LEN);

    if (missing.length > 0) {
      log(`! ${missing.length} IDs existieren nicht in DB (werden übersprungen).`);
      for (const id of missing.slice(0, 5)) log(`    fehlt: ${id}`);
    }
    if (alreadyAnalyzed.length > 0 && !force) {
      log(`! ${alreadyAnalyzed.length} Pubs sind bereits analyzed (werden übersprungen — mit --force überschreiben).`);
      for (const id of alreadyAnalyzed.slice(0, 5)) log(`    skip:  ${id}`);
    }
    if (tooThin.length > 0) {
      log(`! ${tooThin.length} Pubs haben weniger als ${MIN_CONTENT_LEN} Zeichen Inhalt — werden NICHT bewertet.`);
      log(`  Eine Bewertung ohne Substanz ist Fabrikation. Diese Pubs müssen erst angereichert werden`);
      log(`  (läuft automatisch beim Import — Nacht-Ingest; manuell: docs/INCHAT_SCORING.md Schritt 0.5).`);
      for (const id of tooThin.slice(0, 5)) log(`    skip (no content): ${id}`);
      process.exit(2);
    }

    let updated = 0;
    let skipped = 0;
    for (const e of evals) {
      const status = statusById.get(e.id);
      if (!status) { skipped++; continue; }
      if (status === 'analyzed' && !force) { skipped++; continue; }

      const score = computeStoredPressScore(dimsOf(e));
      // Belt-and-suspenders: never overwrite an existing score unless --force.
      // The in-memory skip above already guards `analyzed` rows; this SQL-level
      // guard makes the protection atomic and independent of both the
      // analysis_status<->press_score invariant and any race between the
      // pre-check SELECT and this UPDATE. A guarded UPDATE that matches nothing
      // returns rowCount 0 and is counted as skipped.
      const scoreGuard = force ? '' : ' AND press_score IS NULL';
      const r = await c.query(`
        UPDATE publications SET
          analysis_status = 'analyzed',
          press_score = $1,
          public_accessibility = $2,
          societal_relevance = $3,
          novelty_factor = $4,
          storytelling_potential = $5,
          media_timeliness = $6,
          pitch_suggestion = $7,
          target_audience = $8,
          suggested_angle = $9,
          reasoning = $10,
          haiku = $11,
          llm_model = $12,
          analysis_cost = 0,
          updated_at = NOW()
        WHERE id = $13${scoreGuard}
      `, [
        score,
        e.public_accessibility,
        e.societal_relevance,
        e.novelty_factor,
        e.storytelling_potential,
        e.media_timeliness,
        String(e.pitch_suggestion),
        String(e.target_audience),
        String(e.suggested_angle),
        String(e.reasoning),
        e.haiku ? String(e.haiku) : null,
        SESSION_MODEL_TAG,
        e.id,
      ]);
      if ((r.rowCount ?? 0) > 0) updated++;
      else skipped++;
    }
    log(`Updated ${updated}/${evals.length} Publikationen.${skipped ? ` (${skipped} übersprungen)` : ''}`);
  });
}

// DOI-Extraction-Helfer leben in lib/shared/doi-extract.mjs (geteilt mit
// webdb-import.mjs ETL).

interface DoiCandidateRow {
  id: string;
  [key: string]: unknown;
}

/** Untergrenze für einen brauchbaren Pitch. Der kürzeste Pitch im Bestand hat
 *  114 Zeichen; alles darunter ist mit Sicherheit ein Fragment. */
const MIN_PITCH_LEN = 110;
/** Obergrenze gegen Ausreißer. Der längste im Bestand liegt bei knapp 900. */
const MAX_PITCH_LEN = 1200;

interface RepitchInput {
  id: string;
  pitch_suggestion: string;
}

async function cmdRepitchApply(args: Flags, positional: string[]): Promise<void> {
  const raw = positional[0] && positional[0] !== '-'
    ? readFileSync(positional[0], 'utf8')
    : readFileSync(0, 'utf8');
  const data = JSON.parse(raw) as unknown;
  const items: RepitchInput[] = Array.isArray(data)
    ? (data as RepitchInput[])
    : ((data as { publications?: RepitchInput[] })?.publications ?? []);

  if (!Array.isArray(items) || items.length === 0) {
    log('Keine Einträge gefunden in Input.');
    process.exit(1);
  }

  for (const it of items) {
    it.pitch_suggestion = sanitizeText(it.pitch_suggestion) as string;
  }

  // Validierung VOR jedem DB-Kontakt: ein halb geschriebener Batch ist
  // schlimmer als ein abgelehnter.
  for (const it of items) {
    if (!it.id || typeof it.id !== 'string') {
      log(`Eintrag ohne gültige id: ${JSON.stringify(it).slice(0, 120)}`);
      process.exit(1);
    }
    const pitch = String(it.pitch_suggestion || '').trim();
    if (pitch.length < MIN_PITCH_LEN || pitch.length > MAX_PITCH_LEN) {
      log(`id=${it.id}: Pitch hat ${pitch.length} Zeichen (erlaubt ${MIN_PITCH_LEN}-${MAX_PITCH_LEN}).`);
      process.exit(1);
    }
    // Genau die Floskeln, die die Rubrik jetzt verbietet. Der Guard hängt am
    // VOKABULAR der Verwertbarkeit, nicht an einer Satzform: „eignet sich für"
    // allein wäre zu eng (die erste Fassung übersah „eignet sich das Thema")
    // und zugleich zu breit, weil „das Verfahren eignet sich zur Diagnostik"
    // legitime Substanz ist. Medienbegriffe und Standort-Rhetorik trennen das
    // sauber. Umlaut-tolerant, falls ein Text in ue/ae-Schreibweise ankommt.
    const filler = /(dankbar(es)?\s|wertvoll(er|es)\s+(Baustein|Beitrag)|macht\s+den\s+Standort|Standort\s+sichtbar|Bildstrecke|Magazingeschichte|Aufmacher|Schlagzeile|(f(ü|ue)r\s+ein(e)?\s+(Feature|Reportage|Berichterstattung)))/i.exec(pitch);
    if (filler) {
      log(`id=${it.id}: Verwertbarkeits-Floskel im Pitch: "${filler[0]}". Gehört in target_audience/suggested_angle.`);
      process.exit(1);
    }
  }

  const apply = bool(args, 'apply');
  log(`${items.length} Pitches geparst und validiert. Ziel-DB: ${describeTarget()}. ${apply ? '[APPLY]' : '[DRY-RUN]'}`);

  await withClient(async (c) => {
    const ids = items.map((i) => i.id);
    const existing = await c.query<{
      id: string; analysis_status: string; press_score: number | null; content_len: number; alt: string | null;
    }>(
      `SELECT id, analysis_status, press_score,
        GREATEST(
          length(COALESCE(summary_de,'')), length(COALESCE(summary_en,'')),
          length(COALESCE(enriched_abstract,'')), length(COALESCE(abstract,''))
        ) AS content_len,
        pitch_suggestion AS alt
       FROM publications WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    const byId = new Map(existing.rows.map((r) => [r.id, r]));

    // Drei Wachen. Jede verhindert, dass ein Text an einem Satz landet, für den
    // er nicht geschrieben wurde.
    const missing = ids.filter((id) => !byId.has(id));
    const notScored = ids.filter((id) => byId.has(id)
      && (byId.get(id)!.analysis_status !== 'analyzed' || byId.get(id)!.press_score == null));
    const tooThin = ids.filter((id) => byId.has(id) && byId.get(id)!.content_len < 120);

    for (const [label, list] of [['existieren nicht', missing], ['sind nicht bewertet', notScored], ['haben zu wenig Inhalt', tooThin]] as const) {
      if (list.length > 0) {
        log(`! ${list.length} IDs ${label} — Abbruch, es wird nichts geschrieben.`);
        for (const id of list.slice(0, 5)) log(`    ${id}`);
        process.exit(2);
      }
    }

    if (!apply) {
      log('Vorschau (max 3), alt gegen neu:');
      for (const it of items.slice(0, 3)) {
        log(`  id=${it.id.slice(0, 8)}…`);
        log(`    alt: ${String(byId.get(it.id)?.alt ?? '').slice(0, 110)}…`);
        log(`    neu: ${it.pitch_suggestion.slice(0, 110)}…`);
      }
      log('Mit --apply tatsächlich in DB schreiben. Scores bleiben in jedem Fall unberührt.');
      return;
    }

    await confirmProd({ isProd: isProdRun(), flags: rawFlags, label: 'session-pipeline repitch-apply' });

    let updated = 0;
    for (const it of items) {
      // NUR pitch_suggestion. Kein analysis_status, keine Dimension, kein
      // llm_model, kein press_score. Der WHERE-Zusatz ist die letzte Wache:
      // sollte zwischen Vorprüfung und Schreiben jemand den Score entfernt
      // haben, greift der Update nicht.
      const r = await c.query(
        `UPDATE publications
            SET pitch_suggestion = $1, pitch_revision = pitch_revision + 1, updated_at = NOW()
          WHERE id = $2 AND analysis_status = 'analyzed' AND press_score IS NOT NULL`,
        [it.pitch_suggestion, it.id],
      );
      updated += r.rowCount ?? 0;
    }
    log(`Fertig: ${updated} Pitches ersetzt, ${items.length - updated} übersprungen. Scores unverändert.`);

    // Restbestand direkt melden. Nach einem Context-Clear ist das die einzige
    // Zahl, die man braucht, um zu wissen, ob noch etwas offen ist.
    const rest = await c.query<{ offen: string; modell: string | null }>(
      `SELECT count(*)::text AS offen, llm_model AS modell
         FROM publications
        WHERE analysis_status = 'analyzed' AND press_score IS NOT NULL
          AND archived = false AND pitch_revision = 0
        GROUP BY llm_model ORDER BY count(*) DESC LIMIT 5`,
    );
    for (const row of rest.rows) log(`  offen: ${row.offen}  (${row.modell ?? 'ohne Modell-Tag'})`);
  });
}

async function cmdDoiBackfill(args: Flags): Promise<void> {
  const apply = bool(args, 'apply');
  if (apply) {
    await confirmProd({ isProd: isProdRun(), flags: rawFlags, label: 'session-pipeline doi-backfill' });
  }

  await withClient(async (c) => {
    // Kandidaten-Filter aus dem geteilten doi-extract-Modul; SELECT-Liste deckt
    // alle Felder ab, die extractDoiFromRow durchsucht.
    const r = await c.query<DoiCandidateRow>(`
      SELECT id, doi_link, bibtex,
             citation_apa, citation_de, citation_en,
             citation,
             endnote, ris,
             website_link, download_link, url
      FROM publications
      WHERE archived = false AND ${DOI_CANDIDATE_WHERE_CLAUSE}
    `);
    log(`Kandidaten ohne DOI mit DOI-Spuren in irgendeinem Feld: ${r.rows.length}`);

    // Existierende DOIs für Duplikat-Check vorab in einem Set.
    const existing = await c.query<{ doi: string }>(
      `SELECT doi FROM publications WHERE doi IS NOT NULL AND doi != ''`,
    );
    const existingSet = new Set(existing.rows.map((row) => row.doi));

    const updates: { id: string; doi: string }[] = [];
    const dupes: { id: string; doi: string }[] = [];
    const noMatch: string[] = [];
    for (const row of r.rows) {
      const doi = extractDoiFromRow(row) as string | null;
      if (!doi) { noMatch.push(row.id); continue; }
      if (existingSet.has(doi)) { dupes.push({ id: row.id, doi }); continue; }
      existingSet.add(doi); // gegen Doppel-Treffer im selben Lauf
      updates.push({ id: row.id, doi });
    }

    log(`  → DOI extrahierbar:    ${updates.length}`);
    log(`  → DOI-Konflikt (skip): ${dupes.length}`);
    log(`  → kein Match:          ${noMatch.length}`);
    if (updates.length > 0) {
      log(`  Stichprobe:`);
      for (const u of updates.slice(0, 5)) log(`    ${u.id} -> ${u.doi}`);
    }

    if (!apply) {
      log(`[DRY-RUN] Mit --apply die ${updates.length} DOIs setzen.`);
      return;
    }

    if (updates.length === 0) {
      log('Nichts zu tun.');
      return;
    }

    let written = 0;
    await c.query('BEGIN');
    try {
      for (const u of updates) {
        const w = await c.query(
          `UPDATE publications SET doi = $1, updated_at = NOW()
           WHERE id = $2 AND (doi IS NULL OR doi = '')`,
          [u.doi, u.id],
        );
        written += w.rowCount ?? 0;
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    }
    log(`OK — ${written} DOIs geschrieben.`);
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const HELP = `Usage: npx tsx scripts/session-pipeline.ts <command> [options]

Ziel-DB: --target=local (Default) | --target=prod
         Schreibende Prod-Läufe fragen nach; --yes überspringt die Rückfrage.
         PG_DATABASE_URL überschreibt die Ziel-DB, solange kein --target gesetzt ist.

Commands:
  status                                Enrichment + Analysis-Status, Pool A/B
  enrich-free [--apply]                 WebDB-native Enrichment (summary_de/en → enriched)
                                        Default dry-run; --apply schreibt UPDATE.
  doi-backfill [--apply]                DOIs aus bibtex/citation_apa/_de/_en in die
                                        doi-Spalte rückführen (Pubs ohne DOI).
  candidates [N] [filters]              N Kandidaten als JSON auf stdout.
                                        Default-Fenster: created_at innerhalb der
                                        letzten ${SCORING_RECENT_DAYS} Tage (SCORING_RECENT_DAYS in
                                        lib/shared/dashboard.ts) — dieselbe Menge,
                                        die der Bewerten-Knopf im Web erfasst.
                                        Filters: --all (Altbestand öffnen),
                                                 --imported-after DATE (eigenes Datum),
                                                 --only-summary-de, --mahighlight,
                                                 --popular-science, --from YYYY-MM-DD,
                                                 --to YYYY-MM-DD,
                                                 --api-enriched (nur mit OpenAlex-Keywords)
  apply [<file>|-] [--apply] [--force]  Evaluation-JSON aus Datei/stdin, validieren,
                                        mit --apply schreiben. Default skip wenn
                                        analysis_status='analyzed', --force überschreibt.

  repitch-candidates [N] [--model=TAG]  Bereits BEWERTETE Pubs zum Neuschreiben des
                     [--all-revisions]  Pitch-Texts ziehen. Gleiche Nutzlast wie
                                        candidates, dazu current_pitch und
                                        press_score. --model filtert auf eine
                                        Bewertungs-Kohorte (llm_model). Default nur
                                        pitch_revision=0, also noch nicht
                                        nachgezogene; --all-revisions hebt das auf.
  repitch-apply [<file>|-] [--apply]    Schreibt AUSSCHLIESSLICH pitch_suggestion.
                                        Scores, Dimensionen, reasoning, llm_model und
                                        analysis_status bleiben unberuehrt. Lehnt
                                        Pitches ausserhalb 110-1200 Zeichen ab und
                                        solche mit Verwertbarkeits-Floskeln. Zaehlt
                                        pitch_revision hoch und meldet den Rest.

Modell-Tag bei Session-Scoring: ${SESSION_MODEL_TAG}
`;

/** Ziel-DB auflösen. Reihenfolge: explizites --target schlägt alles (auch ein
 *  in der Shell hängengebliebenes PG_DATABASE_URL), danach der Override, sonst
 *  lokal. Das explizite Flag zu bevorzugen ist der Sicherheitsteil — sonst
 *  ginge `--target=prod` still an eine lokale URL, oder umgekehrt. */
function resolveTarget(args: Flags, canonicalTarget: string): void {
  const explicit = typeof args.target === 'string' ? args.target : null;
  const override = process.env.PG_DATABASE_URL?.trim() || null;

  if (explicit !== null && explicit !== 'local' && explicit !== 'prod') {
    log(`Unbekanntes --target: ${explicit} (erwartet local|prod).`);
    process.exit(1);
  }
  const chosen: Target | null = explicit ? (explicit as Target) : (canonicalTarget === 'prod' ? 'prod' : null);

  if (chosen) {
    dbTarget = chosen;
    if (override) log(`Hinweis: PG_DATABASE_URL ist gesetzt, --target=${dbTarget} gewinnt.`);
  } else if (override) {
    dbOverrideUrl = override;
  }

  // confirmProd zeigt über redactedDatabaseUrl() den Inhalt von DATABASE_URL.
  // Ohne diese Zeile stünde dort der Wert aus .env.local — also die LOKALE DB,
  // während in Wahrheit auf Prod geschrieben wird. Genau die Rückfrage, die
  // schützen soll, würde dann in die Irre führen. Gleiche Zeile wie in
  // scripts/apply-event-scores.ts.
  process.env.DATABASE_URL = dbOverrideUrl ?? loadDbUrl(dbTarget);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd || cmd === '--help' || cmd === '-h') {
    log(HELP);
    process.exit(cmd ? 0 : 1);
  }

  const { args, positional } = parseArgs(rest);
  const script = parseScriptArgs();
  rawFlags = script.flags;

  try {
    resolveTarget(args, script.target);
    switch (cmd) {
      case 'status':         await cmdStatus(); break;
      case 'enrich-free':    await cmdEnrichFree(args); break;
      case 'doi-backfill':   await cmdDoiBackfill(args); break;
      case 'candidates':     await cmdCandidates(args, positional); break;
      case 'apply':          await cmdApply(args, positional); break;
      case 'repitch-candidates': await cmdRepitchCandidates(args, positional); break;
      case 'repitch-apply':      await cmdRepitchApply(args, positional); break;
      default:
        log(`Unbekanntes Kommando: ${cmd}`);
        process.exit(1);
    }
  } catch (e) {
    log(`Fehler: ${(e as Error)?.message ?? String(e)}`);
    const stack = (e as Error)?.stack;
    if (stack) log(stack);
    captureScriptError(e);
    await flushAndExit(1);
  }
}

try {
  process.loadEnvFile('.env.local');
} catch {
  // .env.local ist optional — ohne SENTRY_DSN bleibt der Sentry-Bootstrap inert.
}
initScriptSentry('session-pipeline');

void main();
