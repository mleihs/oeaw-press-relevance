#!/usr/bin/env node
/**
 * Dump the publications recovered by scripts/match-external-by-title.mjs that are
 * now SCORABLE (abstract >=120 chars) but still UNSCORED, as JSON with full
 * content — ready to score in a fresh session. Same shape the scorer expects.
 *
 * These rows are scattered across the whole corpus by date, so the plain
 * `session-pipeline candidates` (newest-first over all of Pool A) would bury
 * them; this targets them precisely via enriched_source = '...title-exact'.
 *
 *   node scripts/recovered-candidates.mjs            # all of them, JSON to stdout
 *   node scripts/recovered-candidates.mjs --limit=25 # first N (for batching)
 */
import { connectDb } from './lib/db.mjs';

const limArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limArg ? Number(limArg.slice(8)) : null;

const db = await connectDb({ target: 'local' });
try {
  const rows = (await db.query(`
    SELECT id, webdb_uid, title, original_title, lead_author, published_at,
           peer_reviewed, popular_science, enriched_source, enriched_keywords,
           COALESCE(NULLIF(summary_de,''), NULLIF(summary_en,''),
                    NULLIF(enriched_abstract,''), NULLIF(abstract,'')) AS content,
           CASE WHEN summary_de <> '' THEN 'summary_de'
                WHEN summary_en <> '' THEN 'summary_en'
                WHEN enriched_abstract <> '' THEN 'enriched_abstract'
                ELSE 'abstract' END AS content_source
    FROM publications
    WHERE enriched_source LIKE '%title-exact%'
      AND press_score IS NULL
      AND length(COALESCE(NULLIF(summary_de,''), NULLIF(summary_en,''),
                          NULLIF(enriched_abstract,''), NULLIF(abstract,''))) >= 120
    ORDER BY published_at DESC NULLS LAST
    ${LIMIT ? 'LIMIT ' + Number(LIMIT) : ''}
  `)).rows;
  process.stdout.write(JSON.stringify({ count: rows.length, publications: rows }, null, 2) + '\n');
} finally {
  await db.end();
}
