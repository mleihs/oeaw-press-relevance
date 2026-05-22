import { NextRequest, NextResponse } from 'next/server';
import {
  createSSEStream,
  errorToApiResponse,
  sseResponse,
  validateBody,
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

  const filters = await validateBody(req, analysisBatchPayloadSchema);

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

  return sseResponse(stream);
});
