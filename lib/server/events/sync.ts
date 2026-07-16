// Orchestrator for POST /api/events/sync. Pulls upcoming events from WEBDB
// via the typo3-events adapter and UPSERTs into the local Postgres mirror,
// keeping the maintainer-state columns (decision, decided_at, flag_notes,
// created_at) untouched on update — that's the contract that lets the
// sync run as often as the maintainer wants without losing triage.
//
// No repo (`lib/server/repos/events.ts`) yet: per repos/README.md a method
// belongs in a repo only when ≥2 call sites reference the same query shape.
// The two `db` writes below have one consumer each, so they stay inline
// here in the feature layer.

import { and, gte, notInArray, sql } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import {
  fetchTypo3Events,
  normalizeTypo3Event,
  type NormalizedEvent,
} from '@/lib/server/ingest/adapters/typo3-events';
import { fillMissingLocationsViaLlm } from './llm-extract-location';

export interface EventsSyncResult {
  imported: number;
  updated: number;
  pruned: number;
  skipped: number;
  llm_locations_filled: number;
  total_from_mysql: number;
  ms: number;
}

/** Caller-supplied config — the function itself no longer reads getEnv()
 *  so the same code path serves both the HTTP route (which resolves these
 *  from getEnv) and the CLI script (scripts/sync-events.ts, which loads
 *  values from .env.local + ~/.config/oeaw-press-release/prod-credentials
 *  depending on --target). Decoupling at the function boundary keeps the
 *  CLI from triggering the app's full env validator. */
export interface SyncOptions {
  /** WEBDB_MYSQL_HOST. Falsy → early-exit with EventsSyncConfigError. */
  mysqlHost: string | undefined;
  /** EVENTS_LLM_FALLBACK_ENABLED. When true, sync calls the LLM cascade
   *  for events with no extracted location (~12% of rows). */
  llmFallbackEnabled: boolean;
}

/** Thrown when mysqlHost is missing. The API route maps this to a 503
 *  with a friendly message; any other MySQL error (connection refused,
 *  timeout) escapes as a 500 via withApiError so logs catch it. */
export class EventsSyncConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventsSyncConfigError';
  }
}

export interface EventsUpsertResult {
  imported: number;
  updated: number;
}

/** Drizzle-Executor: entweder der Pool-`db` oder eine laufende Transaktion.
 *  Lässt Aufrufer den Upsert in eine größere atomare Einheit ziehen (z. B. der
 *  JSON-Import-Runner, der Upsert + ingest_runs-Journal gemeinsam committet). */
