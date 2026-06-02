#!/usr/bin/env node
/**
 * Last-resort enrichment for pubs the DOI-driven cascade cannot reach: pubs
 * WITHOUT a DOI. Queries CrossRef + OpenAlex by TITLE and accepts a candidate
 * ONLY on an EXACT normalized-title match, corroborated by publication year
 * (±1) — so we recover a DOI / abstract without ever attaching the wrong work.
 *
 * "Exact" = equal after: strip HTML/entities, fold diacritics, lowercase,
 * collapse every run of non-alphanumerics to a single space, trim. Raw titles
 * are printed in dry-run so the equality is auditable by eye.
 *
 * Write-back (only with --apply, only on a confirmed match):
 *   - doi               ← recovered DOI (only if the pub had none)
 *   - enriched_abstract ← candidate abstract (if any; >=120 chars)
 *   - enriched_source   ← 'crossref-title-exact' | 'openalex-title-exact'
 *   - enrichment_status ← 'enriched' if abstract>=120, else 'partial' (DOI recovered)
 *   - updated_at        ← NOW()
 * Never touches press_score / analysis columns. Local DB only.
 *
 * Usage:
 *   node scripts/match-external-by-title.mjs --since=2026-01-01            # dry-run
 *   node scripts/match-external-by-title.mjs --since=2025-06-01 --until=2025-12-31
 *   node scripts/match-external-by-title.mjs --since=2026-01-01 --apply
 *   flags: --status=failed,partial (default) --max=N --source=crossref,openalex
 */
import { connectDb } from './lib/db.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (k, d = null) => { const a = argv.find((x) => x.startsWith(k + '=')); return a ? a.slice(k.length + 1) : d; };
const apply = has('--apply');
const since = val('--since');
const until = val('--until');
const statuses = (val('--status', 'failed,partial')).split(',').map((s) => s.trim()).filter(Boolean);
const sources = (val('--source', 'crossref,openalex')).split(',').map((s) => s.trim());
const max = Number(val('--max', 'Infinity'));
const MAILTO = 'matthias.leihs@gmail.com';
const UA = `oeaw-press-relevance/1.0 (mailto:${MAILTO})`;

const norm = (s) => (s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&[a-z]+;/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; } finally { clearTimeout(t); }
}

