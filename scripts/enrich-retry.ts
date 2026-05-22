#!/usr/bin/env tsx
// Headless re-enrichment of rows that did NOT reach 'enriched' on an earlier
// pass. `enrich-all.ts` drains 'pending'; this re-runs 'failed' and/or
// 'partial' rows through the same production cascade
// (lib/server/enrichment/batch.ts). Useful when freshly indexed CrossRef /
// OpenAlex abstracts — or a newer WebDB summary — can now succeed where an
// earlier attempt could not. Optional --since/--until scope it by publish date.
//
// Resumable & idempotent: progress is committed per row; a crash or Ctrl-C
// just means re-run. Free (no LLM calls). No-DOI 'failed' rows run instantly
// (every API source is skipped) and simply stay failed.
//
// Usage:
//   npx tsx scripts/enrich-retry.ts --status=failed,partial --since=2026-01-01
//   npx tsx scripts/enrich-retry.ts --status=partial                  # all
//   npx tsx scripts/enrich-retry.ts --status=failed --since=2026-01-01 --max=5

process.loadEnvFile('.env.local');

const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

type EStatus = 'pending' | 'partial' | 'failed' | 'enriched';

async function main() {
  const { runEnrichmentBatch } = await import('@/lib/server/enrichment/batch');
  const { db, publications, descNullsLast } = await import('@/lib/server/db');
  const { publicationToApi } = await import('@/lib/server/publications/to-api');
  const { and, inArray, gte, lte } = await import('drizzle-orm');

  const arg = (p: string) => process.argv.find((a) => a.startsWith(p));
  const statusArg = arg('--status=');
  const valid: EStatus[] = ['pending', 'partial', 'failed', 'enriched'];
  const STATUSES = (statusArg ? statusArg.slice(9).split(',') : ['partial'])
    .map((s) => s.trim()).filter(Boolean) as EStatus[];
  if (STATUSES.length === 0 || STATUSES.some((s) => !valid.includes(s))) {
    log(`bad --status (comma-list of: ${valid.join(', ')})`);
    process.exit(1);
  }
  const sinceArg = arg('--since=');
  const SINCE = sinceArg ? sinceArg.slice(8) : null;
  const untilArg = arg('--until=');
  const UNTIL = untilArg ? untilArg.slice(8) : null;
  const maxArg = arg('--max=');
  const maxNum = maxArg ? Number(maxArg.slice(6)) : NaN;
  const MAX = Number.isFinite(maxNum) ? maxNum : Infinity;

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
    if (done % 25 === 0) {
      const rate = done / ((Date.now() - t0) / 1000);
      log(`${done} done · ${rate.toFixed(2)}/s · enriched ${tally.enriched} `
        + `partial ${tally.partial} failed ${tally.failed}`);
    }
  };

  const conds = [inArray(publications.enrichmentStatus, STATUSES)];
  if (SINCE) conds.push(gte(publications.publishedAt, SINCE));
  if (UNTIL) conds.push(lte(publications.publishedAt, UNTIL));

  const rows = await db
    .select()
    .from(publications)
    .where(and(...conds))
    .orderBy(descNullsLast(publications.publishedAt))
    .limit(Number.isFinite(MAX) ? MAX : 100000);

  log(`enrich-retry status=${STATUSES.join(',')}`
    + `${SINCE ? ` since=${SINCE}` : ''}${UNTIL ? ` until=${UNTIL}` : ''}`
    + `${Number.isFinite(MAX) ? ` max=${MAX}` : ''} — ${rows.length} rows`);
  if (rows.length === 0) {
    log('nothing to do');
    return;
  }

  const pubs = rows.map(publicationToApi);
  await runEnrichmentBatch({ pubs, abortSignal: ac.signal, emit });

  log(`DONE — ${done} pubs in ${((Date.now() - t0) / 60000).toFixed(1)} min · `
    + `enriched ${tally.enriched} partial ${tally.partial} failed ${tally.failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export {}; // module scope — keeps the top-level `log` out of the global namespace
