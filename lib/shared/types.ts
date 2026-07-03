/** Triage-loop decision states — single source of truth for both server (API
 *  queue handlers) and client (badges, toolbar, tab navigation).
 *
 *  The const tuples are exported so callers can iterate, validate URL params
 *  and build records without re-typing the literal list. `Decision` is derived
 *  from the tuple so adding a state means one edit, not five. */
export const DECIDED_DECISIONS = ['pitch', 'hold', 'skip'] as const;
export const DECISIONS = ['undecided', ...DECIDED_DECISIONS] as const;
export type Decision = (typeof DECISIONS)[number];

/** Type guard for narrowing arbitrary strings (URL params, body fields)
 *  to `Decision` at runtime. */
export function isDecision(v: string): v is Decision {
  return (DECISIONS as readonly string[]).includes(v);
}

/** Language tag used by press_releases.lang and DOI/title language detection. */
export type Lang = 'de' | 'en';

/** Event language tag — `Lang` plus 'mul' (multilingual). Used by the events
 *  wire DTO (`Event`) and the TYPO3-events ingest adapter. */
export type EventLang = Lang | 'mul';

/** Status state-machine shared by the analysis-batch and enrichment-batch
 *  progress modals. Identical in both, so kept central. */
export type ModalStatus = 'idle' | 'running' | 'complete' | 'cancelled' | 'error';

export interface Publication {
  id: string;
  // Identity
  webdb_uid: number | null;
  csv_uid: string | null;
  // Source-of-truth (WebDB)
  title: string;
  original_title: string | null;
  lead_author: string | null;
  abstract: string | null;
  summary_de: string | null;
  summary_en: string | null;
  doi: string | null;
  doi_link: string | null;
  published_at: string | null;
  publication_type: string | null;
  publication_type_id: string | null;
  open_access: boolean;
  open_access_status: string | null;
  oa_type: string | null;
  url: string | null;
  website_link: string | null;
  download_link: string | null;
  citation: string | null;
  citation_apa: string | null;
  citation_de: string | null;
  citation_en: string | null;
  ris: string | null;
  bibtex: string | null;
  endnote: string | null;
  peer_reviewed: boolean;
  popular_science: boolean;
  archived: boolean;
  webdb_tstamp: string | null;
  webdb_crdate: string | null;
  synced_at: string | null;
  // Enrichment
  enrichment_status: 'pending' | 'enriched' | 'partial' | 'failed';
  enriched_abstract: string | null;
  enriched_keywords: string[] | null;
  enriched_journal: string | null;
  enriched_source: string | null;
  full_text_snippet: string | null;
  word_count: number;
  // Analysis
  analysis_status: 'pending' | 'analyzed' | 'failed';
  press_score: number | null;
  press_similarity: number | null; // SPECTER2-cosine to press-cluster centroid (refresh_press_similarity)
  public_accessibility: number | null;
  societal_relevance: number | null;
  novelty_factor: number | null;
  storytelling_potential: number | null;
  media_timeliness: number | null;
  pitch_suggestion: string | null;
  target_audience: string | null;
  suggested_angle: string | null;
  reasoning: string | null;
  haiku: string | null;
  llm_model: string | null;
  analysis_cost: number | null;
  // Metadata
  import_batch: string | null;
  created_at: string;
  updated_at: string;
  // MeisterTask one-way push (lib/meistertask/*). NULL = not pushed yet.
  meistertask_task_id: string | null;
  // Short URL token for /app/task/<token> deep-links. Set by the same push.
  meistertask_task_token: string | null;
  // Triage-loop decision state (migrations 20260504000001 + 000003). See docs/TRIAGE_LOOP_PLAN.md.
  // flag count is derived: `flag_notes.length` (no DB column — single source of truth).
  // decided_at is auto-managed by `trg_publications_decided_at_sync`.
  decision: Decision;
  decided_at: string | null;
  decided_by: string | null;
  decision_rationale: string | null;
  snooze_until: string | null;
  flag_notes: FlagNote[];
  decided_in_session: string | null;
  // Optional press-release reference (joined from press_releases table).
  // NULL when no ÖAW-Hauptseite-press-release exists for this paper.
  // When DE+EN variants exist, the API picks the DE one as default.
  press_release?: PressRelease | null;
}

