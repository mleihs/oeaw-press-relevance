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
    const hasDirectPdf = isPdfUrl(pub.url);
    const hasCsvAbstract = !!pub.abstract;

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
        emit('source_try', { index: i, source: 'pdf', status: 'loading' });
        try {
          const pdfResult = await enrichFromPdf(pub.url!);
          if (pdfResult) {
            noDoi_sources.push('pdf');
            sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
            if (!noDoi_abstract && pdfResult.abstract) {
              noDoi_abstract = pdfResult.abstract;
            }
            noDoi_snippet = pdfResult.full_text_snippet || undefined;
            noDoi_wordCount = pdfResult.word_count || 0;
            emit('source_done', {
              index: i,
              source: 'pdf',
              status: 'success',
              found: { abstract: truncate(pdfResult.abstract, 120) },
            });
          } else {
            emit('source_done', { index: i, source: 'pdf', status: 'no_data' });
          }
        } catch (err) {
          emit('source_done', {
            index: i,
            source: 'pdf',
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
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
    let mergedAbstract: string | undefined = pub.abstract || undefined;
    const mergedKeywords: string[] = [];
    let mergedJournal: string | undefined;
    let mergedSnippet: string | undefined;
    let mergedWordCount = 0;
    let mergedPublishedAt: string | undefined;
    const sourcesUsed: string[] = [];
    let apiPdfUrl: string | undefined;

    const webdbHit = enrichFromWebDb(pub);
    if (webdbHit) {
      if (!mergedAbstract && webdbHit.abstract) {
        mergedAbstract = webdbHit.abstract;
      }
      if (webdbHit.word_count && webdbHit.word_count > mergedWordCount) {
        mergedWordCount = webdbHit.word_count;
      }
      sourcesUsed.push(WEBDB_SOURCE_TAG);
      sourceCounts[WEBDB_SOURCE_TAG] = (sourceCounts[WEBDB_SOURCE_TAG] || 0) + 1;
    }

    if (hasCsvAbstract) {
      sourcesUsed.push('csv');
      sourceCounts['csv'] = (sourceCounts['csv'] || 0) + 1;
    }

    // Phase 1: CrossRef, OpenAlex, Unpaywall
    for (const sourceName of PRE_PDF_SOURCES) {
      emit('source_try', { index: i, source: sourceName, status: 'loading' });
      try {
        const result = await SOURCE_FETCHERS[sourceName](pub.doi!);
        if (result) {
          sourcesUsed.push(sourceName);
          sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;
          if (!mergedAbstract && result.abstract) mergedAbstract = result.abstract;
          if (result.keywords) {
            for (const kw of result.keywords) {
              if (!mergedKeywords.includes(kw)) mergedKeywords.push(kw);
            }
          }
          if (!mergedJournal && result.journal) mergedJournal = result.journal;
          if (
            result.full_text_snippet &&
            (!mergedSnippet || result.full_text_snippet.length > mergedSnippet.length)
          ) {
            mergedSnippet = result.full_text_snippet;
          }
          if (!apiPdfUrl && result.pdf_url) apiPdfUrl = result.pdf_url;
          if (result.word_count && result.word_count > mergedWordCount) {
            mergedWordCount = result.word_count;
          }
          if (!mergedPublishedAt && result.published_at) {
            mergedPublishedAt = result.published_at;
          }
          emit('source_done', {
            index: i,
            source: sourceName,
            status: 'success',
            found: {
              abstract: truncate(result.abstract, 120),
              journal: result.journal,
              keywords: result.keywords?.slice(0, 5),
            },
          });
        } else {
          emit('source_done', { index: i, source: sourceName, status: 'no_data' });
        }
      } catch (err) {
        emit('source_done', {
          index: i,
          source: sourceName,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    // Phase 2: Direct PDF from pub.url, before Semantic Scholar. Only if we
    // don't have an abstract yet; direct ÖAW PDFs are fast and reliable.
    if (!mergedAbstract && hasDirectPdf) {
      emit('source_try', { index: i, source: 'pdf', status: 'loading' });
      try {
        const pdfResult = await enrichFromPdf(pub.url!);
        if (pdfResult) {
          sourcesUsed.push('pdf');
          sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
          if (pdfResult.abstract) mergedAbstract = pdfResult.abstract;
          if (
            pdfResult.full_text_snippet &&
            (!mergedSnippet || pdfResult.full_text_snippet.length > mergedSnippet.length)
          ) {
            mergedSnippet = pdfResult.full_text_snippet;
          }
          if (pdfResult.word_count && pdfResult.word_count > mergedWordCount) {
            mergedWordCount = pdfResult.word_count;
          }
          emit('source_done', {
            index: i,
            source: 'pdf',
            status: 'success',
            found: { abstract: truncate(pdfResult.abstract, 120) },
          });
        } else {
          emit('source_done', { index: i, source: 'pdf', status: 'no_data' });
        }
      } catch (err) {
        emit('source_done', {
          index: i,
          source: 'pdf',
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Phase 3: Semantic Scholar (slowest — only if still missing data).
    for (const sourceName of POST_PDF_SOURCES) {
      emit('source_try', { index: i, source: sourceName, status: 'loading' });
      try {
        const result = await SOURCE_FETCHERS[sourceName](pub.doi!);
        if (result) {
          sourcesUsed.push(sourceName);
          sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;
          if (!mergedAbstract && result.abstract) mergedAbstract = result.abstract;
          if (result.keywords) {
            for (const kw of result.keywords) {
              if (!mergedKeywords.includes(kw)) mergedKeywords.push(kw);
            }
          }
          if (!mergedJournal && result.journal) mergedJournal = result.journal;
          if (
            result.full_text_snippet &&
            (!mergedSnippet || result.full_text_snippet.length > mergedSnippet.length)
          ) {
            mergedSnippet = result.full_text_snippet;
          }
          if (!apiPdfUrl && result.pdf_url) apiPdfUrl = result.pdf_url;
          if (result.word_count && result.word_count > mergedWordCount) {
            mergedWordCount = result.word_count;
          }
          if (!mergedPublishedAt && result.published_at) {
            mergedPublishedAt = result.published_at;
          }
          emit('source_done', {
            index: i,
            source: sourceName,
            status: 'success',
            found: {
              abstract: truncate(result.abstract, 120),
              journal: result.journal,
              keywords: result.keywords?.slice(0, 5),
            },
          });
        } else {
          emit('source_done', { index: i, source: sourceName, status: 'no_data' });
        }
      } catch (err) {
        emit('source_done', {
          index: i,
          source: sourceName,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    // Phase 4: Fallback PDF from API-discovered URL, if still no abstract
    // and the URL differs from the one already tried in Phase 2.
    if (!mergedAbstract && apiPdfUrl && apiPdfUrl !== pub.url) {
      // Skip event noise if Phase-2 already emitted a 'pdf' cycle.
      if (!hasDirectPdf) {
        emit('source_try', { index: i, source: 'pdf', status: 'loading' });
      }
      try {
        const pdfResult = await enrichFromPdf(apiPdfUrl);
        if (pdfResult) {
          if (!sourcesUsed.includes('pdf')) {
            sourcesUsed.push('pdf');
            sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
          }
          if (pdfResult.abstract) mergedAbstract = pdfResult.abstract;
          if (
            pdfResult.full_text_snippet &&
            (!mergedSnippet || pdfResult.full_text_snippet.length > mergedSnippet.length)
          ) {
            mergedSnippet = pdfResult.full_text_snippet;
          }
          if (pdfResult.word_count && pdfResult.word_count > mergedWordCount) {
            mergedWordCount = pdfResult.word_count;
          }
          if (!hasDirectPdf) {
            emit('source_done', {
              index: i,
              source: 'pdf',
              status: 'success',
              found: { abstract: truncate(pdfResult.abstract, 120) },
            });
          }
        } else if (!hasDirectPdf) {
          emit('source_done', { index: i, source: 'pdf', status: 'no_data' });
        }
      } catch (err) {
        if (!hasDirectPdf) {
          emit('source_done', {
            index: i,
            source: 'pdf',
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    const hasAbstract = !!mergedAbstract;
    const hasAnyData = sourcesUsed.length > 0;
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
      enrichedAbstract: mergedAbstract || null,
      enrichedKeywords:
        mergedKeywords.length > 0 ? mergedKeywords.slice(0, 20) : null,
      enrichedJournal: mergedJournal || null,
      enrichedSource: sourcesUsed.join('+') || null,
      fullTextSnippet: mergedSnippet || null,
      wordCount: mergedWordCount,
      updatedAt: new Date().toISOString(),
    };
    if (!pub.published_at && mergedPublishedAt) {
      setObj.publishedAt = mergedPublishedAt;
    }

    await db.update(publications).set(setObj).where(eq(publications.id, pub.id));

    emit('pub_done', {
      index: i,
      title: pub.title,
      final_status: finalStatus,
      sources_used: sourcesUsed,
      has_abstract: hasAbstract,
      date_filled: !pub.published_at && !!mergedPublishedAt,
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
