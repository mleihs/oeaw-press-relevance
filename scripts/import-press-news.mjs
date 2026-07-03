#!/usr/bin/env node
/**
 * Repeatable importer: TYPO3 ÖAW press-news → `press_releases` → promote.
 *
 * WHY THIS EXISTS
 * ---------------
 * The press-news ↔ publications DOI link is the "schon released" signal in
 * StoryScout. The link is produced by promote_press_release_orphans() (matches
 * press_releases.doi = publications.doi), but that function only ever matched
 * against a ONE-TIME 2026-05-06 seed of press_releases — there was no repeatable
 * importer pulling FRESH OeAW Pressemeldungen from TYPO3. So press news released
 * after ~mid-May 2026 never entered press_releases and never matched. This
 * script closes that gap: it re-extracts the current press-news set from the
 * TYPO3 WebDB and upserts orphan press_releases, then runs promote.
 *
 * SOURCE (TYPO3 EXT:news, same MySQL container as the events/pubs importers):
 *   - tx_news_domain_model_news in sys_category 64 ("ÖAW-Pressemeldungen", DE).
 *     The DE rows (sys_language_uid=0, l10n_parent=0) are the originals; their
 *     EN counterparts are l10n translations (sys_language_uid=1) — cat 1748
 *     ("OeAW press release") carries no direct record_mm links, so EN is reached
 *     via l10n_parent, not via its own category.
 *   - DOI lives in the `event_information` editor block ("Auf einen Blick" —
 *     citation + "DOI: 10..."), NOT in bodytext (8 rows) or teaser (0). Entities
 *     like &nbsp; wrap the DOI and MUST be decoded before extraction, else the
 *     pattern greedily captures "...&nbsp" onto the DOI.
 *   - URL: /news/<path_segment> (de) | /en/news/<path_segment> (en).
 *   - released_at: DATE(FROM_UNIXTIME(datetime)).
 *
 * TARGET: writes `press_releases` rows with publication_id = NULL (orphan),
 *   ON CONFLICT (LOWER(doi), COALESCE(lang,'')) DO NOTHING (idempotent — never
 *   touches an existing row), then calls promote_press_release_orphans() which
 *   links any orphan whose DOI now matches a publication. Both DBs carry the
 *   table + function (migrations), so --target=local|prod both work; run prod
 *   after the pub push so the new pubs are present to match against.
 *
 * Safety: DRY-RUN by default (BEGIN → insert → promote → ROLLBACK, reports the
 *   preview). --apply COMMITs. Single transaction.
 *
 * Usage:
 *   node scripts/import-press-news.mjs                      # dry-run → local
 *   node scripts/import-press-news.mjs --apply              # write local
 *   node scripts/import-press-news.mjs --target=prod        # dry-run → prod
 *   node scripts/import-press-news.mjs --target=prod --apply
 */
import mysql from 'mysql2/promise';
import { connectDb } from './lib/db.mjs';
import { cleanDoi, extractDoiFromText } from './lib/doi-extract.mjs';

// .env.local carries WEBDB_MYSQL_* (shell vars still win — process.loadEnvFile
// does not overwrite already-set keys), matching the rest of the importers.
process.loadEnvFile('.env.local');

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const target = argv.includes('--target=prod') ? 'prod' : 'local';

const PRESS_NEWS_CATEGORY = 64; // sys_category "ÖAW-Pressemeldungen" (DE)
const NEWS_BASE = 'https://www.oeaw.ac.at';

function mysqlConfig() {
  const env = process.env;
  return {
    host: env.WEBDB_MYSQL_HOST || env.MYSQL_HOST || '127.0.0.1',
    port: Number(env.WEBDB_MYSQL_PORT || env.MYSQL_PORT || 54499),
    user: env.WEBDB_MYSQL_USER || env.MYSQL_USER || 'root',
    password: env.WEBDB_MYSQL_PASSWORD ?? env.MYSQL_PASSWORD ?? 'root',
    database: env.WEBDB_MYSQL_DATABASE || env.MYSQL_DATABASE || 'webdb',
    charset: 'utf8mb4',
  };
}

