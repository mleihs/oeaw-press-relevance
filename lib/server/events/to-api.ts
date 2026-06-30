import { events as eventsTable } from '@/lib/server/db';
import { isDecision, type Decision, type FlagNote } from '@/lib/shared/types';
import type { EventLang } from '@/lib/server/ingest/adapters/typo3-events';

// Drizzle-row → wire-DTO mapper for the events feature. Centralises the
// `decision`/`flag_notes`/`lang` runtime narrowing so consumers (RSC pages,
// client components) get a typed value instead of casting `as Decision` /
// `as FlagNote[]` at the call site. Follows the per-feature toApi rule
// from ADR 0003 — same shape as lib/server/publications/to-api.ts.

export type EventRow = typeof eventsTable.$inferSelect;

export interface Event {
  id: string;
  webdb_uid: number;
  title: string;
  teaser: string | null;
  bodytext: string | null;
  event_information: string | null;
  event_at: string;
  event_end_at: string | null;
  location_title: string | null;
  organizer_title: string | null;
  institute: string | null;
  url: string | null;
  lang: EventLang | null;
  available_langs: EventLang[];
  decision: Decision;
  decided_at: string | null;
  flag_notes: FlagNote[];
  // LLM relevance analysis (Veranstaltungsbetrieb). Null until analyzed.
  analysis_status: 'pending' | 'analyzed' | 'failed' | null;
  event_score: number | null;
  public_appeal: number | null;
  scientific_significance: number | null;
  reach: number | null;
  timeliness: number | null;
  pitch_suggestion: string | null;
  suggested_angle: string | null;
  target_audience: string | null;
  reasoning: string | null;
  llm_model: string | null;
  analysis_cost: number | null;
  analyzed_at: string | null;
  synced_at: string;
  created_at: string;
}

const VALID_ANALYSIS_STATUS = new Set(['pending', 'analyzed', 'failed']);

const VALID_LANGS = new Set<EventLang>(['de', 'en', 'mul']);

function narrowLang(v: string | null): EventLang | null {
  return v && VALID_LANGS.has(v as EventLang) ? (v as EventLang) : null;
}

/** Narrows the Drizzle-inferred `string` / `unknown` columns to their
 *  typed wire shapes. Falls back to safe defaults on unexpected DB state
 *  (e.g. decision contains a value outside the CHECK constraint because
 *  a future migration added one — return 'undecided' rather than throw). */
export function eventRowToApi(row: EventRow): Event {
  return {
    id: row.id,
    webdb_uid: row.webdbUid,
    title: row.title,
    teaser: row.teaser,
    bodytext: row.bodytext,
    event_information: row.eventInformation,
    event_at: row.eventAt,
    event_end_at: row.eventEndAt,
    location_title: row.locationTitle,
    organizer_title: row.organizerTitle,
    institute: row.institute,
    url: row.url,
    lang: narrowLang(row.lang),
    available_langs: (row.availableLangs ?? [])
      .map(narrowLang)
      .filter((l): l is EventLang => l !== null),
    decision: isDecision(row.decision) ? row.decision : 'undecided',
    decided_at: row.decidedAt,
    flag_notes: Array.isArray(row.flagNotes) ? (row.flagNotes as FlagNote[]) : [],
    analysis_status:
      row.analysisStatus && VALID_ANALYSIS_STATUS.has(row.analysisStatus)
        ? (row.analysisStatus as 'pending' | 'analyzed' | 'failed')
        : null,
    event_score: row.eventScore,
    public_appeal: row.publicAppeal,
    scientific_significance: row.scientificSignificance,
    reach: row.reach,
    timeliness: row.timeliness,
    pitch_suggestion: row.pitchSuggestion,
    suggested_angle: row.suggestedAngle,
    target_audience: row.targetAudience,
    reasoning: row.reasoning,
    llm_model: row.llmModel,
    analysis_cost: row.analysisCost,
    analyzed_at: row.analyzedAt,
    synced_at: row.syncedAt,
    created_at: row.createdAt,
  };
}

// Heavy text columns the list/calendar surfaces never render: `bodytext` +
// `event_information` are multi-KB sanitized HTML, and `reasoning` + the three
// pitch-prose fields are LLM output. They're omitted from the list projection
// below so they don't ride in the RSC payload of every row; the detail page
// (getEventById) still loads the full row on demand.
const EVENT_HEAVY_COLUMNS = [
  'bodytext',
  'eventInformation',
  'reasoning',
  'pitchSuggestion',
  'suggestedAngle',
  'targetAudience',
] as const;
type EventHeavyColumn = (typeof EVENT_HEAVY_COLUMNS)[number];

/** `db.select()` projection for list/calendar reads — every events column
 *  except the heavy text fields above. */
export const eventListColumns = {
  id: eventsTable.id,
  webdbUid: eventsTable.webdbUid,
  title: eventsTable.title,
  teaser: eventsTable.teaser,
  eventAt: eventsTable.eventAt,
  eventEndAt: eventsTable.eventEndAt,
  locationTitle: eventsTable.locationTitle,
  organizerTitle: eventsTable.organizerTitle,
  institute: eventsTable.institute,
  url: eventsTable.url,
  lang: eventsTable.lang,
  availableLangs: eventsTable.availableLangs,
  decision: eventsTable.decision,
  decidedAt: eventsTable.decidedAt,
  flagNotes: eventsTable.flagNotes,
  analysisStatus: eventsTable.analysisStatus,
  eventScore: eventsTable.eventScore,
  publicAppeal: eventsTable.publicAppeal,
  scientificSignificance: eventsTable.scientificSignificance,
  reach: eventsTable.reach,
  timeliness: eventsTable.timeliness,
  llmModel: eventsTable.llmModel,
  analysisCost: eventsTable.analysisCost,
  analyzedAt: eventsTable.analyzedAt,
  syncedAt: eventsTable.syncedAt,
  createdAt: eventsTable.createdAt,
};

export type EventListRow = Omit<EventRow, EventHeavyColumn>;

/** Maps a slimmed list row to the wire `Event`, defaulting the omitted heavy
 *  columns to null (the list/calendar never read them). Reuses `eventRowToApi`
 *  so the decision/flag_notes/lang narrowing stays single-sourced. */
export function eventListRowToApi(row: EventListRow): Event {
  return eventRowToApi({
    ...row,
    bodytext: null,
    eventInformation: null,
    reasoning: null,
    pitchSuggestion: null,
    suggestedAngle: null,
    targetAudience: null,
  });
}
