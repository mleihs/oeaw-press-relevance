// "Phase 0" enrichment: WebDB already ships ~3,880 publications with a
// curated German `summary_de` (and frequently `summary_en`). For those rows
// we don't need to call CrossRef/OpenAlex/etc. to obtain analyzable content —
// we already have a higher-quality, German press-style summary.
//
// This module's job is to convert a Publication row's WebDB-native fields into
// the same EnrichmentResult shape the API-cascade returns, so it can be
// dropped in as a free Phase-0 step before any external API call. It does NOT
// touch the DB itself; both the API route and scripts/session-pipeline.mjs
// call it and persist the result through their existing UPDATE paths.

import type { EnrichmentResult, Publication } from '../types';

export const WEBDB_SOURCE_TAG = 'webdb_summary';

function wordCount(text: string | null | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * If `pub` has a WebDB-native press summary, return an EnrichmentResult
 * usable as a free, non-API content source. summary_de is preferred over
 * summary_en (German is the press-officer working language).
 *
 * Returns null when WebDB has nothing to offer; callers then fall back to
 * the API cascade as before.
 */
export function enrichFromWebDb(pub: Publication): EnrichmentResult | null {
  const de = pub.summary_de?.trim();
  const en = pub.summary_en?.trim();

  if (!de && !en) return null;

  const abstract = de || en;
  if (!abstract) return null;

  return {
    abstract,
    source: WEBDB_SOURCE_TAG,
    word_count: wordCount(abstract),
  };
}

/**
 * True if the publication carries WebDB-native source-of-truth content.
 * Cheap predicate for callers that want to skip API calls entirely.
 */
export function hasWebDbContent(pub: Publication): boolean {
  return Boolean(pub.summary_de?.trim() || pub.summary_en?.trim());
}
