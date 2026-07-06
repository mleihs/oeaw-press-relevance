/** Publications wire DTOs: the core publication row, its joined detail shape,
 *  the parsed Pure citation projection, and the enrichment/analysis result
 *  shapes produced by the scoring pipeline. */

import type { Decision, FlagNote } from './core';
import type { PressRelease } from './press-releases';
import type { Person, Project } from './people';

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