function stripJats(s) { return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function openalexAbstract(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const words = [];
  for (const [w, ps] of Object.entries(inv)) for (const p of ps) words[p] = w;
  return words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function crossref(title) {
  const u = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(title)}&rows=5&mailto=${MAILTO}`;
  const j = await getJson(u);
  return (j?.message?.items || []).map((it) => ({
    src: 'crossref', doi: (it.DOI || '').toLowerCase() || null,
    title: Array.isArray(it.title) ? it.title[0] : it.title,
    year: it.issued?.['date-parts']?.[0]?.[0] ?? it.published?.['date-parts']?.[0]?.[0] ?? null,
    abstract: stripJats(it.abstract || ''),
    authors: (it.author || []).map((a) => a.family).filter(Boolean),
  }));
}
async function openalex(title) {
  const u = `https://api.openalex.org/works?filter=title.search:${encodeURIComponent(title)}&per_page=5&mailto=${MAILTO}`;
  const j = await getJson(u);
  return (j?.results || []).map((it) => ({
    src: 'openalex', doi: (it.doi || '').replace(/^https?:\/\/doi\.org\//, '').toLowerCase() || null,
    title: it.title,
    year: it.publication_year ?? null,
    abstract: openalexAbstract(it.abstract_inverted_index),
    authors: (it.authorships || []).map((a) => a.author?.display_name?.split(' ').pop()).filter(Boolean),
  }));
}

const local = await connectDb({ target: 'local' });
try {
  const conds = ['enrichment_status = ANY($1)', 'doi IS NULL'];
  const params = [statuses];
  if (since) { params.push(since); conds.push(`published_at >= $${params.length}`); }
  if (until) { params.push(until); conds.push(`published_at <= $${params.length}`); }
  const rows = (await local.query(
    `SELECT id, webdb_uid, title, published_at, lead_author FROM publications WHERE ${conds.join(' AND ')} ORDER BY published_at DESC`,
    params
  )).rows.slice(0, Number.isFinite(max) ? max : undefined);

  console.log(`No-DOI ${statuses.join('/')} pubs in scope: ${rows.length}  [${apply ? 'APPLY' : 'DRY-RUN'}]`);
  let matched = 0, withAbstract = 0, doiOnly = 0;
  const writes = [];

  // Generic titles are a false-positive trap ("Introduction" === "Introduction"
  // is exact but meaningless). Require >=3 normalized words and reject a
  // blocklist of front-matter titles.
  const GENERIC = new Set(['introduction', 'einleitung', 'einfuhrung', 'vorwort', 'vorbemerkung',
    'preface', 'foreword', 'editorial', 'geleitwort', 'nachwort', 'nachruf', 'obituary',
    'conclusion', 'schluss', 'schlusswort', 'inhalt', 'contents', 'abstract', 'review',
    'rezension', 'buchbesprechung', 'vorschau', 'impressum']);

  for (const p of rows) {
    const pn = norm(p.title);
    const words = pn.split(' ').filter(Boolean);
    if (words.length < 3 || GENERIC.has(pn)) continue; // too generic/short to match safely
    const pubYear = p.published_at ? new Date(p.published_at).getFullYear() : null;
    let cands = [];
    if (sources.includes('crossref')) { cands = cands.concat(await crossref(p.title)); await sleep(120); }
    if (sources.includes('openalex')) { cands = cands.concat(await openalex(p.title)); await sleep(120); }

    // EXACT normalized-title equality + year corroboration (±1 when both known)
    const exact = cands.filter((c) => c.title && norm(c.title) === pn)
      .filter((c) => !(pubYear && c.year) || Math.abs(c.year - pubYear) <= 1);
    if (exact.length === 0) continue;
    // prefer a candidate that actually carries an abstract, then one with a DOI
    exact.sort((a, b) => (b.abstract.length - a.abstract.length) || ((b.doi ? 1 : 0) - (a.doi ? 1 : 0)));
    const best = exact[0];
    matched++;
    const abs = best.abstract.length >= 120 ? best.abstract : '';
    if (abs) withAbstract++; else doiOnly++;
    writes.push({ id: p.id, doi: best.doi, abstract: abs, src: `${best.src}-title-exact`, status: abs ? 'enriched' : 'partial' });
    console.log(`\n  MATCH uid=${p.webdb_uid} [${best.src}] year ${pubYear}↔${best.year} ${best.doi ? 'DOI '+best.doi : '(kein DOI im Treffer)'} abstract=${best.abstract.length}c`);
    console.log(`    pub:  ${p.title}`);
    console.log(`    hit:  ${best.title}`);
  }

  console.log(`\nExakte Treffer: ${matched}/${rows.length}  (mit Abstract>=120: ${withAbstract}, nur DOI: ${doiOnly})`);
  if (!apply) { console.log('\nRe-run with --apply to write back.'); process.exit(0); }
  if (writes.length === 0) { console.log('Nichts zurückzuspeichern.'); process.exit(0); }

  // DOI uniqueness: the recovered DOI may collide with another row in this
  // batch OR already exist elsewhere in the DB (publications_doi_unique_not_null).
  // Resolve by giving the DOI to the first claimant only; duplicates still get
  // the abstract written, just with doi left NULL.
  await local.query('BEGIN');
  try {
    let n = 0, doiSet = 0, absOnly = 0, skipped = 0;
    const usedDoi = new Set();
    for (const w of writes) {
      let doi = w.doi;
      if (doi) {
        if (usedDoi.has(doi)) doi = null;
        else {
          const ex = await local.query('SELECT 1 FROM publications WHERE lower(doi) = lower($1) AND id <> $2 LIMIT 1', [doi, w.id]);
          if (ex.rowCount > 0) doi = null; else usedDoi.add(doi);
        }
      }
      if (!doi && !w.abstract) { skipped++; continue; } // nothing left to write after collision
      const status = w.abstract ? 'enriched' : 'partial';
      const r = await local.query(
        `UPDATE publications SET
           doi = COALESCE(doi, $2),
           enriched_abstract = CASE WHEN $3 <> '' THEN $3 ELSE enriched_abstract END,
           enriched_source = $4,
           enrichment_status = $5,
           updated_at = NOW()
         WHERE id = $1 AND doi IS NULL`,
        [w.id, doi, w.abstract, w.src, status]
      );
      n += r.rowCount;
      if (doi) doiSet++; if (w.abstract) absOnly++;
    }
    await local.query('COMMIT');
    console.log(`Zurückgespeichert: ${n} Pubs (DOI gesetzt: ${doiSet}, mit Abstract: ${absOnly}, übersprungen wg. DOI-Kollision: ${skipped}).`);
  } catch (e) { await local.query('ROLLBACK'); console.error('rollback:', e.message); process.exit(1); }
} finally { await local.end(); }
