#!/usr/bin/env tsx
// CLI: inkrementelles Publications-Delta importieren.
//
// Quelle: https://www.oeaw.ac.at/fileadmin/exports/publications_incremental_change_2.json
//   { meta, data:{ records_to_delete, records_to_add_or_update } } (rohe TYPO3-
//   Tabellen publication/person/personpublication/orgunitpublication).
//
// Aufteilung (Vorgabe „Logik gehört nach Postgres"):
//   - HIER (TS): CF-gehärteter Fetch, Werte-Normalisierung (DOI via
//     scripts/lib/doi-extract.mjs, single-sourced; Datum/Sentinels; In-Batch-
//     DOI-Dedupe; deleted:"1"-Routing) → normalisierte jsonb-Payload.
//   - DB-Funktion apply_publications_delta(payload, opts): die GESAMTE
//     relationale Logik atomar (Upsert per webdb_uid, FK-Auflösung, Junction-
//     Delete, Soft-Archive, Scored-Retention, Orphan-Zählung, Guards, scoped
//     is_ita, Bestands-Backfills, Cursor). Ein SELECT ist all-or-nothing.
//   - HIER wieder: der Matview-Refresh (CONCURRENTLY kann nicht in die Funktion),
//     NUR nach erfolgreichem Commit und nur wenn report.matview_dirty.
//
// Neue Zeilen landen mit analysis_status='pending' (Spalten-Default) und werden
// vom bestehenden In-Chat-Scoring aufgegriffen. Scoring/Enrichment sind NICHT
// Teil dieses Importers.
//
// Usage:
//   npm run import-publications-delta -- --dry-run            # local, live URL, kein Write
//   npm run import-publications-delta -- --file=./delta.json  # lokale Datei
//   npm run import-publications-delta -- --target=prod --yes  # prod, unbeaufsichtigt
//   Flags: --force (Delta→Volldump-Guard aushebeln), --keep-scored-on-delete

import { readFileSync } from 'node:fs';
import { extractDoiFromRow } from './lib/doi-extract.mjs';
import { connectDb, loadDbUrl, parseScriptArgs, confirmProd, redactedDatabaseUrl } from './lib/db.mjs';

const { target, flags } = parseScriptArgs();
const isProd = target === 'prod';

process.loadEnvFile('.env.local');
process.env.DATABASE_URL = loadDbUrl(target);

const DEFAULT_URL =
  'https://www.oeaw.ac.at/fileadmin/exports/publications_incremental_change_2.json';
const dryRun = flags.includes('--dry-run');
const force = flags.includes('--force');
const keepScoredOnDelete = flags.includes('--keep-scored-on-delete');
const flagValue = (name: string): string | undefined =>
  flags.find((f) => f.startsWith(`${name}=`))?.slice(name.length + 1);
const fileArg = flagValue('--file');
const urlArg = flagValue('--url');
const source = fileArg ?? urlArg ?? DEFAULT_URL;
const sourceLabel = fileArg ? `file:${fileArg}` : source;
// Feed = logischer Cursor-Schlüssel (NICHT der Dateiname): standardmäßig der
// kanonische Feed. Beim Testen mit --file mit --feed=… isolieren, damit man den
// echten Prod-Cursor nicht berührt.
const feed = flagValue('--feed') ?? 'publications_incremental_change_2';

async function loadExport(): Promise<unknown> {
  if (fileArg) return JSON.parse(readFileSync(fileArg, 'utf-8'));
  const { fetchJsonExport } = await import('@/lib/server/ingest/fetch-export');
  return fetchJsonExport(urlArg ?? DEFAULT_URL);
}

