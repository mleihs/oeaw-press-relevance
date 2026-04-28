// Types mirror the PG functions in supabase/migrations/20260428*_function.sql.
// Keep them in sync when the function signatures change.

export type LeaderboardMetric =
  | 'count_high'
  | 'sum_score'
  | 'avg_score'
  | 'weighted_avg'
  | 'pubs_total';

export type AuthorshipScope = 'all' | 'lead';

export interface TopPubMini {
  id: string;
  title: string;
  haiku: string | null;
  citation: string | null;
  press_score: number;
}

export interface SparklinePoint {
  m: string; // 'YYYY-MM'
  c: number;
}

export interface TopResearcherRow {
  rank_now: number;
  delta_count_high: number;
  is_newcomer: boolean;
  person_id: string;
  firstname: string;
  lastname: string;
  orcid: string | null;
  slug: string | null;
  oestat3_name_de: string | null;
  external: boolean;
  deceased: boolean;
  member_type_de: string | null;
  count_high: number;
  sum_score: number;
  avg_score: number;
  weighted_avg: number;
  pubs_total: number;
  self_highlight_count: number;
  top_pub: TopPubMini | null;
  sparkline: SparklinePoint[] | null;
}

export interface DistributionPoint {
  person_id: string;
  lastname: string;
  firstname: string;
  oestat3_name_de: string | null;
  metric_value: number;
  pubs_total: number;
  count_high: number;
  is_member: boolean;
}

export interface ResearcherDetailPerson {
  id: string;
  firstname: string;
  lastname: string;
  orcid: string | null;
  slug: string | null;
  oestat3_name_de: string | null;
  oestat3_name_en: string | null;
  research_fields: string | null;
  portrait: string | null;
  biography_de: string | null;
  external: boolean;
  deceased: boolean;
  member_type_de: string | null;
  webdb_uid: number;
}

export interface ResearcherDetailStats {
  count_high: number;
  sum_score: number;
  avg_score: number | null;
  pubs_total: number;
  self_highlight_count: number;
  prev_count_high: number;
  prev_pubs_total: number;
  top_pub: TopPubMini | null;
}

export interface ActivityMonth {
  m: string;
  high: number;
  mid: number;
  low: number;
}

export interface CoauthorRow {
  id: string;
  firstname: string;
  lastname: string;
  slug: string | null;
  oestat3_name_de: string | null;
  shared_pubs: number;
}

export interface PersonPublicationRow {
  id: string;
  title: string;
  haiku: string | null;
  citation: string | null;
  press_score: number;
  published_at: string;
  authorship: string | null;
  mahighlight: boolean;
  highlight: boolean;
  band: 'high' | 'mid' | 'low';
}

export interface ResearcherDetail {
  person: ResearcherDetailPerson | null;
  stats: ResearcherDetailStats | null;
  activity: ActivityMonth[] | null;
  coauthors: CoauthorRow[] | null;
  publications: PersonPublicationRow[] | null;
}

// Filter shape — also used by the API route Zod schema and the nuqs parsers.
export interface LeaderboardFilters {
  since: string; // ISO date 'YYYY-MM-DD'
  metric: LeaderboardMetric;
  authorship_scope: AuthorshipScope;
  oestat3_ids: string[] | null;
  include_external: boolean;
  include_deceased: boolean;
  member_only: boolean;
  min_value: number;
  limit: number;
}

export const METRIC_LABELS: Record<LeaderboardMetric, string> = {
  count_high: 'Hochbewertete Pubs (≥ 70 %)',
  sum_score: 'Summe Press-Score',
  weighted_avg: 'Ø Score (verlässlich, gewichtet)',
  avg_score: 'Ø Score (roh)',
  pubs_total: 'Pubs gesamt',
};

export const METRIC_SHORT_LABELS: Record<LeaderboardMetric, string> = {
  count_high: 'Hochbewertet',
  sum_score: 'Σ Score',
  weighted_avg: 'Ø verlässlich',
  avg_score: 'Ø roh',
  pubs_total: 'Pubs',
};

/**
 * Sensible min_value default per metric. count_high/pubs_total: 1 (at least one).
 * sum_score: 0.5 (at least half a "press-eligible point"). avg_score: 0 (any),
 * because requiring ≥ 1 means avg ≥ 100%, which is impossible.
 */
export function defaultMinValueFor(metric: LeaderboardMetric): number {
  switch (metric) {
    case 'count_high':    return 1;
    case 'sum_score':     return 0.5;
    case 'avg_score':     return 0;
    case 'weighted_avg':  return 0;
    case 'pubs_total':    return 1;
  }
}

export const SINCE_PRESETS = [
  { value: '3M', label: '3 Monate', months: 3 },
  { value: '6M', label: '6 Monate', months: 6 },
  { value: '12M', label: '12 Monate', months: 12 },
  { value: '24M', label: '24 Monate', months: 24 },
  { value: 'all', label: 'Alle', months: 600 },
] as const;

export type SincePreset = (typeof SINCE_PRESETS)[number]['value'];

export function sincePresetToDate(preset: SincePreset): string {
  const months = SINCE_PRESETS.find((p) => p.value === preset)?.months ?? 12;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}
