import { NextRequest } from 'next/server';
import { getSupabaseFromRequest, createSSEStream } from '@/lib/api-helpers';
import { enrichFromCrossRef } from '@/lib/enrichment/crossref';
import { enrichFromOpenAlex } from '@/lib/enrichment/openalex';
import { enrichFromUnpaywall } from '@/lib/enrichment/unpaywall';
import { enrichFromSemanticScholar } from '@/lib/enrichment/semantic-scholar';
import { enrichFromPdf } from '@/lib/enrichment/pdf-extract';
import { Publication, EnrichmentResult } from '@/lib/types';

export const maxDuration = 300;

// Sources that require a DOI (order: CrossRef, OpenAlex, Unpaywall, then Semantic Scholar last)
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

export async function POST(req: NextRequest) {
  const supabase = getSupabaseFromRequest(req);
  const body = await req.json();
  const limit = Math.min(body.limit || 20, 500);
  const includePartial = body.include_partial === true;
  const includeNoDoi = body.include_no_doi === true;

  const statusFilter = includePartial ? ['pending', 'partial'] : ['pending'];

  // Query 1: publications with DOI (standard path)
  let doiQuery = supabase
    .from('publications')
    .select('*')
    .not('doi', 'is', null)
    .in('enrichment_status', statusFilter)
    .order('created_at', { ascending: false })
    .limit(limit);

  const { data: doiPubs, error: doiError } = await doiQuery;

  if (doiError) {
    return new Response(JSON.stringify({ error: doiError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Query 2: publications without DOI but with a .pdf URL or CSV abstract (when requested)
  let noDoiPubs: Publication[] = [];
  if (includeNoDoi) {
    const remaining = limit - (doiPubs?.length || 0);
    if (remaining > 0) {
      const { data, error } = await supabase
        .from('publications')
        .select('*')
        .is('doi', null)
        .or('url.like.%.pdf,abstract.not.is.null')
        .in('enrichment_status', statusFilter)
        .order('created_at', { ascending: false })
        .limit(remaining);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      noDoiPubs = (data || []) as Publication[];
    }
  }

  const pubs = [...((doiPubs || []) as Publication[]), ...noDoiPubs];

  if (pubs.length === 0) {
    return new Response(JSON.stringify({ message: 'No publications to enrich' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { stream, send, close } = createSSEStream();

  // Process in background
  (async () => {
    let successful = 0;
    let partial = 0;
    let failed = 0;
    let withAbstract = 0;
    const sourceCounts: Record<string, number> = {};

    for (let i = 0; i < pubs.length; i++) {
      const pub = pubs[i];
      const hasDoi = !!pub.doi;
      const hasDirectPdf = isPdfUrl(pub.url);
      const hasCsvAbstract = !!pub.abstract;

      send('pub_start', {
        index: i,
        total: pubs.length,
        title: pub.title,
        doi: pub.doi,
        no_doi: !hasDoi,
        has_csv_abstract: hasCsvAbstract,
      });

      // ---------------------------------------------------------------
      // DOI-less publications: CSV abstract + PDF path
      // ---------------------------------------------------------------
      if (!hasDoi) {
        // Send skipped events for all 4 API sources
        for (const src of [...PRE_PDF_SOURCES, ...POST_PDF_SOURCES]) {
          send('source_done', { index: i, source: src, status: 'skipped' });
        }

        let noDoi_abstract: string | undefined = pub.abstract || undefined;
        let noDoi_snippet: string | undefined;
        let noDoi_wordCount = 0;
        const noDoi_sources: string[] = [];

        // Use CSV abstract if available
        if (hasCsvAbstract) {
          noDoi_sources.push('csv');
          sourceCounts['csv'] = (sourceCounts['csv'] || 0) + 1;
        }

        // Try PDF extraction (for abstract if missing, or for snippet/word_count)
        if (hasDirectPdf) {
          send('source_try', { index: i, source: 'pdf', status: 'loading' });
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
              send('source_done', {
                index: i,
                source: 'pdf',
                status: 'success',
                found: { abstract: truncate(pdfResult.abstract, 120) },
              });
            } else {
              send('source_done', { index: i, source: 'pdf', status: 'no_data' });
            }
          } catch (err) {
            send('source_done', {
              index: i,
              source: 'pdf',
              status: 'error',
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        } else {
          send('source_done', { index: i, source: 'pdf', status: 'skipped' });
        }

        // Determine result
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

        await supabase
          .from('publications')
          .update({
            enrichment_status: finalStatus,
            enriched_abstract: noDoi_abstract || null,
            enriched_source: noDoi_sources.join('+') || null,
            full_text_snippet: noDoi_snippet || null,
            word_count: noDoi_wordCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pub.id);

        send('pub_done', {
          index: i,
          title: pub.title,
          final_status: finalStatus,
          sources_used: noDoi_sources,
          has_abstract: hasAbstract,
        });

        await new Promise(r => setTimeout(r, 100));
        continue;
      }

      // ---------------------------------------------------------------
      // Publications WITH DOI: full cascade
      // CrossRef -> OpenAlex -> Unpaywall -> [PDF from pub.url] -> Semantic Scholar
      // Pre-seed abstract from CSV if available (APIs still run for keywords/journal)
      // ---------------------------------------------------------------
      let mergedAbstract: string | undefined = pub.abstract || undefined;
      let mergedKeywords: string[] = [];
      let mergedJournal: string | undefined;
      let mergedSnippet: string | undefined;
      let mergedWordCount = 0;
      const sourcesUsed: string[] = [];
      let apiPdfUrl: string | undefined; // Collected from API sources for fallback

      if (hasCsvAbstract) {
        sourcesUsed.push('csv');
        sourceCounts['csv'] = (sourceCounts['csv'] || 0) + 1;
      }

      // Phase 1: CrossRef, OpenAlex, Unpaywall
      for (const sourceName of PRE_PDF_SOURCES) {
        send('source_try', { index: i, source: sourceName, status: 'loading' });

        try {
          const result = await SOURCE_FETCHERS[sourceName](pub.doi!);

          if (result) {
            sourcesUsed.push(sourceName);
            sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;

            if (!mergedAbstract && result.abstract) {
              mergedAbstract = result.abstract;
            }
            if (result.keywords) {
              for (const kw of result.keywords) {
                if (!mergedKeywords.includes(kw)) {
                  mergedKeywords.push(kw);
                }
              }
            }
            if (!mergedJournal && result.journal) {
              mergedJournal = result.journal;
            }
            if (result.full_text_snippet && (!mergedSnippet || result.full_text_snippet.length > mergedSnippet.length)) {
              mergedSnippet = result.full_text_snippet;
            }
            if (!apiPdfUrl && result.pdf_url) {
              apiPdfUrl = result.pdf_url;
            }
            if (result.word_count && result.word_count > mergedWordCount) {
              mergedWordCount = result.word_count;
            }

            send('source_done', {
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
            send('source_done', { index: i, source: sourceName, status: 'no_data' });
          }
        } catch (err) {
          send('source_done', {
            index: i,
            source: sourceName,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }

        await new Promise(r => setTimeout(r, 100));
      }

      // Phase 2: Try direct PDF from pub.url (if it's a .pdf) — before Semantic Scholar
      // Only if we don't have an abstract yet; direct ÖAW PDFs are fast and reliable
      if (!mergedAbstract && hasDirectPdf) {
        send('source_try', { index: i, source: 'pdf', status: 'loading' });
        try {
          const pdfResult = await enrichFromPdf(pub.url!);
          if (pdfResult) {
            sourcesUsed.push('pdf');
            sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
            if (pdfResult.abstract) {
              mergedAbstract = pdfResult.abstract;
            }
            if (pdfResult.full_text_snippet && (!mergedSnippet || pdfResult.full_text_snippet.length > mergedSnippet.length)) {
              mergedSnippet = pdfResult.full_text_snippet;
            }
            if (pdfResult.word_count && pdfResult.word_count > mergedWordCount) {
              mergedWordCount = pdfResult.word_count;
            }
            send('source_done', {
              index: i,
              source: 'pdf',
              status: 'success',
              found: { abstract: truncate(pdfResult.abstract, 120) },
            });
          } else {
            send('source_done', { index: i, source: 'pdf', status: 'no_data' });
          }
        } catch (err) {
          send('source_done', {
            index: i,
            source: 'pdf',
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      // Phase 3: Semantic Scholar (slowest — only if still missing data)
      for (const sourceName of POST_PDF_SOURCES) {
        send('source_try', { index: i, source: sourceName, status: 'loading' });

        try {
          const result = await SOURCE_FETCHERS[sourceName](pub.doi!);

          if (result) {
            sourcesUsed.push(sourceName);
            sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;

            if (!mergedAbstract && result.abstract) {
              mergedAbstract = result.abstract;
            }
            if (result.keywords) {
              for (const kw of result.keywords) {
                if (!mergedKeywords.includes(kw)) {
                  mergedKeywords.push(kw);
                }
              }
            }
            if (!mergedJournal && result.journal) {
              mergedJournal = result.journal;
            }
            if (result.full_text_snippet && (!mergedSnippet || result.full_text_snippet.length > mergedSnippet.length)) {
              mergedSnippet = result.full_text_snippet;
            }
            if (!apiPdfUrl && result.pdf_url) {
              apiPdfUrl = result.pdf_url;
            }
            if (result.word_count && result.word_count > mergedWordCount) {
              mergedWordCount = result.word_count;
            }

            send('source_done', {
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
            send('source_done', { index: i, source: sourceName, status: 'no_data' });
          }
        } catch (err) {
          send('source_done', {
            index: i,
            source: sourceName,
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }

        await new Promise(r => setTimeout(r, 200));
      }

      // Phase 4: Fallback PDF — if still no abstract, try API-discovered PDF URL
      // (only if different from pub.url which was already tried in Phase 2)
      if (!mergedAbstract && apiPdfUrl && apiPdfUrl !== pub.url) {
        // Only send PDF events if we didn't already try the direct PDF in Phase 2
        if (!hasDirectPdf) {
          send('source_try', { index: i, source: 'pdf', status: 'loading' });
        }
        try {
          const pdfResult = await enrichFromPdf(apiPdfUrl);
          if (pdfResult) {
            if (!sourcesUsed.includes('pdf')) {
              sourcesUsed.push('pdf');
              sourceCounts['pdf'] = (sourceCounts['pdf'] || 0) + 1;
            }
            if (pdfResult.abstract) {
              mergedAbstract = pdfResult.abstract;
            }
            if (pdfResult.full_text_snippet && (!mergedSnippet || pdfResult.full_text_snippet.length > mergedSnippet.length)) {
              mergedSnippet = pdfResult.full_text_snippet;
            }
            if (pdfResult.word_count && pdfResult.word_count > mergedWordCount) {
              mergedWordCount = pdfResult.word_count;
            }
            if (!hasDirectPdf) {
              send('source_done', {
                index: i,
                source: 'pdf',
                status: 'success',
                found: { abstract: truncate(pdfResult.abstract, 120) },
              });
            }
          } else if (!hasDirectPdf) {
            send('source_done', { index: i, source: 'pdf', status: 'no_data' });
          }
        } catch (err) {
          if (!hasDirectPdf) {
            send('source_done', {
              index: i,
              source: 'pdf',
              status: 'error',
              error: err instanceof Error ? err.message : 'Unknown error',
            });
          }
        }
      }

      // Determine final status
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

      // Persist to database
      const enrichedSource = sourcesUsed.join('+') || null;

      await supabase
        .from('publications')
        .update({
          enrichment_status: finalStatus,
          enriched_abstract: mergedAbstract || null,
          enriched_keywords: mergedKeywords.length > 0 ? mergedKeywords.slice(0, 20) : null,
          enriched_journal: mergedJournal || null,
          enriched_source: enrichedSource,
          full_text_snippet: mergedSnippet || null,
          word_count: mergedWordCount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', pub.id);

      send('pub_done', {
        index: i,
        title: pub.title,
        final_status: finalStatus,
        sources_used: sourcesUsed,
        has_abstract: hasAbstract,
      });

      // Small gap between publications
      await new Promise(r => setTimeout(r, 100));
    }

    send('complete', {
      processed: pubs.length,
      total: pubs.length,
      successful,
      partial,
      failed,
      with_abstract: withAbstract,
      sources: sourceCounts,
    });
    close();
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
