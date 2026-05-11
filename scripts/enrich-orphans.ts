#!/usr/bin/env tsx
/**
 * Press-release-orphan enrichment via OpenAlex → CrossRef → SemanticScholar
 * → Unpaywall → PDF-extract.
 *
 * Reuses the existing lib/enrichment/* modules (single source of truth for
 * API mapping). Each step kicks in only if the previous didn't return both
 * a title AND an abstract.
 *
 * Usage:
 *   npm run enrich-orphans                          # local, all pending+failed
 *   npm run enrich-orphans -- --reset               # local, re-enrich all
 *   npm run enrich-orphans -- --only-pdf            # local, only stages 4+5 on partials
 *   npm run enrich-orphans -- --target=prod         # prod
 *   npm run enrich-orphans -- --target=prod --promote  # also call promote_press_release_orphans()
 */

import type { EnrichmentResult } from '../lib/shared/types';
import { enrichFromOpenAlex } from '../lib/enrichment/openalex';
import { enrichFromCrossRef } from '../lib/enrichment/crossref';
import { enrichFromSemanticScholar } from '../lib/enrichment/semantic-scholar';
import { enrichFromUnpaywall } from '../lib/enrichment/unpaywall';
import { enrichFromPdf } from '../lib/enrichment/pdf-extract';
import { connectDb, parseScriptArgs } from './lib/db.mjs';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Merges a fresh EnrichmentResult into an accumulator, never overwriting
 *  fields that are already set. Returns the merged result. */
function merge(acc: EnrichmentResult | null, fresh: EnrichmentResult | null): EnrichmentResult | null {
  if (!fresh) return acc;
  if (!acc) return fresh;
  return {
    ...fresh,
    ...Object.fromEntries(Object.entries(acc).filter(([, v]) => v !== undefined && v !== null && v !== '')),
    source: acc.source ? `${acc.source}+${fresh.source}` : fresh.source,
  } as EnrichmentResult;
}

/** Returns true once we have both a title AND an abstract — the threshold
 *  for "enriched" status. Anything less stays "partial". */
function hasFullEnrichment(r: EnrichmentResult | null): boolean {
  return !!(r?.title && r?.abstract);
}

async function enrichOrphan(
  doi: string,
  opts: { onlyPdf: boolean },
): Promise<{ result: EnrichmentResult | null; sources: string[] }> {
  const sources: string[] = [];
  let acc: EnrichmentResult | null = null;

  if (!opts.onlyPdf) {
    // Stage 1: OpenAlex
    const oa = await enrichFromOpenAlex(doi);
    if (oa) { acc = merge(acc, oa); sources.push('openalex'); }
    if (hasFullEnrichment(acc)) return { result: acc, sources };

    // Stage 2: CrossRef
    const cr = await enrichFromCrossRef(doi);
    if (cr) { acc = merge(acc, cr); sources.push('crossref'); }
    if (hasFullEnrichment(acc)) return { result: acc, sources };

    // Stage 3: Semantic Scholar
    const s2 = await enrichFromSemanticScholar(doi);
    if (s2) { acc = merge(acc, s2); sources.push('s2'); }
    if (hasFullEnrichment(acc)) return { result: acc, sources };
  }

  // Stage 4: Unpaywall — we only need this for the pdf_url (last-resort fetch)
  let pdfUrl = acc?.pdf_url;
  if (!acc?.abstract) {
    const up = await enrichFromUnpaywall(doi);
    if (up?.pdf_url && !pdfUrl) {
      pdfUrl = up.pdf_url;
      acc = merge(acc, up);
      sources.push('unpaywall');
    }
  }

  // Stage 5: PDF-extract — last resort
  if (!acc?.abstract && pdfUrl) {
    const pdf = await enrichFromPdf(pdfUrl);
    if (pdf?.abstract) {
      acc = merge(acc, pdf);
      sources.push('pdf');
    }
  }

  return { result: acc, sources };
}

