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

// Inter-call pacing (ms). The fast trio (CrossRef/OpenAlex/Unpaywall) tolerates
// a short gap; Semantic Scholar's rate limit is tighter, so it gets double.
// A final gap separates one publication's cascade from the next.
const PACING_FAST_MS = 100;
const PACING_SEMANTIC_SCHOLAR_MS = 200;
const PACING_INTER_PUB_MS = 100;

type SourceName = 'crossref' | 'openalex' | 'unpaywall' | 'semantic_scholar';

/** Terminal enrichment status written to the row at the end of its cascade. */
type EnrichmentFinalStatus = 'enriched' | 'partial' | 'failed';

/** SSE sink: `emit(type, data)` pushes one frame to the streaming client. */
type Emit = (type: string, data: unknown) => void;

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
  emit: Emit;
}

/**
 * Mutable per-publication accumulator for the enrichment cascade. Every source
 * folds its result in (`mergeEnrichmentResult` / `mergePdfIntoAcc` / the local
 * seed); the final values become the row's single DB update payload. Both the
 * DOI and DOI-less paths use it — the latter simply never populates `keywords`,
 * `journal`, `publishedAt`, or `apiPdfUrl`.
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

/** Batch-level tallies summed across all publications for the `complete` frame. */
interface BatchCounters {
  successful: number;
  partial: number;
  failed: number;
  withAbstract: number;
}

/**
 * Folds one API source's `EnrichmentResult` into the accumulator. Field policy:
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
 * Folds a successful PDF result into the DOI-cascade accumulator: idempotent
 * 'pdf' source tag, overwrite-from-empty abstract (the phases only run while
 * abstract-less), longest-wins snippet, max word_count. Shared by both DOI PDF
 * phases — the idempotent push lets the Phase-4 fallback run after Phase 2
 * without double-counting the source.
 */