export type EventsDbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Bulk INSERT … ON CONFLICT (webdb_uid) DO UPDATE in a single round-trip.
 *  The maintainer columns (decision, decided_at, flag_notes, created_at) are
 *  omitted from the SET list by construction, so a re-sync from ANY source
 *  never overwrites triage progress.
 *
 *  RE-SCORE ON CONTENT CHANGE: the LLM scoring columns are normally preserved
 *  too, BUT when a re-sync brings genuinely different scoring-relevant content
 *  (title/teaser/bodytext/event_information/event_at) for a STILL-UPCOMING event,
 *  they are reset (analysis_status→'pending', score/dims/text→NULL) so the event
 *  re-enters the candidate pool (event-candidates filters event_score IS NULL) and
 *  gets re-scored — a stale edit shouldn't keep an outdated score. The `event_at
 *  >= NOW()` guard means a past event that gets edited never loses its historical
 *  score (past events are never re-scored). An idempotent re-sync (identical
 *  content) is a no-op via IS DISTINCT FROM, so scores survive normal re-syncs.
 *
 *  `xmax = 0` is Postgres' canonical inserted-vs-updated marker on UPSERT — a
 *  freshly inserted row has xmax = 0, a row updated by the ON CONFLICT branch
 *  carries the current transaction id, so the same RETURNING column tells us
 *  which branch the row took.
 *
 *  Shared by syncUpcomingEvents (WEBDB MySQL) and scripts/import-events-json.ts
 *  (TYPO3 JSON export, Redmine #4165) so the SET list can never drift between
 *  the two ingestion paths. */
export async function upsertEvents(
  normalized: NormalizedEvent[],
  executor: EventsDbExecutor = db,
): Promise<EventsUpsertResult> {
  if (normalized.length === 0) return { imported: 0, updated: 0 };
  // TRUE when this re-sync changes scoring-relevant content of an upcoming event
  // → its cached analysis is stale and must be recomputed.
  const rescore = sql`(
    excluded.event_at >= NOW() AND (
      ${eventsTable.title} IS DISTINCT FROM excluded.title OR
      ${eventsTable.teaser} IS DISTINCT FROM excluded.teaser OR
      ${eventsTable.bodytext} IS DISTINCT FROM excluded.bodytext OR
      ${eventsTable.eventInformation} IS DISTINCT FROM excluded.event_information OR
      ${eventsTable.eventAt} IS DISTINCT FROM excluded.event_at
    )
  )`;
  const upserted = await executor
    .insert(eventsTable)
    .values(normalized)
    .onConflictDoUpdate({
      target: eventsTable.webdbUid,
      set: {
        title: sql`excluded.title`,
        teaser: sql`excluded.teaser`,
        bodytext: sql`excluded.bodytext`,
        eventInformation: sql`excluded.event_information`,
        eventAt: sql`excluded.event_at`,
        eventEndAt: sql`excluded.event_end_at`,
        locationTitle: sql`excluded.location_title`,
        organizerTitle: sql`excluded.organizer_title`,
        institute: sql`excluded.institute`,
        url: sql`excluded.url`,
        lang: sql`excluded.lang`,
        availableLangs: sql`excluded.available_langs`,
        syncedAt: sql`NOW()`,
        // Re-score triggers: reset cached analysis iff content materially changed.
        analysisStatus: sql`CASE WHEN ${rescore} THEN 'pending' ELSE ${eventsTable.analysisStatus} END`,
        eventScore: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.eventScore} END`,
        publicAppeal: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.publicAppeal} END`,
        scientificSignificance: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.scientificSignificance} END`,
        reach: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.reach} END`,
        timeliness: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.timeliness} END`,
        pitchSuggestion: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.pitchSuggestion} END`,
        suggestedAngle: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.suggestedAngle} END`,
        targetAudience: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.targetAudience} END`,
        reasoning: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.reasoning} END`,
        llmModel: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.llmModel} END`,
        analysisCost: sql`CASE WHEN ${rescore} THEN NULL ELSE ${eventsTable.analysisCost} END`,
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });

  const imported = upserted.reduce((n, r) => n + (r.inserted ? 1 : 0), 0);
  return { imported, updated: upserted.length - imported };
}

export async function syncUpcomingEvents(
  options: SyncOptions,
): Promise<EventsSyncResult> {
  const startedAt = Date.now();

  // mysqlHost is opt-in at the env level (boot validator allows it empty
  // because /events stays bedienbar without sync); enforce here at the
  // boundary instead so the read path doesn't carry this dependency.
  if (!options.mysqlHost) {
    throw new EventsSyncConfigError(
      'WEBDB_MYSQL_HOST ist nicht gesetzt — der MySQL-Sync ist deaktiviert. Setze die Variable in .env.local, um Events aus der WEBDB zu ziehen.',
    );
  }

  const rawRows = await fetchTypo3Events();

  const normalized: NormalizedEvent[] = [];
  let skipped = 0;
  for (const raw of rawRows) {
    const n = normalizeTypo3Event(raw);
    if (n) normalized.push(n);
    else skipped++;
  }

  if (normalized.length === 0) {
    return {
      imported: 0,
      updated: 0,
      pruned: 0,
      skipped,
      llm_locations_filled: 0,
      total_from_mysql: rawRows.length,
      ms: Date.now() - startedAt,
    };
  }

  // Phase-2 fallback: ask DeepSeek (via OpenRouter) for the ~12% events
  // whose location the cheerio walker couldn't extract. Off by default;
  // caller decides via SyncOptions.llmFallbackEnabled. Mutates `normalized`
  // in place so the UPSERT below picks up the filled-in locationTitle.
  const llmLocationsFilled = options.llmFallbackEnabled
    ? await fillMissingLocationsViaLlm(normalized)
    : 0;

  // Single-source the UPSERT (and its maintainer/scoring-column omissions) in
  // upsertEvents so this MySQL path and the JSON-export importer can't drift.
  const { imported, updated } = await upsertEvents(normalized);

  // Prune upcoming rows that are NOT in the incoming set. Catches translations
  // we used to mirror separately (l10n_parent>0, now filtered out at the
  // source) and events the editors removed from WebDB. Scoped to `event_at >=
  // NOW()` so past rows keep their triage history. Drizzle's `.returning()`
  // gives us the pruned ids for the result counter; the actual delete is a
  // single round-trip.
  const incomingUids = normalized.map((n) => n.webdbUid);
  const prunedRows = await db
    .delete(eventsTable)
    .where(
      and(
        gte(eventsTable.eventAt, sql`NOW()`),
        notInArray(eventsTable.webdbUid, incomingUids),
      ),
    )
    .returning({ id: eventsTable.id });

  return {
    imported,
    updated,
    pruned: prunedRows.length,
    skipped,
    llm_locations_filled: llmLocationsFilled,
    total_from_mysql: rawRows.length,
    ms: Date.now() - startedAt,
  };
}