/** Pull DE press-news originals (in cat 64) + their EN l10n translations.
 *  released_at is formatted to a YYYY-MM-DD string in SQL to dodge JS/TZ
 *  off-by-one on the UNIX → date conversion. */
const FETCH_PRESS_NEWS_SQL = `
  SELECT n.uid, n.sys_language_uid, n.l10n_parent, n.title, n.path_segment,
         DATE_FORMAT(FROM_UNIXTIME(NULLIF(n.datetime, 0)), '%Y-%m-%d') AS released_at,
         n.event_information, n.bodytext
  FROM tx_news_domain_model_news n
  JOIN sys_category_record_mm mm
    ON mm.uid_foreign = n.uid
   AND mm.tablenames = 'tx_news_domain_model_news'
   AND mm.uid_local = ${PRESS_NEWS_CATEGORY}
  WHERE n.deleted = 0 AND n.hidden = 0 AND n.sys_language_uid = 0 AND n.l10n_parent = 0
  UNION ALL
  SELECT t.uid, t.sys_language_uid, t.l10n_parent, t.title, t.path_segment,
         DATE_FORMAT(FROM_UNIXTIME(NULLIF(t.datetime, 0)), '%Y-%m-%d') AS released_at,
         t.event_information, t.bodytext
  FROM tx_news_domain_model_news t
  JOIN tx_news_domain_model_news de ON de.uid = t.l10n_parent
  JOIN sys_category_record_mm mm
    ON mm.uid_foreign = de.uid
   AND mm.tablenames = 'tx_news_domain_model_news'
   AND mm.uid_local = ${PRESS_NEWS_CATEGORY}
  WHERE t.deleted = 0 AND t.hidden = 0 AND t.l10n_parent > 0
`;

/** DOI extraction tuned for the press-news event_information block.
 *  HTML entities (esp. &nbsp;) wrap the DOI in the editor template, and tags
 *  must become whitespace so the DOI is delimited. Prefer the explicit
 *  "DOI: 10..." label (the 'Auf einen Blick' citation); fall back to the first
 *  DOI pattern anywhere (catches bare doi.org links). */
