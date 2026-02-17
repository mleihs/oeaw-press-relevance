import { NextRequest } from 'next/server';
import { getSupabaseFromRequest, getOpenRouterKey, getLLMModel, createSSEStream } from '@/lib/api-helpers';
import { analyzePublications, calculatePressScore } from '@/lib/analysis/openrouter';
import { Publication } from '@/lib/types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = getSupabaseFromRequest(req);
  const apiKey = getOpenRouterKey(req);
  const model = getLLMModel(req);
  const body = await req.json();
  const limit = Math.min(body.limit || 20, 100);
  const batchSize = Math.min(body.batchSize || 3, 5);
  const minWordCount = body.minWordCount || 0;
  const forceReanalyze = body.forceReanalyze || false;

  // Fetch publications for analysis
  let query = supabase
    .from('publications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!forceReanalyze) {
    query = query.eq('analysis_status', 'pending');
  }

  if (minWordCount > 0) {
    query = query.gte('word_count', minWordCount);
  }

  const { data: publications, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pubs = (publications || []) as Publication[];
  if (pubs.length === 0) {
    return new Response(JSON.stringify({ message: 'No publications to analyze' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { stream, send, close } = createSSEStream();

  (async () => {
    let processed = 0;
    let successful = 0;
    let totalTokens = 0;
    let totalCost = 0;

    // Process in batches
    for (let i = 0; i < pubs.length; i += batchSize) {
      const batch = pubs.slice(i, i + batchSize);

      send('progress', {
        processed,
        total: pubs.length,
        current_title: batch[0].title,
        tokens_used: totalTokens,
        cost: totalCost,
      });

      try {
        const { results, tokensUsed, cost } = await analyzePublications(batch, apiKey, model);
        totalTokens += tokensUsed;
        totalCost += cost;

        for (let j = 0; j < results.length && j < batch.length; j++) {
          const result = results[j];
          const pub = batch[j];
          const pressScore = calculatePressScore(result);

          await supabase
            .from('publications')
            .update({
              analysis_status: 'analyzed',
              press_score: pressScore,
              public_accessibility: result.public_accessibility,
              societal_relevance: result.societal_relevance,
              novelty_factor: result.novelty_factor,
              storytelling_potential: result.storytelling_potential,
              media_timeliness: result.media_timeliness,
              pitch_suggestion: result.pitch_suggestion,
              target_audience: result.target_audience,
              suggested_angle: result.suggested_angle,
              reasoning: result.reasoning,
              llm_model: model,
              analysis_cost: cost / results.length,
              updated_at: new Date().toISOString(),
            })
            .eq('id', pub.id);

          successful++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        send('error', { message, batch_start: i });

        // Mark batch as failed
        for (const pub of batch) {
          await supabase
            .from('publications')
            .update({
              analysis_status: 'failed',
              updated_at: new Date().toISOString(),
            })
            .eq('id', pub.id);
        }
      }

      processed += batch.length;

      // Rate limiting between batches
      if (i + batchSize < pubs.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    send('complete', {
      processed,
      total: pubs.length,
      successful,
      failed: processed - successful,
      tokens_used: totalTokens,
      cost: totalCost,
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
