import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  or,
} from 'drizzle-orm';
import { db, publications, descNullsLast } from '@/lib/server/db';
import type { EnrichmentResult, Publication } from '@/lib/shared/types';
import { enrichFromCrossRef } from './crossref';
import { enrichFromOpenAlex } from './openalex';
import { enrichFromUnpaywall } from './unpaywall';
import { enrichFromSemanticScholar } from './semantic-scholar';
import { enrichFromPdf } from './pdf-extract';
import { enrichFromWebDb, WEBDB_SOURCE_TAG } from './webdb-native';
import { extractVenue } from './venue-extract';
import { publicationToApi } from '../publications/to-api';
import type { EnrichmentBatchPayload } from '@/lib/shared/schemas';

// Sources that require a DOI (order: CrossRef, OpenAlex, Unpaywall, then
// Semantic Scholar last because it's the slowest).
const PRE_PDF_SOURCES = ['crossref', 'openalex', 'unpaywall'] as const;
const POST_PDF_SOURCES = ['semantic_scholar'] as const;

type SourceName = 'crossref' | 'openalex' | 'unpaywall' | 'semantic_scholar';

const SOURCE_FETCHERS: Record<SourceName, (doi: string) => Promise<EnrichmentResult | null>> = {
  crossref: enrichFromCrossRef,
  openalex: enrichFromOpenAlex,
  unpaywall: enrichFromUnpaywall,
  semantic_scholar: enrichFromSemanticScholar,
};

function truncate(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  return text.length > max ? text.slice(0, max) + '...' : text;
}

function isPdfUrl(url: string | null): boolean {
  return !!url && /\.pdf$/i.test(url);
}

/**
 * First directly-fetchable PDF URL for a publication. WebDB-sourced rows carry
 * their links in website_link / download_link and leave `url` empty, so all
 * three columns are checked — not just `url`.
 */
function directPdfUrl(pub: Publication): string | null {
  for (const candidate of [pub.url, pub.download_link, pub.website_link]) {
    if (isPdfUrl(candidate)) return candidate;
  }
  return null;
}

export interface EnrichmentBatchFilters {
  limit: number;
  includePartial: boolean;
  includeNoDoi: boolean;
  explicitIds: string[] | null;
}

/**
 * Adapts the zod-validated wire payload (snake_case keys) to the internal
 * camelCase filter object the rest of the module uses.
 */
export function enrichmentPayloadToFilters(
  payload: EnrichmentBatchPayload,
): EnrichmentBatchFilters {
  return {
    limit: payload.limit,
    includePartial: payload.include_partial,
    includeNoDoi: payload.include_no_doi,
    explicitIds: payload.ids ?? null,
  };
}

export async function fetchPublicationsForEnrichment(
  filters: EnrichmentBatchFilters,
): Promise<Publication[]> {
  // ID-based dispatch: caller pinpoints exactly which publications to enrich
  // (used by the Augment workflow to avoid status-filter side effects).
  if (filters.explicitIds && filters.explicitIds.length > 0) {
    const rows = await db
      .select()
      .from(publications)
      .where(
        inArray(publications.id, filters.explicitIds.slice(0, filters.limit)),
      );
    return rows.map(publicationToApi);
  }

  const statusFilter = filters.includePartial
    ? ['pending', 'partial']
    : ['pending'];

  const doiRows = await db
    .select()
    .from(publications)
    .where(
      and(
        isNotNull(publications.doi),
        inArray(publications.enrichmentStatus, statusFilter),
      ),
    )
    .orderBy(descNullsLast(publications.publishedAt))
    .limit(filters.limit);

  let noDoiRows: typeof doiRows = [];
  if (filters.includeNoDoi) {
    const remaining = filters.limit - doiRows.length;
    if (remaining > 0) {
      noDoiRows = await db
        .select()
        .from(publications)
        .where(
          and(
            isNull(publications.doi),
            or(
              like(publications.url, '%.pdf'),
              isNotNull(publications.abstract),
            ),
            inArray(publications.enrichmentStatus, statusFilter),
          ),
        )
        .orderBy(descNullsLast(publications.publishedAt))
        .limit(remaining);
    }
  }

  return [...doiRows, ...noDoiRows].map(publicationToApi);
}

