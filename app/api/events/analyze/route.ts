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
  fetchEventsForAnalysis,
  runEventsAnalysisBatch,
} from '@/lib/server/events/analyze';
import { eventsAnalyzeBatchPayloadSchema } from '@/lib/shared/schemas';

// Mirrors app/api/analysis/batch — SSE stream of the event-scoring run. Only
// needs OpenRouter (no MySQL), so unlike the events SYNC this works in prod.
export const maxDuration = 300;

export const POST = withApiError(async (req: NextRequest) => {
  let apiKey, model;
  try {
    apiKey = getOpenRouterKey(req);
    model = getLLMModel(req);
  } catch (err) {
    return errorToApiResponse(err, 400, 'Configuration error');
  }

  const filters = await validateBody(req, eventsAnalyzeBatchPayloadSchema);

  const events = await fetchEventsForAnalysis(filters);
  if (events.length === 0) {
    return NextResponse.json({ message: 'No events to analyze' });
  }

  const { stream, send, close } = createSSEStream();
  runEventsAnalysisBatch({
    events,
    apiKey,
    model,
    batchSize: filters.batchSize,
    abortSignal: req.signal,
    emit: send,
  }).finally(() => close());

  return sseResponse(stream);
});