async function main(): Promise<void> {
  if (!dryRun) await confirmProd({ isProd, flags, label: 'import-publications-delta' });

  // Reiner Adapter zuerst (kein DB-Load nötig).
  const { parsePublicationsDelta } = await import(
    '@/lib/server/ingest/adapters/typo3-publications-delta'
  );

  const json = await loadExport();
  const { payload, stats } = parsePublicationsDelta(
    json as Parameters<typeof parsePublicationsDelta>[0],
    extractDoiFromRow as Parameters<typeof parsePublicationsDelta>[1],
  );

  const u = payload.upsert;
  const d = payload.delete;
  console.log(
    `[import-publications-delta] target=${target} db=${redactedDatabaseUrl()} source=${sourceLabel} feed=${feed}`,
  );
  console.log(
    `[import-publications-delta] generated_at=${payload.meta.generated_at_readable ?? '?'} ` +
      `(ts=${payload.meta.generated_at_timestamp ?? '?'})`,
  );
  console.log(
    `[import-publications-delta] upsert: pubs=${u.publications.length} persons=${u.persons.length} ` +
      `person_links=${u.person_publications.length} orgunit_links=${u.orgunit_publications.length} | ` +
      `delete: pubs=${d.publications.length} persons=${d.persons.length} ` +
      `person_links=${d.person_publications.length} orgunit_links=${d.orgunit_publications.length}`,
  );
  console.log(
    `[import-publications-delta] adapter stats: routedDeletedPubs=${stats.routedDeletedPublications} ` +
      `routedDeletedPersons=${stats.routedDeletedPersons} dedupedDois=${stats.dedupedDois} ` +
      `dupPubs=${stats.duplicatePublications} dupPersons=${stats.duplicatePersons}`,
  );

  const opts = {
    feed,
    force,
    keep_scored_on_delete: keepScoredOnDelete,
    source_label: sourceLabel,
  };

  const client = await connectDb({ target });
  const t0 = Date.now();
  try {
    if (dryRun) {
      // Voll auflösen + anwenden, dann zurückrollen — fängt FK-/Constraint-
      // Fehler, die ein reiner Preview verpasst, schreibt aber nichts.
      await client.query('BEGIN');
      const { rows } = await client.query(
        'SELECT apply_publications_delta($1::jsonb, $2::jsonb) AS report',
        [JSON.stringify(payload), JSON.stringify(opts)],
      );
      await client.query('ROLLBACK');
      console.log('[import-publications-delta] --dry-run (rolled back). Report:');
      console.log(JSON.stringify(rows[0].report, null, 2));
      return;
    }

    const { rows } = await client.query(
      'SELECT apply_publications_delta($1::jsonb, $2::jsonb) AS report',
      [JSON.stringify(payload), JSON.stringify(opts)],
    );
    const report = rows[0].report as Record<string, number | string | boolean>;
    console.log(`[import-publications-delta] ${report.status} in ${Date.now() - t0}ms. Report:`);
    console.log(JSON.stringify(report, null, 2));

    // Drift-Signal: nicht auflösbare Junction-Endpunkte (unbekannte Person/
    // Orgunit) oder fehlende Lookups → eine Voll-Reconciliation ist fällig.
    const orphans = Number(report.person_link_orphans ?? 0) + Number(report.orgunit_link_orphans ?? 0);
    const unresolved =
      Number(report.unresolved_publication_type ?? 0) + Number(report.unresolved_member_type ?? 0);
    if (report.status === 'applied' && (orphans > 0 || unresolved > 0)) {
      console.warn(
        `[import-publications-delta] WARN: ${orphans} orphan link(s), ${unresolved} unresolved lookup(s) — ` +
          `likely drift vs. the full corpus; schedule/verify a full reconciliation.`,
      );
    }

    if (report.status === 'applied' && report.matview_dirty) {
      // CONCURRENTLY kann nicht in die Funktions-Transaktion — nach Commit.
      const tr = Date.now();
      await client.query('REFRESH MATERIALIZED VIEW CONCURRENTLY publication_oestat6');
      console.log(`[import-publications-delta] refreshed publication_oestat6 in ${Date.now() - tr}ms`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[import-publications-delta] failed:', err);
  process.exit(1);
});
