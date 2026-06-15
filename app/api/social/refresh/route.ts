import { NextRequest } from 'next/server';
import {
  apiError,
  createSSEStream,
  errorToApiResponse,
  sseResponse,
  validateBody,
  withApiError,
} from '@/lib/server/http';
import { getOpenRouterKey } from '@/lib/server/llm';
import { getEnv } from '@/lib/server/env';
import { runSocialRefresh } from '@/lib/server/social/refresh';
import { socialRefreshPayloadSchema } from '@/lib/shared/schemas';

// Fetch (Apify) + analyze (LLM) + snapshot can take a while; allow the full
// serverless budget. Mirrors /api/analysis/batch.
export const maxDuration = 300;

export const POST = withApiError(async (req: NextRequest) => {
  let apiKey: string;
  try {
    apiKey = getOpenRouterKey(req);
  } catch (err) {
    return errorToApiResponse(err, 400, 'Configuration error');
  }

  const env = getEnv();
  if (!env.APIFY_TOKEN) {
    return apiError(
      'APIFY_TOKEN ist nicht gesetzt. Der Social-Media-Refresh ist deaktiviert. Bitte die Variable in den Server-Env-Variablen konfigurieren.',
      503,
    );
  }

  const { force } = await validateBody(req, socialRefreshPayloadSchema);
  // The refresh dialog's model picker sends x-llm-model; otherwise use the
  // feature default (SOCIAL_LLM_MODEL).
  const model = req.headers.get('x-llm-model') || env.SOCIAL_LLM_MODEL;

  const { stream, send, close } = createSSEStream();

  runSocialRefresh({
    apifyToken: env.APIFY_TOKEN,
    actor: env.APIFY_INSTAGRAM_ACTOR,
    resultsLimit: env.SOCIAL_RESULTS_LIMIT,
    apiKey,
    model,
    windowDays: env.SOCIAL_WINDOW_DAYS,
    minRefreshMinutes: env.SOCIAL_MIN_REFRESH_MINUTES,
    apifyCostPerResult: env.APIFY_COST_PER_RESULT,
    force,
    triggeredBy: 'ui',
    abortSignal: req.signal,
    emit: send,
  }).finally(() => close());

  return sseResponse(stream);
});