export interface EnrichmentBatchRunOptions {
  pubs: Publication[];
  abortSignal: AbortSignal;
  emit: (type: string, data: unknown) => void;
}

/**
 * Mutable per-publication accumulator for the DOI enrichment cascade. Every
 * source folds its result in via `mergeEnrichmentResult`; the final values
 * become the row's single DB update payload.
 */
interface EnrichmentAccumulator {
  abstract: string | undefined;
  keywords: string[];
  journal: string | undefined;
  snippet: string | undefined;
  wordCount: number;
  publishedAt: string | undefined;
  apiPdfUrl: string | undefined;
  sourcesUsed: string[];
}

/**
 * Folds one source's `EnrichmentResult` into the accumulator. Field policy:
 * abstract / journal / publishedAt / apiPdfUrl — first non-empty wins;
 * keywords — union (dedup, insertion order); snippet — longest wins;
 * wordCount — max. Appends the source name to `sourcesUsed`. Shared verbatim
 * by the PRE_PDF and POST_PDF cascade loops, which used to copy-paste it.
 */
function mergeEnrichmentResult(
  acc: EnrichmentAccumulator,
  result: EnrichmentResult,
  sourceName: string,
): void {
  acc.sourcesUsed.push(sourceName);
  if (!acc.abstract && result.abstract) acc.abstract = result.abstract;
  if (result.keywords) {
    for (const kw of result.keywords) {
      if (!acc.keywords.includes(kw)) acc.keywords.push(kw);
    }
  }
  if (!acc.journal && result.journal) acc.journal = result.journal;
  if (
    result.full_text_snippet &&
    (!acc.snippet || result.full_text_snippet.length > acc.snippet.length)
  ) {
    acc.snippet = result.full_text_snippet;
  }
  if (!acc.apiPdfUrl && result.pdf_url) acc.apiPdfUrl = result.pdf_url;
  if (result.word_count && result.word_count > acc.wordCount) {
    acc.wordCount = result.word_count;
  }
  if (!acc.publishedAt && result.published_at) {
    acc.publishedAt = result.published_at;
  }
}

/**
 * Runs the PDF-extract source for one publication: emits the source_try /
 * source_done SSE cycle and returns the result (or `null` on no-data / error
 * / throw). The merge of the result stays at the call site — the three
 * callers diverge (the DOI-less path straight-assigns snippet + word_count,
 * the DOI phases use longest-wins snippet + max word_count). Pass
 * `emitEvents = false` to suppress the SSE frames for the Phase-4 fallback,
 * where Phase 2 already emitted a 'pdf' cycle for the same publication.
 */
