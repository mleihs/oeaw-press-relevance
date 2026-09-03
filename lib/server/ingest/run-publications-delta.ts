// Kein `import 'server-only'`: dieser Runner wird auch vom CLI-Wrapper
// scripts/import-publications-delta.ts (tsx) importiert; das server-only-Guard
// würde dort werfen. Der Server-only-Charakter ist über die boundaries-Lint
// (client darf server nicht importieren) + den DB-Zugriff ohnehin gesichert.
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { alarmRelevantDrift, PERSON_ORPHAN_COLLAPSE_THRESHOLD } from './classify-run';
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
  /** Anzahl der Drift-Signale — die Route eskaliert erst ab einer Schwelle. */
  driftTotal: number;
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
      driftTotal: countDrift(report),
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
    driftTotal: countDrift(report),
    matviewRefreshed,
    durationMs: Date.now() - t0,
    generatedAt,
  };
}

/** Report-Werte defensiv lesen (gleiches Idiom wie `num()` in drift.ts): ein
 *  nicht-numerischer Report-Wert ergäbe sonst NaN, und `NaN >= Schwelle` ist
 *  false — die Alarm-Kette wäre fail-open. */
const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/** Alarm-relevante Drift-Signale: Orgunit-Waisen plus fehlende Lookups.
 *
 *  Personen-Waisen zählen nicht mit — AUSSER ab der Kollaps-Schwelle. Die
 *  Regel samt Begründung lebt single-sourced in `alarmRelevantDrift`
 *  (classify-run.ts); hier kommt nur das status-Gate dazu. */
export function countDrift(report: Record<string, unknown>): number {
  if (report.status !== 'applied') return 0;
  return alarmRelevantDrift(report);
}

function collectWarnings(report: Record<string, unknown>): string[] {
  if (report.status !== 'applied') return [];
  const warnings: string[] = [];
  // Handlungsrelevante Warnungen ZUERST: buildSummary (classify-run.ts) hebt
  // nur warnings[0] in Betreffzeile/Journal — die harmlose Personen-Notiz
  // („kein Handlungsbedarf") darf die eigentliche Diagnose nicht verdrängen.
  const orgunitOrphans = num(report.orgunit_link_orphans);
  const unresolved =
    num(report.unresolved_publication_type) + num(report.unresolved_member_type);
  if (orgunitOrphans + unresolved > 0) {
    warnings.push(
      `${orgunitOrphans} orgunit orphan link(s), ${unresolved} unresolved lookup(s): ` +
        `likely drift vs. the full corpus; schedule/verify a full reconciliation.`,
    );
  }
  const personOrphans = num(report.person_link_orphans);
  if (personOrphans >= PERSON_ORPHAN_COLLAPSE_THRESHOLD) {
    // Kollaps-Guard (alarmRelevantDrift zählt diese Fälle auch zur Drift):
    // das ist kein WebDB-Rauschen mehr, sondern verschwindende Autorenschaften.
    warnings.push(
      `${personOrphans} Autoren-Verknüpfung(en) ohne Personensatz — weit über dem ` +
        `WebDB-Normalrauschen (Kollaps-Schwelle ${PERSON_ORPHAN_COLLAPSE_THRESHOLD}): ` +
        `mutmaßlich kollabierter Personen-Korpus im Export; Rohexport prüfen und ` +
        `per \`--force\` aus dem Archiv nachziehen.`,
    );
  } else if (personOrphans > 0) {
    warnings.push(
      `${personOrphans} Autoren-Verknüpfung(en) auf nie gelieferte Personensätze ` +
        `(WebDB-Personenlücke, docs/WEBDB_PERSON_GAP.md) — kein Handlungsbedarf.`,
    );
  }
  return warnings;
}
