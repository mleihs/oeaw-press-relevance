#!/usr/bin/env tsx
// CLI-Wrapper: inkrementelles Publications-Delta importieren.
//
// Dünner Wrapper um lib/server/ingest/run-publications-delta.ts
// (runPublicationsDeltaImport) — DIESELBE Logik, die auch die unbeaufsichtigte
// Route POST /api/ingest/run fährt. Der Wrapper macht nur das CLI-Drumherum:
// Flags parsen, Target→DATABASE_URL auflösen, confirmProd, Report ausgeben.
//
// Quelle: https://www.oeaw.ac.at/fileadmin/exports/publications_incremental_change_2.json
//   { meta, data:{ records_to_delete, records_to_add_or_update } } (rohe TYPO3-
//   Tabellen publication/person/personpublication/orgunitpublication).
//
// Die gesamte relationale Logik lebt in Postgres (apply_publications_delta,
// all-or-nothing; schreibt selbst das ingest_runs-Journal + Cursor); der Runner
// macht Fetch (CF-gehärtet) → Parse (DOI single-sourced) → SELECT → Matview-
// Refresh NACH Commit. Neue Zeilen landen analysis_status='pending' und werden
// vom bestehenden In-Chat-Scoring aufgegriffen (Scoring ist NICHT Teil hiervon).
//
// Usage:
//   npm run import-publications-delta -- --dry-run            # local, live URL, kein Write
//   npm run import-publications-delta -- --file=./delta.json  # lokale Datei
//   npm run import-publications-delta -- --target=prod --yes  # prod, unbeaufsichtigt
//   Flags: --force (Delta→Volldump-Guard aushebeln), --keep-scored-on-delete

import { readFileSync } from 'node:fs';
import { loadDbUrl, parseScriptArgs, confirmProd, redactedDatabaseUrl } from './lib/db.mjs';
import { initScriptSentry, captureScriptError, flushAndExit } from './lib/sentry.mjs';

const { target, flags } = parseScriptArgs();
const isProd = target === 'prod';

process.loadEnvFile('.env.local');
process.env.DATABASE_URL = loadDbUrl(target);
initScriptSentry('import-publications-delta');

const DEFAULT_URL =
  'https://www.oeaw.ac.at/fileadmin/exports/publications_incremental_change_2.json';
const dryRun = flags.includes('--dry-run');
const force = flags.includes('--force');
const keepScoredOnDelete = flags.includes('--keep-scored-on-delete');
const flagValue = (name: string): string | undefined =>
  flags.find((f) => f.startsWith(`${name}=`))?.slice(name.length + 1);
const fileArg = flagValue('--file');
const urlArg = flagValue('--url');
const sourceLabel = fileArg ? `file:${fileArg}` : (urlArg ?? DEFAULT_URL);
// Feed = logischer Cursor-Schlüssel (NICHT der Dateiname): standardmäßig der
// kanonische Feed. Beim Testen mit --file mit --feed=… isolieren, damit man den
// echten Prod-Cursor nicht berührt.
const feed = flagValue('--feed') ?? 'publications_incremental_change_2';

async function main(): Promise<void> {
  if (!dryRun) await confirmProd({ isProd, flags, label: 'import-publications-delta' });

  console.log(
    `[import-publications-delta] target=${target} db=${redactedDatabaseUrl()} source=${sourceLabel} feed=${feed}`,
  );

  // Dynamischer Import NACH dem DATABASE_URL-Override (der Runner zieht die
  // App-Drizzle-Verbindung, die DATABASE_URL beim Laden liest).
  const { runPublicationsDeltaImport } = await import(
    '@/lib/server/ingest/run-publications-delta'
  );

  const source = fileArg
    ? { json: JSON.parse(readFileSync(fileArg, 'utf-8')) as unknown }
    : { url: urlArg ?? DEFAULT_URL };

  const result = await runPublicationsDeltaImport({
    ...source,
    feed,
    force,
    keepScoredOnDelete,
    sourceLabel,
    dryRun,
  });

  console.log(`[import-publications-delta] generated_at=${result.generatedAt ?? '?'}`);
  console.log(
    `[import-publications-delta] ${result.status} in ${result.durationMs}ms.` +
      (dryRun ? ' (--dry-run, rolled back)' : '') +
      (result.matviewRefreshed ? ' [publication_oestat6 refreshed]' : '') +
      ' Report:',
  );
  console.log(JSON.stringify(result.report, null, 2));
  for (const w of result.warnings) {
    console.warn(`[import-publications-delta] WARN: ${w}`);
  }
}

main()
  .then(() => flushAndExit(0))
  .catch((err: unknown) => {
    console.error('[import-publications-delta] failed:', err);
    captureScriptError(err);
    void flushAndExit(1);
  });
