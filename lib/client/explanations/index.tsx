// Central source of truth for "what does this number mean / how was it computed".
// Every metric, badge, derived value, and threshold across the UI references
// these entries via <InfoBubble id="…" />. Editing wording in one place updates
// the whole interface — no drift between Spotlight, Table, Detail, Publication views.
//
// Nach Domänen gesplittet (publications/researchers/events/social/misc); dieser
// Index führt sie zur identischen API zusammen. Importe bleiben unverändert
// `@/lib/client/explanations` — moduleResolution "bundler" löst den alten
// Modulpfad jetzt auf dieses Verzeichnis-Index auf.
//
// Conventions (gelten in allen Domänendateien):
// - `title`     short headline (≤ 6 words)
// - `formula`   optional inline-code block (mathematical formula)
// - `body`      JSX for the main explanation, multi-paragraph allowed
// - `example`   optional concrete example
// - `note`      optional caveat / data-quality warning

import type { Explanation } from './primitives';
import { PUBLICATIONS_EXPL } from './publications';
import { RESEARCHERS_EXPL } from './researchers';
import { EVENTS_EXPL } from './events';
import { SOCIAL_EXPL } from './social';
import { MISC_EXPL } from './misc';

export type { Explanation } from './primitives';
export { leadWithReason } from './primitives';

export const EXPL = {
  ...PUBLICATIONS_EXPL,
  ...RESEARCHERS_EXPL,
  ...EVENTS_EXPL,
  ...SOCIAL_EXPL,
  ...MISC_EXPL,
} satisfies Record<string, Explanation>;

// ─── KB-Anchor-Map ──────────────────────────────────────────────────────────
// Maps each EXPL id to a deep-link into the Hilfe-Center (content/help/**.mdx).
// The InfoBubble renders a „Mehr im Hilfe-Center →" link in its popover when a
// mapping exists. Hash anchors must match stable `{#anchor}` IDs in the MDX
// headings — NOT auto-slugged heading text (so we can edit titles freely).
//
// Filled per-block during Phase 3b. Empty entries are fine and silently skip
// the link render.

export type KbAnchor = { path: string; hash?: string };