function classifyStatus(r: EnrichmentResult | null): 'enriched' | 'partial' | 'failed' {
  if (!r) return 'failed';
  if (r.title && r.abstract) return 'enriched';
  if (r.title || r.abstract || r.journal) return 'partial';
  return 'failed';
}

async function main() {
  const args = parseScriptArgs() as { target: 'local' | 'prod'; reset: boolean; onlyPdf: boolean; promote: boolean };
  const db = await connectDb({ target: args.target });
  console.log(`[enrich-orphans] target=${args.target} reset=${args.reset} onlyPdf=${args.onlyPdf} promote=${args.promote}`);

  let where = "WHERE enrichment_status IS NULL OR enrichment_status = 'failed'";
  if (args.reset) where = '';
  else if (args.onlyPdf) where = "WHERE enrichment_status = 'partial'";

  // Orphans = press_releases-Rows ohne publication_id-FK. Die `where`-clause
  // (enrichment_status-Filter) wird unten mit der orphan-Bedingung AND-verknüpft.
  const orphanFilter = where
    ? `${where} AND publication_id IS NULL`
    : 'WHERE publication_id IS NULL';
  const { rows } = await db.query<{ id: string; doi: string }>(
    `SELECT id, doi FROM press_releases ${orphanFilter} ORDER BY released_at DESC NULLS LAST`,
  );
  console.log(`[enrich-orphans] ${rows.length} rows to process`);

  const stats = { enriched: 0, partial: 0, failed: 0 };
  for (const [i, row] of rows.entries()) {
    process.stdout.write(`[${i + 1}/${rows.length}] ${row.doi}  ... `);
    let result: EnrichmentResult | null = null;
    let sources: string[] = [];
    try {
      const out = await enrichOrphan(row.doi, { onlyPdf: args.onlyPdf });
      result = out.result;
      sources = out.sources;
    } catch (e) {
      console.log(`error: ${e instanceof Error ? e.message : String(e)}`);
    }
    const status = classifyStatus(result);
    stats[status]++;
    console.log(
      status === 'enriched'
        ? `ok (${sources.join('+')}, ${result?.abstract?.length ?? 0}c)`
        : status === 'partial'
          ? `partial (${sources.join('+') || 'none'})`
          : 'FAILED',
    );

    // Recompute oeaw_author_matches whenever authors change.
    // (compute_oeaw_author_matches() lives in migration 20260509000006.)
    await db.query(
      `UPDATE press_releases SET
         paper_title = COALESCE($2, paper_title),
         abstract = COALESCE($3, abstract),
         authors = COALESCE($4, authors),
         journal = COALESCE($5, journal),
         paper_year = COALESCE($6, paper_year),
         keywords = COALESCE($7, keywords),
         openalex_id = COALESCE($8, openalex_id),
         enrichment_status = $9,
         enriched_at = NOW(),
         oeaw_author_matches = compute_oeaw_author_matches(COALESCE($4, authors))
       WHERE id = $1`,
      [
        row.id,
        result?.title ?? null,
        result?.abstract ?? null,
        result?.authors && result.authors.length > 0 ? result.authors : null,
        result?.journal ?? null,
        result?.published_at ? Number(result.published_at.slice(0, 4)) : null,
        result?.keywords && result.keywords.length > 0 ? result.keywords : null,
        result?.openalex_id ?? null,
        status,
      ],
    );

    await sleep(1100); // gentle throttling between API calls
  }

  console.log(`\n[enrich-orphans] done — enriched=${stats.enriched} partial=${stats.partial} failed=${stats.failed}`);

  if (args.promote) {
    const { rows: pr } = await db.query<{ n: number }>(
      "SELECT promote_press_release_orphans_logged('enrich-orphans') AS n",
    );
    console.log(`[enrich-orphans] promoted ${pr[0].n} orphan(s) → publications`);
  }

  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