async function tryPdf(
  url: string,
  index: number,
  emit: (type: string, data: unknown) => void,
  emitEvents = true,
): Promise<EnrichmentResult | null> {
  if (emitEvents) {
    emit('source_try', { index, source: 'pdf', status: 'loading' });
  }
  try {
    const pdfResult = await enrichFromPdf(url);
    if (emitEvents) {
      if (pdfResult) {
        emit('source_done', {
          index,
          source: 'pdf',
          status: 'success',
          found: { abstract: truncate(pdfResult.abstract, 120) },
        });
      } else {
        emit('source_done', { index, source: 'pdf', status: 'no_data' });
      }
    }
    return pdfResult;
  } catch (err) {
    if (emitEvents) {
      emit('source_done', {
        index,
        source: 'pdf',
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    return null;
  }
}

/**
 * Mutable per-publication context for the DOI cascade. Built once per pub at
 * the top of the with-DOI path; passed to `runApiSource` for every source so
 * it can fold the result into the accumulator and emit SSE frames against the
 * right index.
 */
interface DoiCascadeCtx {
  acc: EnrichmentAccumulator;
  sourceCounts: Record<string, number>;
  index: number;
  emit: (type: string, data: unknown) => void;
  doi: string;
}

/**
 * One source-fetch cycle in the DOI cascade: emits the source_try /
 * source_done SSE pair, folds a successful result into the accumulator via
 * `mergeEnrichmentResult`, paces by `pacingMs` at the end. Shared between the
 * PRE_PDF and POST_PDF loops; the only difference between phases was the
 * pacing (100 ms for the fast trio, 200 ms for Semantic Scholar's tighter
 * rate limit).
 */
async function runApiSource(
  ctx: DoiCascadeCtx,
  sourceName: SourceName,
  pacingMs: number,
): Promise<void> {
  const { acc, sourceCounts, index, emit, doi } = ctx;
  emit('source_try', { index, source: sourceName, status: 'loading' });
  try {
    const result = await SOURCE_FETCHERS[sourceName](doi);
    if (result) {
      sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;
      mergeEnrichmentResult(acc, result, sourceName);
      emit('source_done', {
        index,
        source: sourceName,
        status: 'success',
        found: {
          abstract: truncate(result.abstract, 120),
          journal: result.journal,
          keywords: result.keywords?.slice(0, 5),
        },
      });
    } else {
      emit('source_done', { index, source: sourceName, status: 'no_data' });
    }
  } catch (err) {
    emit('source_done', {
      index,
      source: sourceName,
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
  await new Promise((r) => setTimeout(r, pacingMs));
}

/**
 * Drives the per-pub enrichment cascade. Two paths:
 *   - DOI-less: WebDB summary -> CSV abstract -> direct PDF (if pub.url
 *     ends in .pdf). 4 API sources emit 'skipped'.
 *   - With DOI: WebDB -> CSV -> CrossRef + OpenAlex + Unpaywall -> direct
 *     PDF (only if abstract still missing) -> Semantic Scholar -> fallback
 *     PDF from any API-discovered URL.
 *
 * Each pub gets a single DB write at the end with the merged result.
 * Final status is 'enriched' (has abstract), 'partial' (some source
 * succeeded but no abstract), or 'failed'.
 */
export async function runEnrichmentBatch(
  opts: EnrichmentBatchRunOptions,
): Promise<void> {
  const { pubs, abortSignal, emit } = opts;

  let successful = 0;
  let partial = 0;
  let failed = 0;
  let withAbstract = 0;
  const sourceCounts: Record<string, number> = {};

  for (let i = 0; i < pubs.length; i++) {
    if (abortSignal.aborted) {
      emit('cancelled', { processed: i, total: pubs.length });
      return;
    }
    const pub = pubs[i];
    const hasDoi = !!pub.doi;
    const directPdf = directPdfUrl(pub);
    const hasDirectPdf = !!directPdf;
    const hasCsvAbstract = !!pub.abstract;
    // Venue parsed from the WebDB citation exports (BibTeX/RIS/EndNote) — the
    // fallback journal source, esp. for the no-DOI path where the APIs
    // contribute nothing.
    const webdbVenue = extractVenue(pub)?.venue;

    emit('pub_start', {
      index: i,
      total: pubs.length,
      title: pub.title,
      doi: pub.doi,
      no_doi: !hasDoi,
      has_csv_abstract: hasCsvAbstract,
    });

    if (!hasDoi) {
      // -----------------------------------------------------------------
      // DOI-less publications: WebDB summary -> CSV abstract -> PDF path
      // -----------------------------------------------------------------
      for (const src of [...PRE_PDF_SOURCES, ...POST_PDF_SOURCES]) {
        emit('source_done', { index: i, source: src, status: 'skipped' });
      }

      let noDoi_abstract: string | undefined = pub.abstract || undefined;
      let noDoi_snippet: string | undefined;
      let noDoi_wordCount = 0;
      const noDoi_sources: string[] = [];

      const webdbHit = enrichFromWebDb(pub);
      if (webdbHit) {
        if (!noDoi_abstract && webdbHit.abstract) {
          noDoi_abstract = webdbHit.abstract;
        }
        if (webdbHit.word_count && webdbHit.word_count > noDoi_wordCount) {
          noDoi_wordCount = webdbHit.word_count;
        }
        noDoi_sources.push(WEBDB_SOURCE_TAG);
        sourceCounts[WEBDB_SOURCE_TAG] = (sourceCounts[WEBDB_SOURCE_TAG] || 0) + 1;
      }

      if (hasCsvAbstract) {
        noDoi_sources.push('csv');
        sourceCounts['csv'] = (sourceCounts['csv'] || 0) + 1;
      }

      if (hasDirectPdf) {
        const pdfResult = await tryPdf(directPdf!, i, emit);
        if (pdfResult) {
          noDoi_sources.push('pdf');
          sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
          if (!noDoi_abstract && pdfResult.abstract) {
            noDoi_abstract = pdfResult.abstract;
          }
          noDoi_snippet = pdfResult.full_text_snippet || undefined;
          noDoi_wordCount = pdfResult.word_count || 0;
        }
      } else {
        emit('source_done', { index: i, source: 'pdf', status: 'skipped' });
      }

      const hasAbstract = !!noDoi_abstract;
      const hasAnyData = noDoi_sources.length > 0;
      let finalStatus: 'enriched' | 'partial' | 'failed';
      if (hasAbstract) {
        finalStatus = 'enriched';
        successful++;
        withAbstract++;
      } else if (hasAnyData) {
        finalStatus = 'partial';
        partial++;
      } else {
        finalStatus = 'failed';
        failed++;
      }

      await db
        .update(publications)
        .set({
          enrichmentStatus: finalStatus,
          enrichedAbstract: noDoi_abstract || null,
          enrichedJournal: webdbVenue || null,
          enrichedSource: noDoi_sources.join('+') || null,
          fullTextSnippet: noDoi_snippet || null,
          wordCount: noDoi_wordCount,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(publications.id, pub.id));

      emit('pub_done', {
        index: i,
        title: pub.title,
        final_status: finalStatus,
        sources_used: noDoi_sources,
        has_abstract: hasAbstract,
      });

      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    // -------------------------------------------------------------------
    // With DOI: full cascade
    // CrossRef -> OpenAlex -> Unpaywall -> [PDF from pub.url] -> Semantic
    // Scholar. Pre-seed abstract from CSV if available (APIs still run for
    // keywords/journal).
    // -------------------------------------------------------------------
    const acc: EnrichmentAccumulator = {
      abstract: pub.abstract || undefined,
      keywords: [],
      journal: undefined,
      snippet: undefined,
      wordCount: 0,
      publishedAt: undefined,
      apiPdfUrl: undefined,
      sourcesUsed: [],
    };

    const webdbHit = enrichFromWebDb(pub);
    if (webdbHit) {
      if (!acc.abstract && webdbHit.abstract) {
        acc.abstract = webdbHit.abstract;
      }
      if (webdbHit.word_count && webdbHit.word_count > acc.wordCount) {
        acc.wordCount = webdbHit.word_count;
      }
      acc.sourcesUsed.push(WEBDB_SOURCE_TAG);
      sourceCounts[WEBDB_SOURCE_TAG] = (sourceCounts[WEBDB_SOURCE_TAG] || 0) + 1;
    }

    if (hasCsvAbstract) {
      acc.sourcesUsed.push('csv');
      sourceCounts['csv'] = (sourceCounts['csv'] || 0) + 1;
    }

    // The ctx bundles the per-pub mutable state that every API source call
    // needs: acc + sourceCounts get folded into, emit + index identify the
    // pub for SSE frames, doi is the lookup key for SOURCE_FETCHERS.
    const ctx: DoiCascadeCtx = {
      acc,
      sourceCounts,
      index: i,
      emit,
      doi: pub.doi!,
    };

    // Phase 1: CrossRef, OpenAlex, Unpaywall (100 ms inter-call pacing).
    for (const sourceName of PRE_PDF_SOURCES) {
      await runApiSource(ctx, sourceName, 100);
    }

    // Phase 2: Direct PDF from pub.url, before Semantic Scholar. Only if we
    // don't have an abstract yet; direct ÖAW PDFs are fast and reliable.
    if (!acc.abstract && hasDirectPdf) {
      const pdfResult = await tryPdf(directPdf!, i, emit);
      if (pdfResult) {
        acc.sourcesUsed.push('pdf');
        sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
        if (pdfResult.abstract) acc.abstract = pdfResult.abstract;
        if (
          pdfResult.full_text_snippet &&
          (!acc.snippet || pdfResult.full_text_snippet.length > acc.snippet.length)
        ) {
          acc.snippet = pdfResult.full_text_snippet;
        }
        if (pdfResult.word_count && pdfResult.word_count > acc.wordCount) {
          acc.wordCount = pdfResult.word_count;
        }
      }
    }

    // Phase 3: Semantic Scholar (slowest — only if still missing data).
    // 200 ms pacing because Semantic Scholar's rate limit is tighter than
    // the Phase-1 trio's.
    for (const sourceName of POST_PDF_SOURCES) {
      await runApiSource(ctx, sourceName, 200);
    }

    // Phase 4: Fallback PDF from API-discovered URL, if still no abstract
    // and the URL differs from the one already tried in Phase 2.
    if (!acc.abstract && acc.apiPdfUrl && acc.apiPdfUrl !== directPdf) {
      // emitEvents is gated on !hasDirectPdf: when Phase 2 already ran a
      // 'pdf' cycle for this pub, suppress the duplicate SSE frames here.
      const pdfResult = await tryPdf(acc.apiPdfUrl, i, emit, !hasDirectPdf);
      if (pdfResult) {
        if (!acc.sourcesUsed.includes('pdf')) {
          acc.sourcesUsed.push('pdf');
          sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
        }
        if (pdfResult.abstract) acc.abstract = pdfResult.abstract;
        if (
          pdfResult.full_text_snippet &&
          (!acc.snippet || pdfResult.full_text_snippet.length > acc.snippet.length)
        ) {
          acc.snippet = pdfResult.full_text_snippet;
        }
        if (pdfResult.word_count && pdfResult.word_count > acc.wordCount) {
          acc.wordCount = pdfResult.word_count;
        }
      }
    }

    const hasAbstract = !!acc.abstract;
    const hasAnyData = acc.sourcesUsed.length > 0;
    let finalStatus: 'enriched' | 'partial' | 'failed';
    if (hasAbstract) {
      finalStatus = 'enriched';
      successful++;
      withAbstract++;
    } else if (hasAnyData) {
      finalStatus = 'partial';
      partial++;
    } else {
      finalStatus = 'failed';
      failed++;
    }

    // Build the update payload — published_at is conditionally added only
    // when the row is currently empty and a fresh date was discovered.
    const setObj: Partial<typeof publications.$inferInsert> = {
      enrichmentStatus: finalStatus,
      enrichedAbstract: acc.abstract || null,
      enrichedKeywords:
        acc.keywords.length > 0 ? acc.keywords.slice(0, 20) : null,
      // API venue wins (canonical name); parsed WebDB venue is the fallback.
      enrichedJournal: acc.journal || webdbVenue || null,
      enrichedSource: acc.sourcesUsed.join('+') || null,
      fullTextSnippet: acc.snippet || null,
      wordCount: acc.wordCount,
      updatedAt: new Date().toISOString(),
    };
    if (!pub.published_at && acc.publishedAt) {
      setObj.publishedAt = acc.publishedAt;
    }

    await db.update(publications).set(setObj).where(eq(publications.id, pub.id));

    emit('pub_done', {
      index: i,
      title: pub.title,
      final_status: finalStatus,
      sources_used: acc.sourcesUsed,
      has_abstract: hasAbstract,
      date_filled: !pub.published_at && !!acc.publishedAt,
    });

    await new Promise((r) => setTimeout(r, 100));
  }

  emit('complete', {
    processed: pubs.length,
    total: pubs.length,
    successful,
    partial,
    failed,
    with_abstract: withAbstract,
    sources: sourceCounts,
  });
}
