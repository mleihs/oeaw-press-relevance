export interface Publication {
  id: string;
  // Identity
  webdb_uid: number | null;
  csv_uid: string | null;
  // Source-of-truth (WebDB)
  title: string;
  original_title: string | null;
  authors: string | null;
  lead_author: string | null;
  abstract: string | null;
  summary_de: string | null;
  summary_en: string | null;
  doi: string | null;
  doi_link: string | null;
  published_at: string | null;
  publication_type: string | null;
  publication_type_id: string | null;
  institute: string | null;
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

export interface Oestat6Category {
  id: string;
  webdb_uid: number;
  oestat3: number;
  name_de: string;
  name_en: string;
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

/** A publication with all related entities joined in. Used by the detail view. */
export interface PublicationWithRelations extends Publication {
  publication_type_lookup?: PublicationType | null;
  authors_resolved?: Array<Person & { authorship: string | null; highlight: boolean; mahighlight: boolean }>;
  orgunits?: Orgunit[];
  projects?: Project[];
}

export interface PublicationInsert {
  title: string;
  authors?: string | null;
  abstract?: string | null;
  doi?: string | null;
  published_at?: string | null;
  publication_type?: string | null;
  institute?: string | null;
  open_access?: boolean;
  oa_type?: string | null;
  url?: string | null;
  citation?: string | null;
  csv_uid?: string | null;
  import_batch?: string | null;
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
  llmModel: string;
  minWordCount: number;
  batchSize: number;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  openrouterApiKey: '',
  llmModel: 'deepseek/deepseek-chat',
  minWordCount: 100,
  batchSize: 3,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
};