function extractPressNewsDoi(html) {
  if (!html) return null;
  const text = html
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/<[^>]+>/g, ' ');
  const labeled = text.match(/doi:?\s*(10\.\d{4,9}\/[^\s"'<>]+)/i);
  if (labeled) return cleanDoi(labeled[1]);
  return extractDoiFromText(text);
}

function buildUrl(l, slug) {
  if (!slug) return null;
  return l === 'en' ? `${NEWS_BASE}/en/news/${slug}` : `${NEWS_BASE}/news/${slug}`;
}

async function main() {
  // 1. Pull the press-news rows from TYPO3.
  const my = await mysql.createConnection(mysqlConfig());
  let rows;
  try {
    [rows] = await my.query(FETCH_PRESS_NEWS_SQL);
  } finally {
    await my.end();
  }
  const deRows = rows.filter((r) => r.l10n_parent === 0);
  const enRows = rows.filter((r) => r.l10n_parent > 0);
  console.log(`[source] press-news rows: ${rows.length} (de originals ${deRows.length}, en translations ${enRows.length})`);

  // 2. Build candidate press_releases. DE first so EN can inherit the parent's
  //    DOI when its own event_information omits one (same paper).
  const doiByDeUid = new Map();
  const candidates = []; // {doi, url, released_at, lang, news_title, source_news_uid}
  let noDoi = 0, noUrl = 0;

  for (const r of deRows) {
    const doi = extractPressNewsDoi(r.event_information) || extractPressNewsDoi(r.bodytext);
    if (doi) doiByDeUid.set(r.uid, doi);
    else { noDoi++; continue; }
    const url = buildUrl('de', r.path_segment);
    if (!url) { noUrl++; continue; }
    candidates.push({ doi, url, released_at: r.released_at, lang: 'de', news_title: r.title, source_news_uid: r.uid });
  }
  for (const r of enRows) {
    const doi = extractPressNewsDoi(r.event_information) || extractPressNewsDoi(r.bodytext) || doiByDeUid.get(r.l10n_parent) || null;
    if (!doi) { noDoi++; continue; }
    const url = buildUrl('en', r.path_segment);
    if (!url) { noUrl++; continue; }
    candidates.push({ doi, url, released_at: r.released_at, lang: 'en', news_title: r.title, source_news_uid: r.uid });
  }

  // 3. Dedup by (lower(doi), lang) — matches the unique index; first wins.
  const byKey = new Map();
  for (const c of candidates) {
    const key = `${c.doi.toLowerCase()}~${c.lang}`;
    if (!byKey.has(key)) byKey.set(key, c);
  }
  const deduped = [...byKey.values()];
  const uniqueDois = new Set(deduped.map((c) => c.doi.toLowerCase())).size;
  console.log(`[extract] with DOI: ${candidates.length}  no-DOI: ${noDoi}  no-URL skip: ${noUrl}`);
  console.log(`[extract] deduped press_releases candidates: ${deduped.length} (${uniqueDois} unique DOIs; de ${deduped.filter((c) => c.lang === 'de').length}, en ${deduped.filter((c) => c.lang === 'en').length})`);

  // 4. Upsert orphans + promote, single tx. DRY-RUN rolls back.
  const db = await connectDb({ target });
  try {
    const before = (await db.query(
      `SELECT count(*) total, count(*) FILTER (WHERE publication_id IS NOT NULL) matched FROM press_releases`,
    )).rows[0];
    console.log(`[${target}] press_releases before: ${before.total} (matched ${before.matched})`);

    await db.query('BEGIN');
    let inserted = 0;
    if (deduped.length) {
      // ONE multi-row INSERT. Per-row INSERTs took >60s over the eu-west-3
      // pooler (163 round-trips); a single statement is ~1s. Already deduped on
      // the unique key, so no intra-batch ON CONFLICT ambiguity. 6 params/row
      // (~1k for the whole press-news set) — far under the 65535 bind limit.
      const cols = ['doi', 'url', 'released_at', 'lang', 'news_title', 'source_news_uid'];
      const valuesSql = deduped
        .map((_, i) => `(${cols.map((__, j) => `$${i * cols.length + j + 1}`).join(', ')})`)
        .join(', ');
      const params = deduped.flatMap((c) => [c.doi, c.url, c.released_at, c.lang, c.news_title, c.source_news_uid]);
      const res = await db.query(
        `INSERT INTO press_releases (${cols.join(', ')})
         VALUES ${valuesSql}
         ON CONFLICT (LOWER(doi), COALESCE(lang, '')) DO NOTHING`,
        params,
      );
      inserted = res.rowCount;
    }
    const promoted = (await db.query(`SELECT promote_press_release_orphans() AS n`)).rows[0].n;
    const after = (await db.query(
      `SELECT count(*) total, count(*) FILTER (WHERE publication_id IS NOT NULL) matched,
              count(*) FILTER (WHERE publication_id IS NULL) orphan FROM press_releases`,
    )).rows[0];

    console.log(`\n[${target}] ${apply ? 'APPLY' : 'DRY-RUN'} result:`);
    console.log(`  new orphan rows inserted : ${inserted}`);
    console.log(`  promote() linked         : ${promoted}  (orphans whose DOI now matches a publication)`);
    console.log(`  press_releases after     : ${after.total} (matched ${after.matched}, orphan ${after.orphan})`);

    if (apply) {
      await db.query('COMMIT');
      console.log('\nCOMMITTED.');
    } else {
      await db.query('ROLLBACK');
      console.log('\nDRY-RUN rolled back. Re-run with --apply to write.');
    }
  } catch (e) {
    await db.query('ROLLBACK');
    console.error('FAILED, rolled back:', e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('[import-press-news] failed:', err);
  process.exit(1);
});
