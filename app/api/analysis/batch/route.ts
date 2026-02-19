import { NextRequest } from 'next/server';
import { getSupabaseFromRequest, getOpenRouterKey, getLLMModel, createSSEStream } from '@/lib/api-helpers';
import { analyzePublications, calculatePressScore, checkKeyBalance } from '@/lib/analysis/openrouter';
import { Publication } from '@/lib/types';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let supabase;
  let apiKey: string;
  let model: string;
  let body: Record<string, unknown>;

  try {
    supabase = getSupabaseFromRequest(req);
    apiKey = getOpenRouterKey(req);
    model = getLLMModel(req);
    body = await req.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Configuration error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const limit = Math.min((body.limit as number) || 20, 1000);
  const batchSize = Math.min((body.batchSize as number) || 3, 5);
  const minWordCount = (body.minWordCount as number) || 0;
  const forceReanalyze = body.forceReanalyze || false;
  const enrichedOnly = body.enrichedOnly !== false; // default true
  const includePartial = body.includePartial || false;

  // Fetch publications for analysis
  let query = supabase
    .from('publications')
    .select('*')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (!forceReanalyze) {
    query = query.eq('analysis_status', 'pending');
  }

  // Filter by enrichment status — only analyze publications with content
  if (enrichedOnly) {
    if (includePartial) {
      query = query.in('enrichment_status', ['enriched', 'partial']);
    } else {
      query = query.eq('enrichment_status', 'enriched');
    }
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

  // Masked key for client display (last 8 chars)
  const maskedKey = apiKey.length > 8 ? '...' + apiKey.slice(-8) : '***';

  (async () => {
    let processed = 0;
    let successful = 0;
    let totalTokens = 0;
    let totalCost = 0;

    // Pre-flight: check key balance before starting
    const keyInfo = await checkKeyBalance(apiKey);

    // Send initial info with masked key and balance
    send('init', {
      total: pubs.length,
      model,
      api_key_hint: maskedKey,
      key_balance: keyInfo,
    });

    // Abort early if balance is insufficient (check effective budget = min of key limit and account balance)
    if (keyInfo.effectiveBudget !== null && keyInfo.effectiveBudget < 0.01) {
      const parts: string[] = [];
      if (keyInfo.limitRemaining !== null) parts.push(`Key-Limit: $${keyInfo.limitRemaining.toFixed(4)} verbleibend`);
      if (keyInfo.accountBalance !== null) parts.push(`Account-Guthaben: $${keyInfo.accountBalance.toFixed(4)}`);
      const detail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
      send('error', {
        message: `OpenRouter-Budget aufgebraucht: $${keyInfo.effectiveBudget.toFixed(4)} verfügbar${detail}. Bitte Credits aufladen auf openrouter.ai/settings/credits.`,
        fatal: true,
      });
      send('complete', { processed: 0, total: pubs.length, successful: 0, failed: pubs.length, tokens_used: 0, cost: 0 });
      close();
      return;
    }

    // Process in batches
    for (let i = 0; i < pubs.length; i += batchSize) {
      const batch = pubs.slice(i, i + batchSize);
      const batchIndex = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(pubs.length / batchSize);

      send('progress', {
        processed,
        total: pubs.length,
        current_title: batch[0].title,
        batch_index: batchIndex,
        total_batches: totalBatches,
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
        const isFatal = /\b402\b/.test(message) && /credits|afford|max_tokens|Budget/i.test(message)
          || /\b401\b/.test(message) && /unauthorized|invalid/i.test(message);

        console.error(`[Analysis] Batch error at index ${i}:`, message);
        send('error', { message, batch_start: i, fatal: isFatal });

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

        // Stop immediately on billing/auth errors
        if (isFatal) {
          processed += batch.length;
          break;
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
