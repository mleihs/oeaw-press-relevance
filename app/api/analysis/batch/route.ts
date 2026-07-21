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
  fetchPublicationsForAnalysis,
  runAnalysisBatch,
} from '@/lib/server/analysis/batch';
import { scoringBatchPayloadSchema } from '@/lib/shared/schemas';

export const maxDuration = 300;

export const POST = withApiError(async (req: NextRequest) => {
  // Diese Route gibt OpenRouter-Guthaben aus → angemeldete Identität Pflicht
  // (vorher nur Gate-Cookie). requireUser wirft ApiAuthError → 401/403.
  await requireUser();

  let apiKey, model;
  try {
    apiKey = getOpenRouterKey(req);
    model = getLLMModel(req);
  } catch (err) {
    return errorToApiResponse(err, 400, 'Configuration error');
  }

  const filters = await validateBody(req, scoringBatchPayloadSchema);

  // Uncaught throws bubble to withApiError → 500. `skipped` = benannte ids,
  // die an den Bewertbarkeits-Gates hängen blieben; der Fetcher rechnet das,
  // weil nur er die angefragte gegen die gefundene Menge kennt. Sonst stünde
  // im Modal „0 bewertet" ohne Grund.
  const { pubs, skipped } = await fetchPublicationsForAnalysis(filters);
  if (pubs.length === 0) {
    return NextResponse.json({ message: 'No publications to analyze', skipped });
  }

  // Run-Lock VOR dem SSE-Stream: ein bereits laufender Lauf → 409 (Plain-JSON,
  // kein Stream). Der Lock wird über die Lebensdauer des HINTERGRUND-Batches
  // gehalten und erst in dessen .finally freigegeben (nicht schon beim Return).
  let lock;
  try {
    lock = await acquireRunLock(RUN_LOCK_KEYS.scorePublications);
  } catch (err) {
    if (err instanceof RunLockBusyError) return apiError(err.message, 409);
    throw err;
  }

  const { stream, send, close } = createSSEStream();

  // Fire-and-forget the pipeline; emit() pushes SSE frames into the stream,
  // close() ends it whether the loop finished, errored, or aborted, and the
  // run-lock is released only once the background batch actually finishes.
  runAnalysisBatch({
    pubs,
    apiKey,
    model,
    batchSize: filters.batchSize,
    abortSignal: req.signal,
    emit: send,
    skipped,
  }).finally(() => {
    close();
    void lock.release();
  });

  return sseResponse(stream);
});
