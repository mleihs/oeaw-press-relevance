#!/usr/bin/env node
// Anreicherung der press_release_orphans via OpenAlex (+ CrossRef als Fallback).
//
// Usage:
//   node scripts/enrich-orphans.mjs                  # alle pending+failed
//   node scripts/enrich-orphans.mjs --reset          # alle, auch already-enriched
//   node scripts/enrich-orphans.mjs --target=prod    # default: local
//
// Open-API only (kein API-key nötig). Throttling via 1s-delay zwischen Calls.

import { Client } from 'pg';
import { readFileSync } from 'fs';

const TARGET = process.argv.includes('--target=prod') ? 'prod' : 'local';
const RESET = process.argv.includes('--reset');

function loadDbUrl() {
  if (TARGET === 'prod') {
    const credPath = `${process.env.HOME}/.config/oeaw-press-release/prod-credentials`;
    const cred = readFileSync(credPath, 'utf-8');
    const m = cred.match(/^PROD_DB_URL_POOLER=(.+)$/m);
    if (!m) throw new Error('PROD_DB_URL_POOLER not found in prod-credentials');
    return m[1].trim();
  }
  return 'postgres://postgres:postgres@127.0.0.1:54422/postgres';
}

function reconstructAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return null;
  const words = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) words.push([pos, word]);
  }
  words.sort((a, b) => a[0] - b[0]);
  const txt = words.map(([, w]) => w).join(' ');
  return txt.length > 20 ? txt : null;
}

async function enrichFromOpenAlex(doi) {
  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'OeAW-Press-Relevance/1.0 (mailto:admin@oeaw.ac.at)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  const d = await res.json();

  const abstract = reconstructAbstract(d.abstract_inverted_index);
  const authors = Array.isArray(d.authorships)
    ? d.authorships.map(a => a.author?.display_name).filter(Boolean)
    : [];
  const journal = d.primary_location?.source?.display_name || d.host_venue?.display_name || null;
  const year = d.publication_year || null;
  const title = d.title || d.display_name || null;
  const openalex_id = d.id?.replace('https://openalex.org/', '') || null;

  const keywords = [];
  for (const c of (d.concepts ?? [])) {
    if (c.display_name && c.score > 0.3) keywords.push(c.display_name);
  }
  for (const t of (d.topics ?? []).slice(0, 5)) {
    if (t.display_name && !keywords.includes(t.display_name)) keywords.push(t.display_name);
  }

  return {
    ok: true,
    paper_title: title,
    abstract,
    authors,
    journal,
    paper_year: year,
    keywords,
    openalex_id,
  };
}

async function enrichFromCrossref(doi) {
  // Fallback wenn OpenAlex nichts hat (Zenodo/Repository-DOIs landen oft nur in CrossRef)
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'OeAW-Press-Relevance/1.0 (mailto:admin@oeaw.ac.at)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { ok: false, status: res.status };

  const m = (await res.json())?.message;
  if (!m) return { ok: false };

  const title = Array.isArray(m.title) ? m.title[0] : null;
  const abstract = m.abstract
    ? m.abstract.replace(/<[^>]+>/g, '').trim() || null
    : null;
  const authors = Array.isArray(m.author)
    ? m.author.map(a => [a.given, a.family].filter(Boolean).join(' ').trim()).filter(Boolean)
    : [];
  const journal = Array.isArray(m['container-title']) ? m['container-title'][0] : null;
  const year = m.published?.['date-parts']?.[0]?.[0] || m.created?.['date-parts']?.[0]?.[0] || null;
  const keywords = Array.isArray(m.subject) ? m.subject.slice(0, 8) : [];

  return {
    ok: true,
    paper_title: title,
    abstract,
    authors,
    journal,
    paper_year: year,
    keywords,
    openalex_id: null,
  };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const db = new Client({ connectionString: loadDbUrl() });
  await db.connect();
  console.log(`[enrich-orphans] target=${TARGET}`);

  const where = RESET ? '' : "WHERE enrichment_status IS NULL OR enrichment_status = 'failed'";
  const { rows } = await db.query(
    `SELECT id, doi FROM press_release_orphans ${where} ORDER BY press_release_at DESC NULLS LAST`,
  );
  console.log(`[enrich-orphans] ${rows.length} rows to process`);

  let stats = { enriched: 0, partial: 0, failed: 0 };
  for (const [i, r] of rows.entries()) {
    process.stdout.write(`[${i + 1}/${rows.length}] ${r.doi}  ... `);
    let result = await enrichFromOpenAlex(r.doi);
    let source = 'openalex';
    if (!result.ok || (!result.abstract && !result.paper_title)) {
      const cr = await enrichFromCrossref(r.doi);
      if (cr.ok && (cr.paper_title || cr.abstract)) {
        result = cr;
        source = 'crossref';
      }
    }

    let status;
    if (!result.ok) {
      status = 'failed';
      stats.failed++;
      console.log('FAILED');
    } else if (result.abstract && result.paper_title) {
      status = 'enriched';
      stats.enriched++;
      console.log(`ok (${source}, ${result.abstract.length}c)`);
    } else if (result.paper_title || result.abstract) {
      status = 'partial';
      stats.partial++;
      console.log(`partial (${source})`);
    } else {
      status = 'failed';
      stats.failed++;
      console.log('no data');
    }

    await db.query(
      `UPDATE press_release_orphans SET
         paper_title = COALESCE($2, paper_title),
         abstract = COALESCE($3, abstract),
         authors = COALESCE($4, authors),
         journal = COALESCE($5, journal),
         paper_year = COALESCE($6, paper_year),
         keywords = COALESCE($7, keywords),
         openalex_id = COALESCE($8, openalex_id),
         enrichment_status = $9,
         enriched_at = NOW()
       WHERE id = $1`,
      [
        r.id,
        result.paper_title ?? null,
        result.abstract ?? null,
        result.authors?.length ? result.authors : null,
        result.journal ?? null,
        result.paper_year ?? null,
        result.keywords?.length ? result.keywords : null,
        result.openalex_id ?? null,
        status,
      ],
    );

    await sleep(1100); // gentle throttling
  }

  console.log(`\n[enrich-orphans] done — enriched=${stats.enriched}, partial=${stats.partial}, failed=${stats.failed}`);
  await db.end();
}

main().catch(e => { console.error(e); process.exit(1); });