export interface PressRelease {
  id: string;
  publication_id: string | null; // NULL = orphan
  doi: string;
  url: string;
  released_at: string | null;
  lang: Lang | null;
  paper_title: string | null;
  news_title: string | null;
  source_news_uid: number | null;
  // Enrichment für orphan-rows (publication_id IS NULL):
  // Paper ist nicht in WebDB, OeAW-Bezug aber meist trotzdem da — diese Felder
  // kommen via OpenAlex/CrossRef/S2/Unpaywall+PDF (scripts/enrich-orphans.ts).
  abstract: string | null;
  authors: string[] | null;
  journal: string | null;
  paper_year: number | null;
  keywords: string[] | null;
  openalex_id: string | null;
  enrichment_status: 'enriched' | 'partial' | 'failed' | null;
  enriched_at: string | null;
  created_at: string;
  /** OeAW-Person-Matches gegen authors[] (lastname + firstname-initial).
   *  Nur für orphans gefüllt — matched-Pubs haben person_publications. */
  oeaw_author_matches: Array<{
    person_id: string;
    name: string;
    matched_author: string;
  }>;
}

export interface FlagNote {
  by: string;
  note: string;
  at: string;
}

export interface ReviewSession {
  id: string;
  occurred_at: string;
  attendees: string[] | null;
  facilitator: string | null;
  notes: string | null;
  created_at: string;
}

export interface PublicationType {
  id: string;
  webdb_uid: number;
  name_de: string;
  name_en: string;
}

export interface Person {
  id: string;
  webdb_uid: number;
  firstname: string;
  lastname: string;
  degree_before: string | null;
  degree_after: string | null;
  email: string | null;
  orcid: string | null;
  oestat3_name_de: string | null;
  oestat3_name_en: string | null;
  research_fields: string | null;
  external: boolean;
  deceased: boolean;
  portrait: string | null;
  slug: string | null;
}

export interface Orgunit {
  id: string;
  webdb_uid: number;
  name_de: string;
  name_en: string | null;
  akronym_de: string | null;
  akronym_en: string | null;
  url_de: string | null;
  url_en: string | null;
  parent_id: string | null;
  /** Depth from the closest root (parent_id NULL). Computed by the
   *  /api/orgunits handler; absent on detail-page joins. */
  tier?: number;
  /** Tier-4 leaf with a non-structural name and a German acronym —
   *  i.e. an actual research-producing institute. Computed alongside
   *  `tier`. */
  is_research_unit?: boolean;
}

export interface Project {
  id: string;
  webdb_uid: number;
  title_de: string | null;
  title_en: string | null;
  summary_de: string | null;
  summary_en: string | null;
  thematic_focus_de: string | null;
  thematic_focus_en: string | null;
  funding_type_de: string | null;
  funding_type_en: string | null;
  starts_on: string | null;
  ends_on: string | null;
  cancelled: boolean;
  url_de: string | null;
  url_en: string | null;
}

export interface Lecture {
  id: string;
  webdb_uid: number;
  original_title: string;
  lecture_date: string | null;
  city: string | null;
  event_name: string | null;
  event_type: string | null;
  popular_science: boolean;
  speaker: string | null;
  citation: string | null;
}

/** Wire shape returned by `/api/oestat6` — the row plus the server-computed
 *  `super_domain` (1-digit prefix of webdb_uid, the top-level Frascati branch).
 *  `oestat3` is the 3-digit subdomain code and is generated by the DB from
 *  webdb_uid; the column is nullable in the introspected schema (Drizzle
 *  types generated columns conservatively) even though it is non-null in
 *  practice when webdb_uid is set. */
export interface Oestat6 {
  id: string;
  webdb_uid: number;
  oestat3: number | null;
  name_de: string;
  name_en: string;
  super_domain: number;
  super_domain_label: string | null;
}

export interface PersonPublication {
  person_id: string;
  publication_id: string;
  highlight: boolean;
  mahighlight: boolean;
  authorship: string | null;
}

export interface OrgunitPublication {
  orgunit_id: string;
  publication_id: string;
  highlight: boolean;
}

/** A publication with all related entities joined in. Used by the detail view.
 *
 *  `orgunits` carries the press-triage chip shape from
 *  `publication_orgunit_context`: direct WebDB attribution
 *  (`source: 'attributed'`) plus the author-affiliation fallback for the ~4 %
 *  of pubs WebDB didn't claim for any unit. Narrow on purpose — the UI only
 *  reads id/akronym/name/url, so we don't ship the full Orgunit DTO.
 *
 *  `parsed_citation` is set when `publications.citation` matched the Pure
 *  (Elsevier) renderingHtml wrapper and the server-side parser was able to
 *  lift structured fields out — null otherwise. The detail page uses it for
 *  a richer citation block (bold title, italic venue, author list with
 *  ÖAW authors linked); plain-text fallback via `decodeHtmlBlock(citation)`
 *  applies when null. */
