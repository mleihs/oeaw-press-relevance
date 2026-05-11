import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/db';
import { apiError, createSSEStream } from '@/lib/server/http';
import { getLLMModel, getOpenRouterKey } from '@/lib/server/llm';
import {
  fetchPublicationsForAnalysis,
  parseAnalysisBatchBody,
  runAnalysisBatch,
} from '@/lib/server/analysis/batch';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let supabase, apiKey, model, body: Record<string, unknown>;
  try {
    supabase = getSupabaseAdmin();
    apiKey = getOpenRouterKey(req);
    model = getLLMModel(req);
    body = await req.json();
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Configuration error', 400);
  }

  const filters = parseAnalysisBatchBody(body);
  let pubs;
  try {
    pubs = await fetchPublicationsForAnalysis(filters, supabase);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
  if (pubs.length === 0) {
    return NextResponse.json({ message: 'No publications to analyze' });
  }

  const { stream, send, close } = createSSEStream();

  // Fire-and-forget the pipeline; emit() pushes SSE frames into the stream,
  // close() ends it whether the loop finished, errored, or aborted.
  runAnalysisBatch({
    pubs,
    apiKey,
    model,
    batchSize: filters.batchSize,
    db: supabase,
    abortSignal: req.signal,
    emit: send,
  }).finally(() => close());

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
