// Kein `import 'server-only'`: dieser Runner wird auch vom CLI-Wrapper
// scripts/import-events-json.ts (tsx) importiert; das server-only-Guard würde
// dort werfen. Server-only ist über boundaries-Lint + DB-Zugriff gesichert.
import { and, eq, sql } from 'drizzle-orm';
import { db, ingestRuns } from '@/lib/server/db';
import { upsertEvents } from '@/lib/server/events/sync';
import { fetchJsonExport } from './fetch-export';
import { parseEventNewsGrouped } from './adapters/typo3-events-json';

// Wiederverwendbarer Runner für den TYPO3-Events-JSON-Export (event_news_grouped,
// Redmine #4165). Extrahiert aus scripts/import-events-json.ts, damit CLI-Wrapper
// und die unbeaufsichtigte Route POST /api/ingest/run denselben Pfad fahren.
//
// NEU ggü. dem Script: ein ingest_runs-Journal für diesen Feed (bisher schreibt
// NUR der Publications-Delta-Importer das Journal). Anders als beim Publications-
// Pfad (eine atomare PG-Funktion apply_publications_delta) folgen Events ADR-0019
// (Single-Table → DB-Write in der Feature-Schicht via Drizzle upsertEvents, keine
// PG-Funktion). Damit „was atomar sein muss, auch atomar ist", laufen Skip-Check +
// Upsert + Journal-Schreiben hier in EINER db.transaction; die Idempotenz stützt
// sich zusätzlich auf die UNIQUE(feed, generated_at_timestamp)-Constraint.
//
// Broken-Feed-Guard (Redmine #4165, Feed war 2026-06-26 upstream leer): parsed===0
// → status 'failed' (+ Journal), damit die Nachtmail zu Recht schreit.

const DEFAULT_URL =
  'https://www.oeaw.ac.at/fileadmin/exports/event_news_grouped.json';
/** Logischer Cursor-Schlüssel in ingest_runs für diesen Feed. */
export const EVENTS_FEED = 'event_news_grouped';

export interface EventsImportRunOptions {
  /** Vorab geladene Export-JSON (z. B. aus --file). Fehlt sie, wird `url` geholt. */
  json?: unknown;
  /** Export-URL, wenn `json` nicht übergeben ist. Default: kanonischer Feed. */
  url?: string;
  /** Menschenlesbares Quell-Label fürs Journal. Default: die URL. */
  sourceLabel?: string;
  /** Parsen + normalisieren, KEIN DB-Write und KEIN Journal. */
  dryRun?: boolean;
}

export interface EventsImportResult {
  feed: string;
  status: 'applied' | 'skipped' | 'failed';
  imported: number;
  updated: number;
  /** Events, die der Adapter aus dem Feed gewonnen hat. */
  parsed: number;
  /** Adapter-Drops (kein verwertbares Startdatum). */
  droppedNoStart: number;
  /** Adapter-Drops (webdb_uid doppelt im selben Batch). */
  duplicates: number;
  institutes: string[];
  generatedAt: string | null;
  generatedAtTimestamp: number | null;
  /** Begründung für skipped/failed. */
  reason?: string;
  durationMs: number;
}

export async function runEventsImport(
  opts: EventsImportRunOptions = {},
): Promise<EventsImportResult> {
  const url = opts.url ?? DEFAULT_URL;
  const sourceLabel = opts.sourceLabel ?? url;
  const t0 = Date.now();

  const json = opts.json ?? (await fetchJsonExport(url));
  const { events, skipped, duplicates, institutes, generatedAt, generatedAtTimestamp } =
    parseEventNewsGrouped(json as Parameters<typeof parseEventNewsGrouped>[0]);

  const base = {
    feed: EVENTS_FEED,
    parsed: events.length,
    droppedNoStart: skipped,
    duplicates,
    institutes,
    generatedAt,
    generatedAtTimestamp,
    durationMs: 0,
  };
  const finish = (
    r: Omit<EventsImportResult, 'durationMs'>,
  ): EventsImportResult => ({ ...r, durationMs: Date.now() - t0 });

  // Dry-Run: nur parsen, nichts schreiben (Journal bleibt unberührt).
  if (opts.dryRun) {
    return finish({
      ...base,
      status: events.length === 0 ? 'failed' : 'applied',
      imported: 0,
      updated: 0,
      reason: events.length === 0 ? 'Feed lieferte 0 Events (dry-run)' : undefined,
    });
  }

  return db.transaction(async (tx) => {
    // Idempotenz: bereits angewandtes (feed, generated_at_timestamp) → Skip.
    // Nur prüfbar, wenn der Feed einen Zeitstempel trägt; die UNIQUE-Constraint
    // ist der eigentliche Race-Schutz beim Journal-Insert unten.
    if (generatedAtTimestamp != null) {
      const existing = await tx
        .select({ id: ingestRuns.id })
        .from(ingestRuns)
        .where(
          and(
            eq(ingestRuns.feed, EVENTS_FEED),
            eq(ingestRuns.generatedAtTimestamp, generatedAtTimestamp),
            eq(ingestRuns.status, 'applied'),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        return finish({
          ...base,
          status: 'skipped',
          imported: 0,
          updated: 0,
          reason: 'already_applied',
        });
      }
    }

    // Broken-Feed-Guard: 0 Events → 'failed' journalisieren (schreit per Mail).
    if (events.length === 0) {
      await journal(tx, {
        status: 'failed',
        generatedAtTimestamp,
        generatedAt,
        sourceLabel,
        report: { reason: 'parsed_zero', parsed: 0 },
      });
      return finish({
        ...base,
        status: 'failed',
        imported: 0,
        updated: 0,
        reason: 'Feed lieferte 0 Events',
      });
    }

    // Upsert (Drizzle, ADR-0019) + Journal — atomar in derselben Transaktion.
    const { imported, updated } = await upsertEvents(events, tx);
    await journal(tx, {
      status: 'applied',
      generatedAtTimestamp,
      generatedAt,
      sourceLabel,
      report: {
        imported,
        updated,
        parsed: events.length,
        dropped_no_start: skipped,
        duplicates,
        institutes,
      },
    });
    return finish({
      ...base,
      status: 'applied',
      imported,
      updated,
    });
  });
}

/** Schreibt/aktualisiert die ingest_runs-Zeile für diesen Feed. `generated_at_
 *  timestamp` ist NOT NULL — fehlt er im Feed, fällt der Cursor auf 0 zurück
 *  (degradiert: kein echter High-Water-Mark, aber der letzte Lauf ist erfasst).
 *  ON CONFLICT (feed, ts) DO UPDATE hält den Insert idempotent/race-fest. */
async function journal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  args: {
    status: 'applied' | 'failed';
    generatedAtTimestamp: number | null;
    generatedAt: string | null;
    sourceLabel: string;
    report: Record<string, unknown>;
  },
): Promise<void> {
  await tx
    .insert(ingestRuns)
    .values({
      feed: EVENTS_FEED,
      generatedAtTimestamp: args.generatedAtTimestamp ?? 0,
      generatedAtReadable: args.generatedAt,
      status: args.status,
      sourceLabel: args.sourceLabel,
      report: args.report,
    })
    .onConflictDoUpdate({
      target: [ingestRuns.feed, ingestRuns.generatedAtTimestamp],
      set: {
        appliedAt: sql`now()`,
        status: args.status,
        generatedAtReadable: args.generatedAt,
        sourceLabel: args.sourceLabel,
        report: args.report,
      },
    });
}
