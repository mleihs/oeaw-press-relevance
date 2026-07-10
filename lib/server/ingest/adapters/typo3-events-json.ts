// TYPO3-events JSON-export adapter. Pure transform: parses the grouped JSON
// export that OeAW/Florian publishes (Redmine #4165,
// https://www.oeaw.ac.at/fileadmin/exports/event_news_grouped.json) into the
// same NormalizedEvent shape the WEBDB-MySQL adapter (./typo3-events) produces,
// so both feed the identical UPSERT in lib/server/events/sync.ts.
//
// Export shape:
//   { meta: { generated_at_timestamp, generated_at_readable },
//     data: { "<INSTITUTE>": { events: [ { uid, datetime, ... } ] }, ... } }
// The data key (e.g. "GMI") is the institute label and maps straight to the
// events.institute TEXT column — no orgunit FK.
//
// Compared to the MySQL adapter the export is "thinner": it carries no
// sys_language_uid (→ lang/availableLangs unknown), no externalurl/internalurl
// (→ url null; see typo3-events.buildUrl for why path_segment is NOT faked into
// a URL), and no bodytext. Those become null/[] here and can be enriched once
// the export grows. No DB, no network, no clock — trivially unit-testable.

import { tsTimestamp, nullIfEmpty } from './webdb-normalize';
import {
  extractLocationFromEventInfo,
  type NormalizedEvent,
} from './typo3-events';

/** A single event object inside `data.<INSTITUTE>.events`. Only `uid`,
 *  `title` and `datetime` are relied on; the rest are best-effort. */
export interface RawJsonEvent {
  uid: number;
  pid?: number;
  title: string;
  datetime: number;
  event_end?: number | null;
  full_day?: number;
  organizer_simple?: string | null;
  location_simple?: string | null;
  teaser?: string | null;
  path_segment?: string | null;
  event_information?: string | null;
}

/** Either `{ events: [...] }` (current shape) or a bare array — tolerated so a
 *  future flattening of the export doesn't silently import zero rows. */
type InstituteGroup = { events?: RawJsonEvent[] } | RawJsonEvent[];

export interface EventNewsGroupedExport {
  meta?: {
    generated_at_timestamp?: number;
    generated_at_readable?: string;
  };
  data?: Record<string, InstituteGroup>;
}

export interface ParsedEventExport {
  events: NormalizedEvent[];
  /** rows dropped for a non-positive `datetime` (no usable start). */
  skipped: number;
  /** rows dropped because their webdb_uid already appeared (first wins). */
  duplicates: number;
  /** institute group keys seen, in export order. */
  institutes: string[];
  generatedAt: string | null;
}

/** Pure transform of one raw export event. Returns null when the row has no
 *  usable start (`datetime <= 0`), mirroring normalizeTypo3Event so callers
 *  count it as `skipped` rather than failing the whole import. */
export function normalizeJsonEvent(
  raw: RawJsonEvent,
  institute: string | null,
): NormalizedEvent | null {
  const eventAt = tsTimestamp(raw.datetime);
  if (!eventAt) return null;
  const eventInformation = nullIfEmpty(raw.event_information ?? null);
  return {
    webdbUid: raw.uid,
    title: raw.title,
    teaser: nullIfEmpty(raw.teaser ?? null),
    bodytext: null, // not present in the export
    eventInformation,
    eventAt,
    eventEndAt: tsTimestamp(raw.event_end ?? null),
    locationTitle:
      nullIfEmpty(raw.location_simple ?? null) ??
      extractLocationFromEventInfo(eventInformation),
    organizerTitle: nullIfEmpty(raw.organizer_simple ?? null),
    institute: nullIfEmpty(institute),
    url: null, // export has only path_segment; see typo3-events.buildUrl rationale
    lang: null, // export carries no sys_language_uid
    availableLangs: [],
  };
}

const groupEvents = (group: InstituteGroup): RawJsonEvent[] =>
  Array.isArray(group) ? group : (group?.events ?? []);

/** Walk every institute group, normalise each event, and dedupe by webdb_uid
 *  (first occurrence wins) — the events UPSERT is a single INSERT … ON CONFLICT
 *  statement, which Postgres rejects if the same conflict key appears twice in
 *  one batch, so a uid that somehow shows up under two institutes must be
 *  collapsed here rather than blowing up the import. */
export function parseEventNewsGrouped(
  json: EventNewsGroupedExport,
): ParsedEventExport {
  const events: NormalizedEvent[] = [];
  const seen = new Set<number>();
  const institutes: string[] = [];
  let skipped = 0;
  let duplicates = 0;

  for (const [institute, group] of Object.entries(json?.data ?? {})) {
    institutes.push(institute);
    for (const raw of groupEvents(group)) {
      const n = normalizeJsonEvent(raw, institute);
      if (!n) {
        skipped++;
        continue;
      }
      if (seen.has(n.webdbUid)) {
        duplicates++;
        continue;
      }
      seen.add(n.webdbUid);
      events.push(n);
    }
  }

  return {
    events,
    skipped,
    duplicates,
    institutes,
    generatedAt: json?.meta?.generated_at_readable ?? null,
  };
}