export interface PublicationWithRelations extends Publication {
  publication_type_lookup?: PublicationType | null;
  authors_resolved?: Array<Person & { authorship: string | null; highlight: boolean; mahighlight: boolean }>;
  orgunits?: Array<{
    id: string;
    akronym_de: string | null;
    name_de: string;
    url_de: string | null;
    source: 'attributed' | 'author_affiliation';
  }>;
  projects?: Project[];
  parsed_citation?: ParsedCitation | null;
}

/** Pure renderingHtml content type, lifted from the outer `<div>` class list. */
export type ParsedCitationType = 'researchoutput' | 'dataset' | 'unknown';

/** One author entry from a parsed Pure citation, with the optional role
 *  annotation ("Herausgeber:in", "Redakteur:in", …) lifted out of the
 *  parens. `name` is plain text, already entity-decoded. */
export interface ParsedCitationAuthor {
  name: string;
  role: string | null;
}

/** A person name (editor, contributor, mentioned colleague) found in the
 *  citation's trailer text that matched a row in the `persons` table.
 *  Server-side enriched in `getPublicationById` after `parseCitation`. The
 *  CitationCard turns these substrings into links so a press-team
 *  reviewer can navigate to the person page in one click — same value
 *  proposition as linking the OEAW authors in the main author list. */
export interface ParsedCitationTrailerPerson {
  /** Exact substring from the trailer text — case preserved so the
   *  client-side replace can find it. */
  name: string;
  person_id: string;
  external: boolean;
}

/** Structured projection of a Pure (Elsevier) renderingHtml citation.
 *  Produced by `lib/server/publications/citation-parser.ts`. See that
 *  module's header comment for the field-by-field semantics and the
 *  fallback contract (null result → use `decodeHtmlBlock(citation)`).
 *
 *  Field keys are snake_case per ADR 0004 (wire shape). The discriminator
 *  values `'book-host'` etc. are values, not keys, and stay as the most
 *  readable form for that domain. */
export interface ParsedCitation {
  type: ParsedCitationType;
  subtype: string | null;
  title: string;
  authors: ParsedCitationAuthor[];
  et_al: boolean;
  venue: string | null;
  venue_kind: 'journal' | 'book-host' | null;
  trailer: string | null;
  /** Person names found INSIDE the trailer text (editors, contributors,
   *  mentioned colleagues) that match a row in the `persons` table. The
   *  CitationCard renders these substrings as links to /persons/{id}.
   *  Always present (empty array when no matches). */
  trailer_persons: ParsedCitationTrailerPerson[];
}

export interface EnrichmentResult {
  abstract?: string;
  keywords?: string[];
  journal?: string;
  source: string;
  full_text_snippet?: string;
  word_count?: number;
  pdf_url?: string;
  /** ISO 8601 date string (YYYY-MM-DD) extracted from source API */
  published_at?: string;
  /** Paper title from the API. Used by orphan-enrich; ignored by publications-
   *  enrichment (which keeps WebDB-title as source-of-truth). */
  title?: string;
  /** Author display-names. Same caveat as `title`. */
  authors?: string[];
  /** OpenAlex Work-ID (W-prefixed). Only populated by enrichFromOpenAlex. */
  openalex_id?: string;
}

export interface AnalysisResult {
  publication_index: number;
  public_accessibility: number;
  societal_relevance: number;
  novelty_factor: number;
  storytelling_potential: number;
  media_timeliness: number;
  pitch_suggestion: string;
  target_audience: string;
  suggested_angle: string;
  reasoning: string;
  haiku: string;
}

export interface LLMResponse {
  evaluations: AnalysisResult[];
}

export interface PublicationStats {
  total: number;
  enriched: number;
  partial: number;
  with_abstract: number;
  analyzed: number;
  peer_reviewed?: number;
  popular_science?: number;
  bilingual_summary?: number;
  avg_score: number | null;
  high_score_count: number;
  score_distribution?: number[];
  dimension_avgs?: {
    public_accessibility?: number;
    societal_relevance?: number;
    novelty_factor?: number;
    storytelling_potential?: number;
    media_timeliness?: number;
  };
  top_keywords?: { word: string; count: number }[];
}

