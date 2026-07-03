import { getTableColumns } from 'drizzle-orm';
import { events as eventsTable } from '@/lib/server/db';
import {
  isDecision,
  type Event,
  type EventLang,
  type FlagNote,
} from '@/lib/shared/types';

// Drizzle-row → wire-DTO mapper for the events feature. Centralises the
// `decision`/`flag_notes`/`lang` runtime narrowing so consumers (RSC pages,
// client components) get a typed value instead of casting `as Decision` /
// `as FlagNote[]` at the call site. Follows the per-feature toApi rule
// from ADR 0003 — same shape as lib/server/publications/to-api.ts.

export type EventRow = typeof eventsTable.$inferSelect;

// The `Event` wire DTO now lives in lib/shared/types.ts (parallel to
// `Publication`) so consumers import it from shared without crossing the server
// boundary; this module owns the Drizzle-row → `Event` mapping below.

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
// `event_information` are multi-KB sanitized HTML, and the three pitch-prose
// fields are LLM output that only the detail page / cockpit show. They're
// omitted from the list projection below so they don't ride in the RSC payload
// of every row; the detail page (getEventById) loads the full row on demand.
// `reasoning` is deliberately NOT heavy here: it's a 2-3 sentence justification
// the list surfaces as a scan-time tooltip on the score badge (ScoreReasonBadge),
// cheap enough to carry on every row.
const EVENT_HEAVY_COLUMNS = [
  'bodytext',
  'eventInformation',
  'pitchSuggestion',
  'suggestedAngle',
  'targetAudience',
] as const satisfies readonly (keyof EventRow)[];
type EventHeavyColumn = (typeof EVENT_HEAVY_COLUMNS)[number];

const eventColumns = getTableColumns(eventsTable);

/** `db.select()` projection for list/calendar reads — every events column
 *  except the heavy text fields above. Derived from the schema (all columns
 *  minus EVENT_HEAVY_COLUMNS) so future columns are list-visible by default
 *  instead of silently missing from a hand-maintained projection. */
export const eventListColumns = Object.fromEntries(
  Object.entries(eventColumns).filter(
    ([name]) => !(EVENT_HEAVY_COLUMNS as readonly string[]).includes(name),
  ),
) as Omit<typeof eventColumns, EventHeavyColumn>;

export type EventListRow = Omit<EventRow, EventHeavyColumn>;

/** Maps a slimmed list row to the wire `Event`, defaulting the omitted heavy
 *  columns to null (the list/calendar never read them). Reuses `eventRowToApi`
 *  so the decision/flag_notes/lang narrowing stays single-sourced. */
export function eventListRowToApi(row: EventListRow): Event {
  return eventRowToApi({
    ...row,
    bodytext: null,
    eventInformation: null,
    pitchSuggestion: null,
    suggestedAngle: null,
    targetAudience: null,
  });
}
