#!/usr/bin/env tsx
// Backfill publications.enriched_journal from the DOI via CrossRef / OpenAlex —
// for rows the citation-export venue parser (scripts/backfill-venue.ts) cannot
// reach. Free public APIs, resumable, idempotent (only fills an empty venue).
//
// Usage:
//   npx tsx scripts/backfill-journal.ts --since=2024-01-01
//   npx tsx scripts/backfill-journal.ts --since=2024-01-01 --max=50

process.loadEnvFile('.env.local');

const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const pg = (await import('pg')).default;
  const { enrichFromCrossRef } = await import('@/lib/server/enrichment/crossref');
  const { enrichFromOpenAlex } = await import('@/lib/server/enrichment/openalex');

  const arg = (p: string) => process.argv.find((a) => a.startsWith(p));
  const SINCE = arg('--since=')?.slice(8) ?? '2024-01-01';
  const maxArg = arg('--max=');
  const MAX = maxArg ? Number(maxArg.slice(6)) : Infinity;

  const c = new pg.Client({
    connectionString: process.env.PG_DATABASE_URL
      ?? 'postgresql://postgres:postgres@127.0.0.1:54422/postgres',
  });
  await c.connect();
  try {
    const { rows } = await c.query<{ id: string; doi: string | null; doi_link: string | null }>(
      `SELECT id, doi, doi_link FROM publications
       WHERE archived = false AND COALESCE(enriched_journal, '') = ''
         AND published_at >= $1
         AND (COALESCE(doi, '') <> '' OR doi_link ~* 'doi\\.org/10\\.')
       ORDER BY published_at DESC`,
      [SINCE],
    );
    log(`backfill-journal since=${SINCE} — ${rows.length} DOI-bearing rows without a venue`);

    const doiOf = (r: { doi: string | null; doi_link: string | null }): string | null => {
      if (r.doi && r.doi.trim()) return r.doi.trim();
      const m = /10\.\d{4,}\/[^\s"<>]+/.exec(r.doi_link ?? '');
      return m ? m[0] : null;
    };

    const t0 = Date.now();
    let done = 0, filled = 0, viaCrossref = 0, viaOpenalex = 0, miss = 0;
    for (const r of rows) {
      if (done >= MAX) break;
      done += 1;
      const doi = doiOf(r);
      if (!doi) { miss += 1; continue; }

      let journal: string | undefined;
      try { journal = (await enrichFromCrossRef(doi))?.journal || undefined; } catch { /* fall through */ }
      if (journal) viaCrossref += 1;
      if (!journal) {
        try { journal = (await enrichFromOpenAlex(doi))?.journal || undefined; } catch { /* fall through */ }
        if (journal) viaOpenalex += 1;
      }

      if (journal) {
        await c.query(
          `UPDATE publications SET enriched_journal = $1, updated_at = NOW()
           WHERE id = $2 AND COALESCE(enriched_journal, '') = ''`,
          [journal, r.id],
        );
        filled += 1;
      } else {
        miss += 1;
      }
      if (done % 25 === 0) {
        log(`${done}/${rows.length} · filled ${filled} (crossref ${viaCrossref}, openalex ${viaOpenalex}) · no-journal ${miss}`);
      }
      await new Promise((res) => setTimeout(res, 120));
    }
    log(`DONE — ${done} processed in ${((Date.now() - t0) / 1000).toFixed(0)}s · `
      + `${filled} journals written (crossref ${viaCrossref}, openalex ${viaOpenalex}) · ${miss} none found`);
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

export {}; // module scope — keeps the top-level `log` out of the global namespace
