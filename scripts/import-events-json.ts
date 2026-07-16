#!/usr/bin/env tsx
// CLI-Wrapper: kommende Events aus dem kanonischen TYPO3-JSON-Export importieren
// (https://www.oeaw.ac.at/fileadmin/exports/event_news_grouped.json, OeAW/Florian,
// Redmine #4165).
//
// Dünner Wrapper um lib/server/ingest/run-events-import.ts (runEventsImport) —
// DIESELBE Logik, die auch die unbeaufsichtigte Route POST /api/ingest/run fährt.
// Der Wrapper macht nur das CLI-Drumherum: Flags, Target→DATABASE_URL, confirmProd.
//
// Der Runner erzeugt dieselbe NormalizedEvent-Form wie scripts/sync-events.ts und
// nutzt denselben UPSERT (upsertEvents, conflict key webdb_uid) — Betreuer-State
// (decision, flag_notes) und LLM-Scores überleben Re-Runs identisch. UPSERT-ONLY
// (kein Prune). Neu ggü. früher: der Runner journalisiert den Lauf in ingest_runs
// (Feed event_news_grouped) und markiert einen 0-Events-Feed als 'failed'.
//
// Usage:
//   npm run import-events-json                          # → local (.env.local), live URL
//   npm run import-events-json -- --dry-run             # parse + normalise, NO DB write
//   npm run import-events-json -- --file=./ev.json      # local file instead of the URL
//   npm run import-events-json -- --url=https://…       # override the source URL
//   npm run import-events-json -- --target=prod --yes   # → prod (unattended)

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

async function main(): Promise<void> {
  if (!dryRun) await confirmProd({ isProd, flags, label: 'import-events-json' });

  console.log(
    `[import-events-json] target=${target} db=${redactedDatabaseUrl()} source=${sourceLabel}`,
  );

  // Dynamischer Import NACH dem DATABASE_URL-Override (Runner → App-Drizzle).
  const { runEventsImport } = await import('@/lib/server/ingest/run-events-import');

  const source = fileArg
    ? { json: JSON.parse(readFileSync(fileArg, 'utf-8')) as unknown }
    : { url: urlArg ?? DEFAULT_URL };

  const result = await runEventsImport({ ...source, sourceLabel, dryRun });

  console.log(
    `[import-events-json] export generated_at=${result.generatedAt ?? '?'} ` +
      `institutes=[${result.institutes.join(', ') || '—'}]`,
  );
  console.log(
    `[import-events-json] parsed=${result.parsed} droppedNoStart=${result.droppedNoStart} ` +
      `duplicates=${result.duplicates}`,
  );
  console.log(
    `[import-events-json] ${result.status} in ${result.durationMs}ms: ` +
      `imported=${result.imported} updated=${result.updated}` +
      (result.reason ? ` (${result.reason})` : '') +
      (dryRun ? ' [--dry-run, no write]' : ''),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[import-events-json] failed:', err);
    process.exit(1);
  });