export type EnrichmentSourceName = 'crossref' | 'openalex' | 'unpaywall' | 'semantic_scholar' | 'pdf';

export type EnrichmentSourceStatus = 'waiting' | 'loading' | 'success' | 'no_data' | 'error' | 'skipped';

export interface EnrichmentSourceEvent {
  index: number;
  source: EnrichmentSourceName;
  status: EnrichmentSourceStatus;
  found?: {
    abstract?: string;
    journal?: string;
    keywords?: string[];
    pdf_url?: string;
  };
  error?: string;
}

export interface EnrichmentPubStartEvent {
  index: number;
  total: number;
  title: string;
  doi: string | null;
}

export interface EnrichmentPubDoneEvent {
  index: number;
  title: string;
  final_status: 'enriched' | 'partial' | 'failed';
  sources_used: string[];
  has_abstract: boolean;
}

export interface EnrichmentCompleteEvent {
  processed: number;
  total: number;
  successful: number;
  partial: number;
  failed: number;
  with_abstract: number;
  sources: Record<string, number>;
}

export interface SSEEvent {
  type: 'progress' | 'complete' | 'error';
  processed: number;
  total: number;
  current_title?: string;
  message?: string;
}

export interface AppSettings {
  openrouterApiKey: string;
  minWordCount: number;
  batchSize: number;
  // Used as the `by` field for flag notes and decision attribution.
  // Empty string falls back to "team" server-side.
  reviewerName: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  openrouterApiKey: '',
  minWordCount: 100,
  batchSize: 3,
  reviewerName: '',
};

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

// ===========================================================================
// Social-media monitoring ("Lagebild" — /social). Wire DTOs (snake_case + ISO
// strings), mapped from Drizzle rows in lib/server/social/to-api.ts.
// ===========================================================================

export interface SocialChannel {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  url: string;
  active: boolean;
  /** Per-channel look-back override (days); null = inherit the global default. */
  lookback_days: number | null;
  created_at: string;
}

export interface SocialPost {
  id: string;
  channel_id: string;
  external_id: string;
  url: string | null;
  posted_at: string | null;
  caption: string | null;
  like_count: number | null;
  comment_count: number | null;
  media_type: string | null;
  image_url: string | null;
  topic: string | null;
  keywords: string[];
  summary_de: string | null;
  analysis_status: string;
  llm_model: string | null;
  analyzed_at: string | null;
}

/** One aggregated topic in a snapshot's `themes` array. */
export interface SocialTheme {
  theme: string;
  description: string;
  channels: string[];
  post_count: number;
  keywords: string[];
  /** IDs of the posts the LLM assigned to this theme. Optional: snapshots
   *  created before this field shipped won't have it (UI falls back to
   *  keyword matching). */
  post_ids?: string[];
}

export interface SocialThemeSnapshot {
  id: string;
  created_at: string;
  window_days: number;
  post_count: number;
  channel_count: number;
  themes: SocialTheme[];
  narrative_de: string | null;
  llm_model: string | null;
}

/** A channel with its recent posts — the shape the /social page renders. */
export interface SocialChannelWithPosts extends SocialChannel {
  posts: SocialPost[];
}

/** Global team-wide social-monitor settings (singleton). */
export interface SocialSettings {
  /** Posts newer than this show by default; older sit behind a control. */
  fresh_window_days: number;
  /** Window of posts fed to the LLM theme snapshot on refresh. */
  theme_window_days: number;
  /** null = keep everything; else prune posts older than this on refresh. */
  retention_days: number | null;
  updated_at: string;
}

/** Accumulated feature cost, from social_refresh_runs. */
export interface SocialCostSummary {
  total_usd: number;
  apify_usd: number;
  llm_usd: number;
  llm_tokens: number;
  runs: number;
  last_run_at: string | null;
}

// ---------------------------------------------------------------------------
// Auth (Phase 1 Redaktionsboard) — Supabase-Auth-Identität hinter dem Gate.

export type UserRole = 'admin' | 'member';

/** Eingeloggte Identität, wie GET /api/auth/me sie liefert (public.users). */
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
}

/** Zeile der Nutzerverwaltung (admin-only, GET /api/auth/users). */
export interface AdminUserRow extends CurrentUser {
  disabledAt: string | null;
  createdAt: string;
  /** Aus auth.users (Admin-API); null = noch nie angemeldet → „Neu"-Badge. */
  lastSignInAt: string | null;
}
