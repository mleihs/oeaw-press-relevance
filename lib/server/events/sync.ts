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
import { getEnv } from '@/lib/server/env';
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

/** Thrown when WEBDB_MYSQL_HOST is unset. The API route maps this to a 503
 *  with a friendly message; any other MySQL error (connection refused,
 *  timeout) escapes as a 500 via withApiError so logs catch it. */
export class EventsSyncConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EventsSyncConfigError';
  }
}

export async function syncUpcomingEvents(): Promise<EventsSyncResult> {
  const startedAt = Date.now();

  // Boot-time env validator allows WEBDB_MYSQL_HOST to be empty (the sync
  // is opt-in); validate at the request boundary instead so /events still
  // works in read-only mode without it.
  if (!getEnv().WEBDB_MYSQL_HOST) {
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
  // enable via EVENTS_LLM_FALLBACK_ENABLED. Mutates `normalized` in place
  // so the UPSERT below picks up the filled-in locationTitle.
  const llmLocationsFilled = getEnv().EVENTS_LLM_FALLBACK_ENABLED
    ? await fillMissingLocationsViaLlm(normalized)
    : 0;

  // One bulk INSERT … ON CONFLICT DO UPDATE in a single round-trip. The
  // maintainer columns (decision, decided_at, flag_notes, created_at) are
  // omitted from the SET list by construction, so a re-sync never overwrites
  // triage progress. `xmax = 0` is Postgres' canonical inserted-vs-updated
  // marker on UPSERT — a freshly inserted row has xmax = 0, a row updated by
  // the ON CONFLICT branch carries the current transaction id, so the same
  // RETURNING column tells us which branch the row took.
  const upserted = await db
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
      },
    })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });

  const imported = upserted.reduce((n, r) => n + (r.inserted ? 1 : 0), 0);
  const updated = upserted.length - imported;

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
