import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  createSSEStream,
  errorToApiResponse,
  sseResponse,
  validateBody,
  withApiError,
} from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { acquireRunLock, RunLockBusyError, RUN_LOCK_KEYS } from '@/lib/server/run-lock';
import { getLLMModel, getOpenRouterKey } from '@/lib/server/llm';
import {
  fetchEventsForAnalysis,
  runEventsAnalysisBatch,
} from '@/lib/server/events/analyze';
import { scoringBatchPayloadSchema } from '@/lib/shared/schemas';

// Mirrors app/api/analysis/batch — SSE stream of the event-scoring run. Only
// needs OpenRouter (no MySQL), so unlike the events SYNC this works in prod.
export const maxDuration = 300;

export const POST = withApiError(async (req: NextRequest) => {
  // Gibt OpenRouter-Guthaben aus → angemeldete Identität Pflicht (vorher nur
  // Gate-Cookie).
  await requireUser();

  let apiKey, model;
  try {
    apiKey = getOpenRouterKey(req);
    model = getLLMModel(req);
  } catch (err) {
    return errorToApiResponse(err, 400, 'Configuration error');
  }

  const filters = await validateBody(req, scoringBatchPayloadSchema);

  const events = await fetchEventsForAnalysis(filters);
  if (events.length === 0) {
    return NextResponse.json({ message: 'No events to analyze' });
  }

  // Run-Lock VOR dem SSE-Stream: laufender Lauf → 409. Freigabe erst im .finally
  // des Hintergrund-Batches (nicht schon beim Response-Return).
  let lock;
  try {
    lock = await acquireRunLock(RUN_LOCK_KEYS.scoreEvents);
  } catch (err) {
    if (err instanceof RunLockBusyError) return apiError(err.message, 409);
    throw err;
  }

  const { stream, send, close } = createSSEStream();
  runEventsAnalysisBatch({
    events,
    apiKey,
    model,
    batchSize: filters.batchSize,
    abortSignal: req.signal,
    emit: send,
  }).finally(() => {
    close();
    void lock.release();
  });

  return sseResponse(stream);
});