export const EXPL_KB_MAP: Partial<Record<keyof typeof EXPL, KbAnchor>> = {
  // ─── scores/ ───────────────────────────────────────────────────────────────
  press_score:               { path: '/help/scores/storyscore' },
  dim_public_accessibility:  { path: '/help/scores/dimensionen', hash: 'verstaendlichkeit' },
  dim_societal_relevance:    { path: '/help/scores/dimensionen', hash: 'gesellschaftliche-relevanz' },
  dim_novelty_factor:        { path: '/help/scores/dimensionen', hash: 'neuheit' },
  dim_storytelling_potential:{ path: '/help/scores/dimensionen', hash: 'erzaehlpotenzial' },
  dim_media_timeliness:      { path: '/help/scores/dimensionen', hash: 'aktualitaet' },
  score_band:                { path: '/help/scores/score-baender', hash: 'baender' },
  score_na:                  { path: '/help/scores/score-fehlt', hash: 'sub-zustaende' },
  score_na_pending_pending:  { path: '/help/scores/score-fehlt', hash: 'pending-pending' },
  score_na_pending_partial:  { path: '/help/scores/score-fehlt', hash: 'pending-partial' },
  score_na_pending_enriched: { path: '/help/scores/score-fehlt', hash: 'pending-enriched' },
  score_na_pending_failed:   { path: '/help/scores/score-fehlt', hash: 'pending-failed' },
  score_na_analysis_failed:  { path: '/help/scores/score-fehlt', hash: 'analysis-failed' },
  pitch_suggestion:          { path: '/help/scores/pitch-felder', hash: 'pitch-suggestion' },
  suggested_angle:           { path: '/help/scores/pitch-felder', hash: 'suggested-angle' },
  target_audience:           { path: '/help/scores/pitch-felder', hash: 'target-audience' },
  reasoning:                 { path: '/help/scores/pitch-felder', hash: 'reasoning' },
  haiku_block:               { path: '/help/scores/pitch-felder', hash: 'haiku' },
  ai_provenance:             { path: '/help/scores/pitch-felder', hash: 'ai-provenance' },

  // ─── badges/ ───────────────────────────────────────────────────────────────
  mahighlight_self:          { path: '/help/badges/mahighlight' },
  peer_reviewed:             { path: '/help/badges/peer-reviewed' },
  popular_science_badge:     { path: '/help/badges/popular-science' },
  stat_popular_science:      { path: '/help/badges/popular-science' },
  open_access:               { path: '/help/badges/open-access' },
  press_release_badge:       { path: '/help/badges/press-release-badge' },
  filter_press_released:     { path: '/help/badges/press-release-badge', hash: 'filter' },
  member_oeaw:               { path: '/help/badges/member-oeaw' },
  highlight_unit:            { path: '/help/badges/highlight-unit' },
  external_person:           { path: '/help/badges/externe-personen' },
  publication_flag:          { path: '/help/badges/publication-flag' },
  event_flag:                { path: '/help/events/event-flag' },
  oestat3:                   { path: '/help/badges/oestat3' },

  // ─── filter/ ───────────────────────────────────────────────────────────────
  preset_pitch:              { path: '/help/filter/presets', hash: 'pitch' },
  preset_mahighlights:       { path: '/help/filter/presets', hash: 'mahighlights' },
  preset_wiss:               { path: '/help/filter/presets', hash: 'wiss' },
  preset_popsci:             { path: '/help/filter/presets', hash: 'popsci' },
  preset_peer:               { path: '/help/filter/presets', hash: 'peer' },
  filter_ita:                { path: '/help/filter/filter-ita' },
  filter_outreach:           { path: '/help/filter/filter-outreach' },
  filter_authorship:         { path: '/help/filter/filter-authorship' },
  filter_deceased:           { path: '/help/filter/filter-deceased' },
  filter_publikationstyp:    { path: '/help/filter/filter-publikationstyp' },
  pub_filter_eligibility:    { path: '/help/filter/filter-publikationstyp', hash: 'press-eligibility' },
  filter_institut:           { path: '/help/filter/filter-institut' },
  filter_oestat6:            { path: '/help/filter/filter-oestat6' },
  filter_min_score:          { path: '/help/filter/filter-min-score' },
  search_scope:              { path: '/help/filter/search' },
  since_window:              { path: '/help/filter/zeitfenster', hash: 'wo-greift' },
  dashboard_time_range:      { path: '/help/filter/zeitfenster', hash: 'tabs-vs-slider' },
  delta_count_high:          { path: '/help/filter/zeitfenster', hash: 'vorperiode' },

  // ─── triage/ ───────────────────────────────────────────────────────────────
  decision_pitch:            { path: '/help/triage/entscheidungen', hash: 'pitch' },
  decision_hold:             { path: '/help/triage/entscheidungen', hash: 'hold' },
  decision_skip:             { path: '/help/triage/entscheidungen', hash: 'skip' },
  decision_snooze:           { path: '/help/triage/entscheidungen', hash: 'snooze' },
  decision_rationale:        { path: '/help/triage/entscheidungen', hash: 'rationale' },
  event_decision_pitch:      { path: '/help/events/decision-workflow', hash: 'pitch' },
  event_decision_hold:       { path: '/help/events/decision-workflow', hash: 'hold' },
  event_decision_skip:       { path: '/help/events/decision-workflow', hash: 'skip' },
  triage_flagged:            { path: '/help/triage/triage-sitzung', hash: 'flagged' },
  triage_fresh:              { path: '/help/triage/triage-sitzung', hash: 'fresh' },
  triage_mahl:               { path: '/help/triage/triage-sitzung', hash: 'mahl' },
  meistertask_pitch:         { path: '/help/triage/meistertask' },

  // ─── pipeline/ ─────────────────────────────────────────────────────────────
  pipeline_enrichment:       { path: '/help/pipeline/enrichment' },
  status_pending:            { path: '/help/pipeline/enrichment', hash: 'status-pending' },
  status_enriched:           { path: '/help/pipeline/enrichment', hash: 'status-enriched' },
  status_partial:            { path: '/help/pipeline/enrichment', hash: 'status-partial' },
  status_failed:             { path: '/help/pipeline/enrichment', hash: 'status-failed' },
  pipeline_analysis:         { path: '/help/pipeline/analyse' },
  status_analyzed:           { path: '/help/pipeline/analyse', hash: 'nach-dem-lauf' },
  upload_pipeline:           { path: '/help/pipeline/import' },

  // ─── datenquellen/ ─────────────────────────────────────────────────────────
  source_crossref:           { path: '/help/datenquellen/quellen-uebersicht', hash: 'source-crossref' },
  source_openalex:           { path: '/help/datenquellen/quellen-uebersicht', hash: 'source-openalex' },
  source_unpaywall:          { path: '/help/datenquellen/quellen-uebersicht', hash: 'source-unpaywall' },
  source_semantic_scholar:   { path: '/help/datenquellen/quellen-uebersicht', hash: 'source-semantic-scholar' },
  source_pdf:                { path: '/help/datenquellen/quellen-uebersicht', hash: 'source-pdf' },
  venue:                     { path: '/help/datenquellen/venue' },
  orgunit_chip:              { path: '/help/datenquellen/institut-chip' },

  // ─── press-releases/ ───────────────────────────────────────────────────────
  pr_stat_total:             { path: '/help/press-releases/seiten-tour', hash: 'total' },
  pr_stat_matched:           { path: '/help/press-releases/seiten-tour', hash: 'matched' },
  pr_stat_orphans:           { path: '/help/press-releases/seiten-tour', hash: 'orphans' },
  pr_stat_year:              { path: '/help/press-releases/seiten-tour', hash: 'year' },
  pr_tab_matched:            { path: '/help/press-releases/seiten-tour', hash: 'tab-matched' },
  pr_tab_orphans:            { path: '/help/press-releases/seiten-tour', hash: 'tab-orphans' },
  pub_score_column:          { path: '/help/scores/storyscore' },
  orphan_press_release:      { path: '/help/press-releases/orphans' },
  press_similarity:          { path: '/help/scores/press-similarity' },

  // ─── forscher-metriken/ ────────────────────────────────────────────────────
  count_high:                { path: '/help/forscher-metriken/metriken', hash: 'count-high' },
  sum_score:                 { path: '/help/forscher-metriken/metriken', hash: 'sum-score' },
  avg_score:                 { path: '/help/forscher-metriken/metriken', hash: 'avg-score' },
  weighted_avg:              { path: '/help/forscher-metriken/metriken', hash: 'weighted-avg' },
  pubs_total:                { path: '/help/forscher-metriken/metriken', hash: 'pubs-total' },
  rank:                      { path: '/help/forscher-metriken/ranking', hash: 'berechnung' },
  rank_medals:               { path: '/help/forscher-metriken/ranking', hash: 'medals' },
  sparkline:                 { path: '/help/forscher-metriken/ranking', hash: 'sparkline' },
  beeswarm:                  { path: '/help/forscher-metriken/beeswarm' },
  activity_chart:            { path: '/help/forscher-metriken/activity-chart' },
  coauthor_shared:           { path: '/help/forscher-metriken/coauthor', hash: 'zaehlung' },

  // ─── dashboard/ ────────────────────────────────────────────────────────────
  stat_total_pubs:           { path: '/help/dashboard/dashboard-tour', hash: 'stat-total' },
  stat_analyzed:             { path: '/help/dashboard/dashboard-tour', hash: 'stat-analyzed' },
  stat_high_score:           { path: '/help/dashboard/dashboard-tour', hash: 'stat-high' },
  top10_panel:               { path: '/help/dashboard/dashboard-tour', hash: 'top10' },
  score_distribution_chart:  { path: '/help/dashboard/dashboard-tour', hash: 'score-distribution' },
  dimensions_profile:        { path: '/help/dashboard/dashboard-tour', hash: 'dim-profil' },
  top_keywords:              { path: '/help/dashboard/dashboard-tour', hash: 'top-keywords' },
  scoring_status:            { path: '/help/dashboard/dashboard-tour', hash: 'bewertung' },

  // ─── einstellungen/ ────────────────────────────────────────────────────────
  settings_reviewer_name:    { path: '/help/einstellungen/einstellungen', hash: 'reviewer-name' },
  settings_openrouter:       { path: '/help/einstellungen/einstellungen', hash: 'openrouter' },
  settings_min_words:        { path: '/help/einstellungen/einstellungen', hash: 'min-words' },
  settings_batch_size:       { path: '/help/einstellungen/einstellungen', hash: 'batch-size' },

  // ─── social/ ─────────────────────────────────────────────────────────────
  social_kpi_posts:          { path: '/help/social/seiten-tour', hash: 'aufbau' },
  social_kpi_themes:         { path: '/help/social/seiten-tour', hash: 'aufbau' },
  social_briefing:           { path: '/help/social/seiten-tour', hash: 'aufbau' },
  social_kpi_channels:       { path: '/help/social/kanaele-verwalten', hash: 'crud' },
  social_window:             { path: '/help/social/kanaele-verwalten', hash: 'zeitraum' },
  social_cost:               { path: '/help/social/kanaele-verwalten', hash: 'datenquelle' },
  social_momentum:           { path: '/help/dashboard/dashboard-tour', hash: 'social-trends' },

  // ─── events: relevanz-score ──────────────────────────────────────────────
  event_score:               { path: '/help/events/relevanz-score', hash: 'score' },
  event_public_appeal:       { path: '/help/events/relevanz-score', hash: 'dimensionen' },
  event_significance:        { path: '/help/events/relevanz-score', hash: 'dimensionen' },
  event_reach:               { path: '/help/events/relevanz-score', hash: 'dimensionen' },
  event_timeliness:          { path: '/help/events/relevanz-score', hash: 'dimensionen' },
  event_pitch:               { path: '/help/events/relevanz-score', hash: 'pitch' },
  event_angle:               { path: '/help/events/relevanz-score', hash: 'pitch' },
  event_audience:            { path: '/help/events/relevanz-score', hash: 'pitch' },
  event_reasoning:           { path: '/help/events/relevanz-score', hash: 'score' },
  event_ai_provenance:       { path: '/help/events/relevanz-score', hash: 'score' },
};
