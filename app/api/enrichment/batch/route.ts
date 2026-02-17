import { NextRequest } from 'next/server';
import { getSupabaseFromRequest, createSSEStream } from '@/lib/api-helpers';
import { enrichFromCrossRef } from '@/lib/enrichment/crossref';
import { enrichFromUnpaywall } from '@/lib/enrichment/unpaywall';
import { enrichFromSemanticScholar } from '@/lib/enrichment/semantic-scholar';
import { Publication, EnrichmentResult } from '@/lib/types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = getSupabaseFromRequest(req);
  const body = await req.json();
  const limit = Math.min(body.limit || 20, 50);

  // Fetch publications needing enrichment
  const { data: publications, error } = await supabase
    .from('publications')
    .select('*')
    .eq('enrichment_status', 'pending')
    .not('doi', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pubs = (publications || []) as Publication[];
  if (pubs.length === 0) {
    return new Response(JSON.stringify({ message: 'No publications to enrich' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { stream, send, close } = createSSEStream();

  // Process in background
  (async () => {
    let processed = 0;
    let successful = 0;

    for (const pub of pubs) {
      processed++;
      send('progress', {
        processed,
        total: pubs.length,
        current_title: pub.title,
      });

      if (!pub.doi) {
        await supabase
          .from('publications')
          .update({ enrichment_status: 'failed' })
          .eq('id', pub.id);
        continue;
      }

      let result: EnrichmentResult | null = null;

      // Try CrossRef first
      try {
        result = await enrichFromCrossRef(pub.doi);
      } catch { /* continue to next source */ }

      // Try Unpaywall if CrossRef didn't get abstract
      if (!result?.abstract) {
        try {
          const unpResult = await enrichFromUnpaywall(pub.doi);
          if (unpResult) {
            result = result
              ? { ...result, ...unpResult, source: result.source }
              : unpResult;
          }
        } catch { /* continue */ }
      }

      // Try Semantic Scholar as fallback
      if (!result?.abstract) {
        try {
          const ssResult = await enrichFromSemanticScholar(pub.doi);
          if (ssResult) {
            result = result
              ? {
                  abstract: ssResult.abstract || result.abstract,
                  keywords: result.keywords || ssResult.keywords,
                  journal: result.journal || ssResult.journal,
                  source: result.source || ssResult.source,
                  full_text_snippet: ssResult.full_text_snippet || result.full_text_snippet,
                  word_count: Math.max(result.word_count || 0, ssResult.word_count || 0),
                }
              : ssResult;
          }
        } catch { /* continue */ }
      }

      if (result) {
        await supabase
          .from('publications')
          .update({
            enrichment_status: 'enriched',
            enriched_abstract: result.abstract || null,
            enriched_keywords: result.keywords || null,
            enriched_journal: result.journal || null,
            enriched_source: result.source,
            full_text_snippet: result.full_text_snippet || null,
            word_count: result.word_count || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pub.id);
        successful++;
      } else {
        await supabase
          .from('publications')
          .update({
            enrichment_status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', pub.id);
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 300));
    }

    send('complete', {
      processed,
      total: pubs.length,
      successful,
      failed: processed - successful,
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
