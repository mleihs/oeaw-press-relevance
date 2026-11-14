#!/usr/bin/env tsx
// Backfill publications.crossref_date_parts für den Bestand, damit die generierte
// Spalte published_at_precision echte 1./15. von aufgefüllten unterscheiden kann
// (Regeln: supabase/migrations/20261029000001_published_at_precision.sql). Neue
// Publikationen bekommen die date-parts über die Anreicherung (batch.ts).
//
// Default: nur Datensätze, bei denen es zählt (DOI, Tag 1 oder 15). Wiederaufnehmbar
// und idempotent: schreibt nur, wo crossref_date_parts noch NULL ist. Ein 404 wird
// als `[]` vermerkt (nachgesehen, nichts gefunden), damit ein zweiter Lauf ihn
// nicht erneut anfragt; Fehler 429/5xx und Timeouts bleiben NULL.
//
// Usage:
//   npm run backfill-crossref-dates -- --dry-run                 # nur zählen
//   npm run backfill-crossref-dates -- --target=prod --yes --max=200
//   npm run backfill-crossref-dates -- --target=prod --yes --all # jede DOI

import { bootstrapScript, redactedDatabaseUrl, captureScriptError, flushAndExit } from './lib/bootstrap';

const { target, flags, confirmProd } = bootstrapScript('backfill-crossref-dates');

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
// CrossRef Polite Pool: x-concurrency-limit 3 (gemessen 2026-10-29); mit 4
// kam jede sechste Anfrage als 429 zurück.
const CONCURRENCY = 2;

async function main(): Promise<void> {
  const dryRun = flags.includes('--dry-run');
  const all = flags.includes('--all');
  const maxArg = flags.find((f) => f.startsWith('--max='));
  const max = maxArg ? Number(maxArg.slice(6)) : Infinity;

  const { sql } = await import('drizzle-orm');
  const { db } = await import('@/lib/server/db');
  const { cleanDoi } = await import('@/lib/shared/doi-utils');
  const { crossRefDateParts } = await import('@/lib/server/enrichment/crossref');
  const { politeUserAgent } = await import('@/lib/server/http-client');
  const { mapPool } = await import('@/lib/shared/concurrency');

  log(`target=${target} db=${redactedDatabaseUrl()} ${all ? 'alle DOIs' : 'nur Tag 1/15'}${dryRun ? ' [DRY-RUN]' : ''}`);
  const rows = (await db.execute(sql`
    SELECT id, doi FROM publications
    WHERE NOT archived AND crossref_date_parts IS NULL
      AND COALESCE(doi, '') <> '' AND published_at IS NOT NULL
      AND (${all} OR extract(day FROM published_at) IN (1, 15))
    ORDER BY published_at DESC`)) as unknown as { id: string; doi: string }[];
  const todo = rows.slice(0, max);
  log(`${rows.length} Kandidaten, dieser Lauf: ${todo.length}`);
  if (dryRun || todo.length === 0) return;
  await confirmProd('backfill-crossref-dates');

  type Tally = { p: string | null; n: string }[];
  const ids = sql.param(todo.map((r) => r.id));
  const tally = async () => (await db.execute(sql`
    SELECT published_at_precision p, count(*) n FROM publications
    WHERE id = ANY(${ids}::uuid[]) GROUP BY 1`)) as unknown as Tally;
  const before = await tally();

  let done = 0, written = 0, notFound = 0, errors = 0;
  await mapPool(todo, CONCURRENCY, async (r) => {
    const doi = cleanDoi(r.doi);
    let parts: number[][] | null = null;
    try {
      if (!doi) throw new Error('keine DOI');
      const get = () => fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
        headers: { 'User-Agent': politeUserAgent() },
        signal: AbortSignal.timeout(15_000),
      });
      let res = await get();
      if (res.status === 429) {
        await new Promise((ok) => setTimeout(ok, 2_000));
        res = await get();
      }
      if (res.status === 404) {
        parts = [];
        notFound += 1;
      } else if (res.ok) {
        parts = crossRefDateParts((await res.json())?.message ?? {}) ?? [];
      } else {
        errors += 1;
      }
    } catch {
      errors += 1;
    }
    if (parts) {
      await db.execute(sql`
        UPDATE publications SET crossref_date_parts = ${JSON.stringify(parts)}::jsonb
        WHERE id = ${r.id} AND crossref_date_parts IS NULL`);
      written += 1;
    }
    done += 1;
    if (done % 200 === 0) log(`${done}/${todo.length} · geschrieben ${written} (404: ${notFound}) · Fehler ${errors}`);
  });

  const after = await tally();
  const fmt = (xs: Tally) => xs.map((x) => `${x.p}=${x.n}`).sort().join(' ');
  log(`FERTIG ${done} · geschrieben ${written} (404: ${notFound}) · Fehler ${errors} (bleiben NULL)`);
  log(`Genauigkeit vorher: ${fmt(before)}`);
  log(`Genauigkeit nachher: ${fmt(after)}`);
}

main()
  .then(() => flushAndExit(0))
  .catch((err: unknown) => {
    console.error('[backfill-crossref-dates] failed:', err);
    captureScriptError(err);
    void flushAndExit(1);
  });
