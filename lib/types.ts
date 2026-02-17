export interface Publication {
  id: string;
  title: string;
  authors: string | null;
  abstract: string | null;
  doi: string | null;
  published_at: string | null;
  publication_type: string | null;
  institute: string | null;
  open_access: boolean;
  oa_type: string | null;
  url: string | null;
  citation: string | null;
  csv_uid: string | null;
  // Enrichment
  enrichment_status: 'pending' | 'enriched' | 'failed';
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
  llm_model: string | null;
  analysis_cost: number | null;
  // Metadata
  import_batch: string | null;
  created_at: string;
  updated_at: string;
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
}

export interface LLMResponse {
  evaluations: AnalysisResult[];
}

export interface PublicationStats {
  total: number;
  enriched: number;
  analyzed: number;
  avg_score: number | null;
  high_score_count: number;
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
  llmModel: 'anthropic/claude-sonnet-4',
  minWordCount: 100,
  batchSize: 3,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
};
