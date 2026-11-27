import 'server-only';
import { and, asc, eq, gte, ilike, ne, or, sql, type SQL } from 'drizzle-orm';
import { db, events as eventsTable, eventTypo3Drafts } from '@/lib/server/db';
import { likeEscape } from '@/lib/server/events/list';
import { sanitizeEventInformation } from '@/lib/server/events/html-utils';
import { narrowLang } from '@/lib/server/events/to-api';
import { isDecision, type EventLang } from '@/lib/shared/types';
import { toIso, type BridgeEventDetail, type BridgeEventSummary } from './contract';

// Lesesicht der TYPO3-Bridge auf die Tabelle `events` (Wire-Format:
// ./contract.ts). Nur SELECT; den Events-Sync berührt die Bridge nicht.

export interface BridgeListOptions {
  q?: string;
  /** true nimmt auch `decision = 'skip'` mit. */
  includeAll?: boolean;
}

/** Obergrenze der Liste. Anstehend sind es einige Hundert; die Grenze fängt
 *  nur einen kaputten Abzug ab, der die Antwort sonst aufbliese. */
export const BRIDGE_LIST_LIMIT = 1000;

/**
 * WHERE-Klausel der Liste: anstehend (`event_at >= now()`), ohne Skip außer
 * mit includeAll, und `q` als Teilstring (ILIKE, Wildcards entschärft) auf
 * Titel, Teaser oder Institut. Rein, damit der Test sie ohne DB rendern kann.
 */
export function bridgeEventFilter(opts: BridgeListOptions = {}): SQL {
  const parts: SQL[] = [gte(eventsTable.eventAt, sql`NOW()`)];
  if (!opts.includeAll) parts.push(ne(eventsTable.decision, 'skip'));
  const q = (opts.q ?? '').trim().slice(0, 100);
  if (q) {
    const pattern = `%${likeEscape(q)}%`;
    const match = or(
      ilike(eventsTable.title, pattern),
      ilike(eventsTable.teaser, pattern),
      ilike(eventsTable.institute, pattern),
    );
    if (match) parts.push(match);
  }
  return and(...parts) ?? sql`true`;
}

/** Text ohne Tags, `&nbsp;` und Leerraum nicht leer. `<p>&nbsp;</p>` zählt
 *  als leer, wie ihn der TYPO3-RTE bei gelöschtem Text stehen lässt. */
const hasBodytextSql = sql<boolean>`coalesce(regexp_replace(${eventsTable.bodytext}, '<[^>]*>|&nbsp;|\\s', '', 'g'), '') <> ''`;
const hasDraftSql = sql<boolean>`EXISTS (SELECT 1 FROM ${eventTypo3Drafts} WHERE ${eventTypo3Drafts.eventId} = ${eventsTable.id})`;

const summaryColumns = {
  id: eventsTable.id,
  webdbUid: eventsTable.webdbUid,
  title: eventsTable.title,
  teaser: eventsTable.teaser,
  eventAt: eventsTable.eventAt,
  eventEndAt: eventsTable.eventEndAt,
  locationTitle: eventsTable.locationTitle,
  organizerTitle: eventsTable.organizerTitle,
  institute: eventsTable.institute,
  lang: eventsTable.lang,
  availableLangs: eventsTable.availableLangs,
  url: eventsTable.url,
  decision: eventsTable.decision,
  hasBodytext: hasBodytextSql,
  hasDraft: hasDraftSql,
};

type SummaryRow = {
  id: string;
  webdbUid: number;
  title: string;
  teaser: string | null;
  eventAt: string;
  eventEndAt: string | null;
  locationTitle: string | null;
  organizerTitle: string | null;
  institute: string | null;
  lang: string | null;
  availableLangs: string[] | null;
  url: string | null;
  decision: string;
  hasBodytext: boolean;
  hasDraft: boolean;
};

export function summaryRowToApi(row: SummaryRow): BridgeEventSummary {
  return {
    id: row.id,
    webdb_uid: row.webdbUid,
    title: row.title,
    teaser: row.teaser,
    event_at: toIso(row.eventAt),
    event_end_at: toIso(row.eventEndAt),
    location_title: row.locationTitle,
    organizer_title: row.organizerTitle,
    institute: row.institute,
    lang: narrowLang(row.lang),
    available_langs: (row.availableLangs ?? []).map(narrowLang).filter((l): l is EventLang => l !== null),
    url: row.url,
    decision: isDecision(row.decision) ? row.decision : 'undecided',
    has_bodytext: Boolean(row.hasBodytext),
    has_draft: Boolean(row.hasDraft),
  };
}

/** Anstehende Events für das Panel, nach Beginn sortiert. */
export async function listBridgeEvents(opts: BridgeListOptions = {}): Promise<BridgeEventSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(eventsTable)
    .where(bridgeEventFilter(opts))
    .orderBy(asc(eventsTable.eventAt), asc(eventsTable.title), asc(eventsTable.id))
    .limit(BRIDGE_LIST_LIMIT);
  return rows.map(summaryRowToApi);
}

/** Stand des letzten Imports: jüngstes `synced_at` über alle Events. */
export async function lastSyncedAt(): Promise<string | null> {
  const [row] = await db
    .select({ at: sql<string | null>`MAX(${eventsTable.syncedAt})::text` })
    .from(eventsTable);
  return toIso(row?.at ?? null);
}

/** Ein Event samt Text; null, wenn die id unbekannt ist. Vergangene Events
 *  liefert es auch, die Liste zeigt sie nur nicht. */
export async function getBridgeEvent(id: string): Promise<BridgeEventDetail | null> {
  const [row] = await db
    .select({
      ...summaryColumns,
      bodytext: eventsTable.bodytext,
      eventInformation: eventsTable.eventInformation,
    })
    .from(eventsTable)
    .where(eq(eventsTable.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...summaryRowToApi(row),
    bodytext: row.bodytext,
    event_information: row.eventInformation ? sanitizeEventInformation(row.eventInformation) : row.eventInformation,
  };
}
