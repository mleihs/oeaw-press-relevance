#!/usr/bin/env tsx
// One-shot backfill of publications.enriched_journal from the WebDB citation
// exports (BibTeX / RIS / EndNote) — see lib/server/enrichment/venue-extract.ts.
//
// The HeboWebDB has no journal column; the DOI-keyed API enrichment only ever
// reaches DOI-bearing rows. This recovers the venue locally — free, no API, no
// DOI — and lifts enriched_journal coverage from ~5% toward ~80%. Idempotent:
// only fills rows that have no venue yet.
//
// Usage:
//   npm run backfill-venue                  # local, apply
//   npm run backfill-venue -- --dry-run     # local, report only
//   npm run backfill-venue -- --target=prod # prod (after the local run)

import pg from 'pg';
import { extractVenue } from '@/lib/server/enrichment/venue-extract';
import { loadDbUrl, parseScriptArgs } from './lib/db.mjs';

const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const { target, flags } = parseScriptArgs();
  const dryRun = flags.includes('--dry-run');
  const BATCH = 500;

  const client = new pg.Client({ connectionString: loadDbUrl(target) });
  await client.connect();
  try {
    log(`backfill-venue → ${target}${dryRun ? '  (DRY-RUN)' : ''}`);
    const { rows } = await client.query<{
      id: string;
      bibtex: string | null;
      ris: string | null;
      endnote: string | null;
    }>(
      `SELECT id, bibtex, ris, endnote FROM publications
       WHERE coalesce(enriched_journal, '') = ''`,
    );
    log(`${rows.length} publications without a venue`);

    const updates: Array<[string, string]> = [];
    const bySource = { bibtex: 0, ris: 0, endnote: 0 };
    for (const r of rows) {
      const hit = extractVenue(r);
      if (hit) {
        updates.push([r.id, hit.venue]);
        bySource[hit.source] += 1;
      }
    }
    const pct = rows.length
      ? ((updates.length / rows.length) * 100).toFixed(1)
      : '0';
    log(
      `venue recovered for ${updates.length} / ${rows.length} (${pct}%) — `
      + `bibtex ${bySource.bibtex}, ris ${bySource.ris}, endnote ${bySource.endnote}`,
    );

    if (dryRun) {
      log('sample of recovered venues:');
      for (const [, v] of updates.slice(0, 20)) console.log(`   • ${v}`);
      log('DRY-RUN — nothing written.');
      return;
    }

    let written = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
      const slice = updates.slice(i, i + BATCH);
      const ph = slice
        .map((_, k) => `($${k * 2 + 1}::uuid, $${k * 2 + 2}::text)`)
        .join(',');
      // Idempotent guard: the coalesce()='' WHERE never overwrites a venue.
      const res = await client.query(
        `UPDATE publications p SET enriched_journal = v.venue
         FROM (VALUES ${ph}) AS v(id, venue)
         WHERE p.id = v.id AND coalesce(p.enriched_journal, '') = ''`,
        slice.flat(),
      );
      written += res.rowCount ?? 0;
      process.stdout.write(`\r  written ${written}/${updates.length}`);
    }
    process.stdout.write('\n');
    log(`done — enriched_journal set on ${written} publications`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
