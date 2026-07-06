/** Events wire DTOs (Veranstaltungsbetrieb) — the event row and the
 *  score-weight configuration history. */

import type { Decision, EventLang, FlagNote } from './core';

/** Wire DTO for an OeAW event (Veranstaltungsbetrieb). Drizzle-row → this shape
 *  via `eventRowToApi` in lib/server/events/to-api.ts; consumed by the /events
 *  RSC pages + client calendar/table. Parallel to `Publication`. */
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

// Event-score weighting (Settings → Bewertungs-Gewichtung). The four weights
// over the event sub-scores; the overall event_score is their weighted sum.
// Stored normalized (sum = 1) as an append-only history (latest = current).
export interface EventScoreWeights {
  public_appeal: number;
  scientific_significance: number;
  reach: number;
  timeliness: number;
}

export interface EventScoreWeightEntry extends EventScoreWeights {
  id: number;
  note: string | null;
  /** How many events were recomputed when this config was applied. */
  recomputed_count: number | null;
  created_at: string;
}
