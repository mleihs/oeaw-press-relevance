#!/usr/bin/env tsx
// Headless full-corpus enrichment. Reuses the production cascade
// (lib/server/enrichment/batch.ts — CrossRef / OpenAlex / Unpaywall / Semantic
// Scholar + PDF). Selects strictly newest-first (published_at DESC), DOI and
// non-DOI mixed — recent publications are enriched before old ones.
//
// Resumable & idempotent: drains enrichment_status='pending' in 500-row rounds.
// A crash or Ctrl-C just means re-run — progress is committed per row. Free.
//
// Usage:
//   npm run enrich-all                    # everything, newest first
//   npm run enrich-all -- --since=2024    # only published_at >= 2024-01-01
//   npm run enrich-all -- --max=20        # bounded smoke test

// .env.local must load BEFORE the server modules (env validation +
// DATABASE_URL) — hence the dynamic imports after loadEnvFile(). The Sentry
// bootstrap is a plain external lib (no env read at import), so it's static.
import { initScriptSentry, captureScriptError, flushAndExit } from './lib/sentry.mjs';

process.loadEnvFile('.env.local');
initScriptSentry('enrich-all');

const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

async function main() {
  const { runEnrichmentBatch } = await import('@/lib/server/enrichment/batch');
  const { db, publications, descNullsLast } = await import('@/lib/server/db');
  const { publicationToApi } = await import('@/lib/server/publications/to-api');
  const { and, eq, gte } = await import('drizzle-orm');

  const arg = (p: string) => process.argv.find((a) => a.startsWith(p));
  const maxArg = arg('--max=');
  const maxNum = maxArg ? Number(maxArg.slice(6)) : NaN;
  const MAX = Number.isFinite(maxNum) ? maxNum : Infinity;
  const sinceArg = arg('--since=');
  const SINCE = sinceArg ? `${sinceArg.slice(8)}-01-01` : null;

  const ac = new AbortController();
  process.on('SIGINT', () => {
    log('interrupted — per-row progress is saved; re-run to resume');
    process.exit(130);
  });

  const t0 = Date.now();
  const tally: Record<string, number> = { enriched: 0, partial: 0, failed: 0 };
  let done = 0;
  const emit = (type: string, data: unknown) => {
    if (type !== 'pub_done') return;
    done += 1;
    const status = String((data as { final_status?: string }).final_status);
    tally[status] = (tally[status] ?? 0) + 1;
    if (done % 100 === 0) {
      const rate = done / ((Date.now() - t0) / 1000);
      log(`${done} done · ${rate.toFixed(2)}/s · enriched ${tally.enriched} `
        + `partial ${tally.partial} failed ${tally.failed}`);
    }
  };

  log(`enrich-all${SINCE ? ` --since=${SINCE}` : ''}`
    + `${MAX !== Infinity ? ` --max=${MAX}` : ''}`);

  // Drain `pending` in rounds, strictly newest-first (DOI + non-DOI mixed).
  for (let round = 1; ; round += 1) {
    if (done >= MAX) break;
    const limit = MAX === Infinity ? 500 : Math.min(500, MAX - done);
    const where = SINCE
      ? and(eq(publications.enrichmentStatus, 'pending'),
            gte(publications.publishedAt, SINCE))
      : eq(publications.enrichmentStatus, 'pending');
    const rows = await db.select().from(publications)
      .where(where)
      .orderBy(descNullsLast(publications.publishedAt))
      .limit(limit);
    if (rows.length === 0) break;
    const pubs = rows.map(publicationToApi);
    log(`round ${round}: ${pubs.length} pending`);
    await runEnrichmentBatch({ pubs, abortSignal: ac.signal, emit });
  }

  // Pre-existing `partial` rows — one pass, only on a full (no --since) run.
  if (done < MAX && !SINCE) {
    const partialRows = await db.select().from(publications)
      .where(eq(publications.enrichmentStatus, 'partial'))
      .orderBy(descNullsLast(publications.publishedAt))
      .limit(500);
    if (partialRows.length > 0) {
      const partials = partialRows.map(publicationToApi);
      log(`final pass: ${partials.length} partial`);
      await runEnrichmentBatch({ pubs: partials, abortSignal: ac.signal, emit });
    }
  }

  log(`ALL DONE — ${done} publications in `
    + `${((Date.now() - t0) / 60000).toFixed(1)} min · `
    + `enriched ${tally.enriched} partial ${tally.partial} failed ${tally.failed}`);
}

main().catch((e) => {
  console.error(e);
  captureScriptError(e);
  void flushAndExit(1);
});

export {}; // module scope — keeps the top-level `log` out of the global namespace