function mergePdfIntoAcc(
  acc: EnrichmentAccumulator,
  pdfResult: EnrichmentResult,
  sourceCounts: Record<string, number>,
): void {
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

/**
 * Folds the two always-available local sources into the accumulator: the WebDB
 * native summary (abstract + word_count) and the CSV abstract bookkeeping.
 * Identical for both paths, so it runs once before the branch. Emits nothing.
 * Bumps `sourceCounts`.
 */
function seedFromLocalSources(
  pub: Publication,
  acc: EnrichmentAccumulator,
  sourceCounts: Record<string, number>,
): void {
  const webdbHit = enrichFromWebDb(pub);
  if (webdbHit) {
    if (!acc.abstract && webdbHit.abstract) acc.abstract = webdbHit.abstract;
    if (webdbHit.word_count && webdbHit.word_count > acc.wordCount) {
      acc.wordCount = webdbHit.word_count;
    }
    acc.sourcesUsed.push(WEBDB_SOURCE_TAG);
    sourceCounts[WEBDB_SOURCE_TAG] = (sourceCounts[WEBDB_SOURCE_TAG] || 0) + 1;
  }
  if (pub.abstract) {
    acc.sourcesUsed.push('csv');
    sourceCounts['csv'] = (sourceCounts['csv'] || 0) + 1;
  }
}

/**
 * Derives the terminal enrichment status from the merged result and bumps the
 * batch tallies. 'enriched' = an abstract was found; 'partial' = some source
 * returned data but no abstract; 'failed' = nothing. Shared verbatim by both
 * the DOI and DOI-less paths.
 */
function finalizeStatus(
  hasAbstract: boolean,
  hasAnyData: boolean,
  counters: BatchCounters,
): EnrichmentFinalStatus {
  if (hasAbstract) {
    counters.successful++;
    counters.withAbstract++;
    return 'enriched';
  }
  if (hasAnyData) {
    counters.partial++;
    return 'partial';
  }
  counters.failed++;
  return 'failed';
}

/**
 * Single DB write per publication. The common columns are shared by both
 * paths; keywords are persisted only when `writeKeywords` (the DOI path) — the
 * DOI-less cascade never produces them, so its column is left untouched rather
 * than clobbered to null. published_at is filled only when the row had none and
 * a source supplied one.
 */
async function writeEnrichment(
  pub: Publication,
  status: EnrichmentFinalStatus,
  acc: EnrichmentAccumulator,
  venue: string | undefined,
  writeKeywords: boolean,
): Promise<void> {
  const setObj: Partial<typeof publications.$inferInsert> = {
    enrichmentStatus: status,
    enrichedAbstract: acc.abstract || null,
    // API venue wins (canonical name); parsed WebDB venue is the fallback.
    enrichedJournal: acc.journal || venue || null,
    enrichedSource: acc.sourcesUsed.join('+') || null,
    fullTextSnippet: acc.snippet || null,
    wordCount: acc.wordCount,
    // updated_at is set by the publications_set_updated_at trigger.
  };
  if (writeKeywords) {
    setObj.enrichedKeywords =
      acc.keywords.length > 0 ? acc.keywords.slice(0, 20) : null;
  }
  if (!pub.published_at && acc.publishedAt) {
    setObj.publishedAt = acc.publishedAt;
  }
  await db.update(publications).set(setObj).where(eq(publications.id, pub.id));
}

/**
 * Runs the PDF-extract source for one publication: emits the source_try /
 * source_done SSE cycle and returns the result (or `null` on no-data / error
 * / throw). The merge of the result stays at the call site — the callers
 * diverge (the DOI-less path straight-assigns snippet + word_count, the DOI
 * phases use longest-wins snippet + max word_count). Pass `emitEvents = false`
 * to suppress the SSE frames for the Phase-4 fallback, where Phase 2 already
 * emitted a 'pdf' cycle for the same publication.
 */
async function tryPdf(
  url: string,
  index: number,
  emit: Emit,
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
  emit: Emit;
  doi: string;
}

/**
 * One source-fetch cycle in the DOI cascade: emits the source_try /
 * source_done SSE pair, folds a successful result into the accumulator via
 * `mergeEnrichmentResult`, paces by `pacingMs` at the end. Shared between the
 * PRE_PDF and POST_PDF loops; the only difference between phases was the
 * pacing (fast trio vs. Semantic Scholar's tighter rate limit).
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
 * DOI-less source cascade: the 4 DOI-only APIs are emitted as 'skipped', then a
 * direct PDF is tried if `pub.url`/links point at one. The PDF straight-assigns
 * snippet + word_count (single PDF source, so no longest-wins/max needed). The
 * local WebDB/CSV seed already ran before the branch.
 */
async function enrichNoDoi(
  acc: EnrichmentAccumulator,
  directPdf: string | null,
  index: number,
  emit: Emit,
  sourceCounts: Record<string, number>,
): Promise<void> {
  for (const src of [...PRE_PDF_SOURCES, ...POST_PDF_SOURCES]) {
    emit('source_done', { index, source: src, status: 'skipped' });
  }

  if (directPdf) {
    const pdfResult = await tryPdf(directPdf, index, emit);
    if (pdfResult) {
      acc.sourcesUsed.push('pdf');
      sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
      if (!acc.abstract && pdfResult.abstract) acc.abstract = pdfResult.abstract;
      acc.snippet = pdfResult.full_text_snippet || undefined;
      acc.wordCount = pdfResult.word_count || 0;
    }
  } else {
    emit('source_done', { index, source: 'pdf', status: 'skipped' });
  }
}

/**
 * Full DOI cascade: CrossRef -> OpenAlex -> Unpaywall -> [direct PDF if still
 * abstract-less] -> Semantic Scholar -> [fallback PDF from an API-discovered
 * URL]. Everything folds into `ctx.acc`. The local WebDB/CSV seed already ran
 * before the branch.
 */
async function enrichWithDoi(
  ctx: DoiCascadeCtx,
  directPdf: string | null,
): Promise<void> {
  const { acc, sourceCounts, index, emit } = ctx;

  // Phase 1: CrossRef, OpenAlex, Unpaywall.
  for (const sourceName of PRE_PDF_SOURCES) {
    await runApiSource(ctx, sourceName, PACING_FAST_MS);
  }

  // Phase 2: direct PDF from pub.url, before Semantic Scholar — only if we
  // still lack an abstract. Direct ÖAW PDFs are fast and reliable.
  if (!acc.abstract && directPdf) {
    const pdfResult = await tryPdf(directPdf, index, emit);
    if (pdfResult) mergePdfIntoAcc(acc, pdfResult, sourceCounts);
  }

  // Phase 3: Semantic Scholar (slowest — tighter rate limit).
  for (const sourceName of POST_PDF_SOURCES) {
    await runApiSource(ctx, sourceName, PACING_SEMANTIC_SCHOLAR_MS);
  }

  // Phase 4: fallback PDF from an API-discovered URL, if still abstract-less
  // and it differs from the Phase-2 URL. emitEvents is gated on !directPdf:
  // when Phase 2 already ran a 'pdf' cycle, suppress the duplicate SSE frames.
  if (!acc.abstract && acc.apiPdfUrl && acc.apiPdfUrl !== directPdf) {
    const pdfResult = await tryPdf(acc.apiPdfUrl, index, emit, !directPdf);
    if (pdfResult) mergePdfIntoAcc(acc, pdfResult, sourceCounts);
  }
}

/**
 * Drives the per-pub enrichment cascade. Each pub seeds from the local WebDB +
 * CSV sources, then runs one of two API/PDF cascades:
 *   - DOI-less (`enrichNoDoi`): direct PDF only; the 4 APIs emit 'skipped'.
 *   - With DOI (`enrichWithDoi`): CrossRef + OpenAlex + Unpaywall -> direct PDF
 *     (only if abstract still missing) -> Semantic Scholar -> fallback PDF.
 *
 * Each pub gets a single DB write at the end with the merged result. Final
 * status is 'enriched' (has abstract), 'partial' (a source succeeded but no
 * abstract), or 'failed'.
 */
export async function runEnrichmentBatch(
  opts: EnrichmentBatchRunOptions,
): Promise<void> {
  const { pubs, abortSignal, emit } = opts;

  const counters: BatchCounters = {
    successful: 0,
    partial: 0,
    failed: 0,
    withAbstract: 0,
  };
  const sourceCounts: Record<string, number> = {};

  for (let i = 0; i < pubs.length; i++) {
    if (abortSignal.aborted) {
      emit('cancelled', { processed: i, total: pubs.length });
      return;
    }
    const pub = pubs[i];
    const directPdf = directPdfUrl(pub);
    // Venue parsed from the WebDB citation exports (BibTeX/RIS/EndNote) — the
    // fallback journal source, esp. for the no-DOI path where the APIs
    // contribute nothing.
    const webdbVenue = extractVenue(pub)?.venue;

    emit('pub_start', {
      index: i,
      total: pubs.length,
      title: pub.title,
      doi: pub.doi,
      no_doi: !pub.doi,
      has_csv_abstract: !!pub.abstract,
    });

    // Per-pub accumulator; CSV abstract pre-seeds the merge. WebDB + CSV fold
    // in first (identical for both paths), then the path-specific cascade runs.
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
    seedFromLocalSources(pub, acc, sourceCounts);

    if (!pub.doi) {
      await enrichNoDoi(acc, directPdf, i, emit, sourceCounts);
    } else {
      // pub.doi is narrowed to string in this branch (truthy), so no `!`.
      const ctx: DoiCascadeCtx = {
        acc,
        sourceCounts,
        index: i,
        emit,
        doi: pub.doi,
      };
      await enrichWithDoi(ctx, directPdf);
    }

    const status = finalizeStatus(
      !!acc.abstract,
      acc.sourcesUsed.length > 0,
      counters,
    );
    await writeEnrichment(pub, status, acc, webdbVenue, !!pub.doi);

    const donePayload: Record<string, unknown> = {
      index: i,
      title: pub.title,
      final_status: status,
      sources_used: acc.sourcesUsed,
      has_abstract: !!acc.abstract,
    };
    // date_filled is a DOI-path-only frame (the DOI-less path never fills it).
    if (pub.doi) {
      donePayload.date_filled = !pub.published_at && !!acc.publishedAt;
    }
    emit('pub_done', donePayload);

    await new Promise((r) => setTimeout(r, PACING_INTER_PUB_MS));
  }

  emit('complete', {
    processed: pubs.length,
    total: pubs.length,
    successful: counters.successful,
    partial: counters.partial,
    failed: counters.failed,
    with_abstract: counters.withAbstract,
    sources: sourceCounts,
  });
}
