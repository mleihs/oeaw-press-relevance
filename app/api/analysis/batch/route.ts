import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  createSSEStream,
  errorToApiResponse,
  withApiError,
} from '@/lib/server/http';
import { getLLMModel, getOpenRouterKey } from '@/lib/server/llm';
import {
  fetchPublicationsForAnalysis,
  runAnalysisBatch,
} from '@/lib/server/analysis/batch';
import { analysisBatchPayloadSchema } from '@/lib/shared/schemas';

export const maxDuration = 300;

export const POST = withApiError(async (req: NextRequest) => {
  let apiKey, model;
  try {
    apiKey = getOpenRouterKey(req);
    model = getLLMModel(req);
  } catch (err) {
    return errorToApiResponse(err, 400, 'Configuration error');
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }

  const parsed = analysisBatchPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid payload', 400);
  }
  const filters = parsed.data;

  // Uncaught throws bubble to withApiError → 500.
  const pubs = await fetchPublicationsForAnalysis(filters);
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
});
