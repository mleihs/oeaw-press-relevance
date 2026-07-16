// Kein `import 'server-only'`: dieser Runner wird auch vom CLI-Wrapper
// scripts/import-publications-delta.ts (tsx) importiert; das server-only-Guard
// würde dort werfen. Der Server-only-Charakter ist über die boundaries-Lint
// (client darf server nicht importieren) + den DB-Zugriff ohnehin gesichert.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { fetchJsonExport } from './fetch-export';
import { parsePublicationsDelta } from './adapters/typo3-publications-delta';
import { extractDoiFromRow } from '@/lib/shared/doi-extract.mjs';

// Wiederverwendbarer Runner fürs inkrementelle Publications-Delta. Extrahiert aus
// scripts/import-publications-delta.ts, damit sowohl der CLI-Wrapper als auch die
// unbeaufsichtigte Route POST /api/ingest/run exakt denselben Pfad fahren:
//   fetch (CF-gehärtet) → parse (DOI single-sourced via lib/shared) →
//   SELECT apply_publications_delta(payload, opts) (atomar; schreibt selbst das
//   ingest_runs-Journal + Cursor) → Matview-Reforstung NACH Commit (CONCURRENTLY
//   kann nicht in die Funktions-Transaktion) nur wenn report.matview_dirty.
//
// Der DOI-Extraktor lebt jetzt in lib/shared (Kernel, dependency-frei) statt in
// scripts/ — so darf ihn sowohl dieser server-Runner als auch der CLI-Wrapper
// importieren, ohne die ADR-0017-Grenze (server importiert nie scripts/**) zu
// verletzen. Der Adapter bleibt pur; der Extraktor wird injiziert.

const DEFAULT_URL =
  'https://www.oeaw.ac.at/fileadmin/exports/publications_incremental_change_2.json';
/** Logischer Cursor-Schlüssel in ingest_runs (NICHT der Dateiname). */
const DEFAULT_FEED = 'publications_incremental_change_2';

export interface PublicationsDeltaRunOptions {
  /** Vorab geladene Export-JSON (z. B. aus --file). Fehlt sie, wird `url` geholt. */
  json?: unknown;
  /** Export-URL, wenn `json` nicht übergeben ist. Default: kanonischer Feed. */
  url?: string;
  /** Cursor-Schlüssel für ingest_runs (Default publications_incremental_change_2). */
  feed?: string;
  /** Delta→Volldump-Guard in apply_publications_delta aushebeln. */
  force?: boolean;
  /** Gescorte Pubs beim Delete behalten (Retention-Override). */
  keepScoredOnDelete?: boolean;
  /** Menschenlesbares Quell-Label fürs Journal/Report. Default: die URL. */
  sourceLabel?: string;
  /** Anwenden + zurückrollen (Preview): kein Write, kein Matview-Refresh. */
  dryRun?: boolean;
}

export interface PublicationsDeltaResult {
  feed: string;
  /** Aus dem Report: 'applied' | 'skipped'. */
  status: string;
  report: Record<string, unknown>;
  /** Nicht-fatale Drift-Signale (Orphans / unaufgelöste Lookups). */
  warnings: string[];
  matviewRefreshed: boolean;
  durationMs: number;
  generatedAt: string | null;
}

/** Sentinel, um die Preview-Transaktion sauber (ohne echten Fehler) zu rollen. */
class DryRunRollback extends Error {}

export async function runPublicationsDeltaImport(
  opts: PublicationsDeltaRunOptions = {},
): Promise<PublicationsDeltaResult> {
  const feed = opts.feed ?? DEFAULT_FEED;
  const url = opts.url ?? DEFAULT_URL;
  const sourceLabel = opts.sourceLabel ?? url;
  const t0 = Date.now();

  const json = opts.json ?? (await fetchJsonExport(url));
  const { payload } = parsePublicationsDelta(
    json as Parameters<typeof parsePublicationsDelta>[0],
    extractDoiFromRow as Parameters<typeof parsePublicationsDelta>[1],
  );

  const applyOpts = {
    feed,
    force: !!opts.force,
    keep_scored_on_delete: !!opts.keepScoredOnDelete,
    source_label: sourceLabel,
  };
  const generatedAt = payload.meta.generated_at_readable ?? null;

  const applySql = sql`SELECT apply_publications_delta(${JSON.stringify(
    payload,
  )}::jsonb, ${JSON.stringify(applyOpts)}::jsonb) AS report`;

  // --- Preview: anwenden + rollback (fängt FK-/Constraint-Fehler ohne Write) --
  if (opts.dryRun) {
    let report: Record<string, unknown> = {};
    try {
      await db.transaction(async (tx) => {
        const rows = await tx.execute<{ report: Record<string, unknown> }>(applySql);
        report = rows[0].report;
        throw new DryRunRollback();
      });
    } catch (err) {
      if (!(err instanceof DryRunRollback)) throw err;
    }
    return {
      feed,
      status: String(report.status ?? 'unknown'),
      report,
      warnings: collectWarnings(report),
      matviewRefreshed: false,
      durationMs: Date.now() - t0,
      generatedAt,
    };
  }

  // --- Echter Lauf: apply (atomar, schreibt Journal + Cursor) -----------------
  const rows = await db.execute<{ report: Record<string, unknown> }>(applySql);
  const report = rows[0].report;

  // Matview-Refresh nach Commit — CONCURRENTLY kann nicht in die Funktions-TX.
  let matviewRefreshed = false;
  if (report.status === 'applied' && report.matview_dirty) {
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY publication_oestat6`);
    matviewRefreshed = true;
  }

  return {
    feed,
    status: String(report.status ?? 'unknown'),
    report,
    warnings: collectWarnings(report),
    matviewRefreshed,
    durationMs: Date.now() - t0,
    generatedAt,
  };
}

/** Nicht-fatale Drift-Signale: nicht auflösbare Junction-Endpunkte (unbekannte
 *  Person/Orgunit) oder fehlende Lookups → eine Voll-Reconciliation ist fällig. */
function collectWarnings(report: Record<string, unknown>): string[] {
  if (report.status !== 'applied') return [];
  const orphans =
    Number(report.person_link_orphans ?? 0) + Number(report.orgunit_link_orphans ?? 0);
  const unresolved =
    Number(report.unresolved_publication_type ?? 0) +
    Number(report.unresolved_member_type ?? 0);
  if (orphans === 0 && unresolved === 0) return [];
  return [
    `${orphans} orphan link(s), ${unresolved} unresolved lookup(s) — ` +
      `likely drift vs. the full corpus; schedule/verify a full reconciliation.`,
  ];
}
