/** Press-release wire DTO (ÖAW-Hauptseite press coverage, matched to
 *  publications via DOI). Part of the publications domain — press_cluster
 *  similarity scoring builds on these rows. */

import type { Lang } from './core';

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
