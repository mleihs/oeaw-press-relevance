#!/usr/bin/env tsx
// CLI: import upcoming events from the canonical TYPO3 JSON export
// (https://www.oeaw.ac.at/fileadmin/exports/event_news_grouped.json, OeAW/Florian,
// Redmine #4165) into the events table. Parallel ingestion path to
// scripts/sync-events.ts (which reads the WEBDB MySQL): it produces the SAME
// NormalizedEvent shape and reuses the SAME UPSERT (lib/server/events/sync.ts →
// upsertEvents, conflict key webdb_uid), so maintainer state (decision, flag_notes)
// and LLM scores survive re-runs identically.
//
// UPDATES, not just inserts: the export is meant to carry CHANGED events (same
// webdb_uid) too, and the ON CONFLICT DO UPDATE overwrites their WebDB-owned
// columns while preserving analysis/decision — no insert-only assumption.
//
// UPSERT-ONLY — unlike the MySQL sync this does NOT prune events missing from the
// feed. The export is grouped per-institute (GMI, MBI, ÖAI, IQOQI, …) and may be
// partial; a global prune would delete other institutes' future events, and a
// per-institute prune is unsafe until the export is known to be complete. The feed
// has no records_to_delete section, so cancellations are not signalled here — they
// heal via the periodic full reconciliation (sync-events prune). Add a scoped
// prune / delete-path once the export gains a delta structure (Redmine #4165).
//
// Imported events land with analysis_status='pending' / event_score=NULL (column
// defaults, never set here) so they become scoring candidates automatically
// (scripts/event-candidates.mjs → apply-event-scores, or npm run analyze-events).
//
// Usage:
//   npm run import-events-json                          # → local (.env.local), live URL
//   npm run import-events-json -- --dry-run             # parse + normalise, NO DB write
//   npm run import-events-json -- --file=./ev.json      # local file instead of the URL
//   npm run import-events-json -- --url=https://…       # override the source URL
//   npm run import-events-json -- --target=prod --yes   # → prod Supabase (unattended)

import { readFileSync } from 'node:fs';
import { loadDbUrl, parseScriptArgs, confirmProd, redactedDatabaseUrl } from './lib/db.mjs';

const { target, flags } = parseScriptArgs();
const isProd = target === 'prod';

process.loadEnvFile('.env.local');
process.env.DATABASE_URL = loadDbUrl(target);

const DEFAULT_URL =
  'https://www.oeaw.ac.at/fileadmin/exports/event_news_grouped.json';
const dryRun = flags.includes('--dry-run');
const flagValue = (name: string): string | undefined =>
  flags.find((f) => f.startsWith(`${name}=`))?.slice(name.length + 1);
const fileArg = flagValue('--file');
const urlArg = flagValue('--url');
const sourceLabel = fileArg ? `file:${fileArg}` : (urlArg ?? DEFAULT_URL);

async function loadExport(): Promise<unknown> {
  if (fileArg) return JSON.parse(readFileSync(fileArg, 'utf-8'));
  // Shared CF-hardened fetch: fails loudly on a Cloudflare challenge / HTML page
  // instead of a cryptic JSON parse error deep in the adapter.
  const { fetchJsonExport } = await import('@/lib/server/ingest/fetch-export');
  return fetchJsonExport(urlArg ?? DEFAULT_URL);
}

async function main(): Promise<void> {
  if (!dryRun) await confirmProd({ isProd, flags, label: 'import-events-json' });

  // Pure adapter — safe to import before the DB module loads.
  const { parseEventNewsGrouped } = await import(
    '@/lib/server/ingest/adapters/typo3-events-json'
  );

  const json = await loadExport();
  const { events, skipped, duplicates, institutes, generatedAt } =
    parseEventNewsGrouped(json as Parameters<typeof parseEventNewsGrouped>[0]);

  console.log(
    `[import-events-json] target=${target} db=${redactedDatabaseUrl()} source=${sourceLabel}`,
  );
  console.log(
    `[import-events-json] export generated_at=${generatedAt ?? '?'} institutes=[${institutes.join(', ') || '—'}]`,
  );
  console.log(
    `[import-events-json] parsed=${events.length} skipped=${skipped} duplicates=${duplicates}`,
  );

  if (dryRun) {
    console.log('[import-events-json] --dry-run: no DB write. First rows:');
    console.log(JSON.stringify(events.slice(0, 3), null, 2));
    return;
  }
  if (events.length === 0) {
    console.log('[import-events-json] nothing to upsert.');
    return;
  }

  // Dynamic import AFTER the DATABASE_URL override (Drizzle reads it at load).
  const { upsertEvents } = await import('@/lib/server/events/sync');
  const t0 = Date.now();
  const { imported, updated } = await upsertEvents(events);
  console.log(
    `[import-events-json] done in ${Date.now() - t0}ms: imported=${imported} updated=${updated} (upsert-only, no prune)`,
  );
}

main().catch((err: unknown) => {
  console.error('[import-events-json] failed:', err);
  process.exit(1);
});
