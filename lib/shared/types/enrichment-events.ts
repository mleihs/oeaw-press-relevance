/** SSE/progress event shapes streamed by the enrichment- and analysis-batch
 *  endpoints and consumed by the progress modals. */

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
