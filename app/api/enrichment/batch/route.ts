import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  createSSEStream,
  errorToApiResponse,
  withApiError,
} from '@/lib/server/http';
import {
  fetchPublicationsForEnrichment,
  InvalidEnrichmentPayloadError,
  parseEnrichmentBatchBody,
  runEnrichmentBatch,
} from '@/lib/server/enrichment/batch';

export const maxDuration = 300;

export const POST = withApiError(async (req: NextRequest) => {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (err) {
    return errorToApiResponse(err, 400, 'Invalid request');
  }

  let filters;
  try {
    filters = parseEnrichmentBatchBody(body);
  } catch (err) {
    if (err instanceof InvalidEnrichmentPayloadError) {
      return apiError(err.message, 400);
    }
    return errorToApiResponse(err, 400, 'Invalid payload');
  }

  // Uncaught throws bubble to withApiError → 500.
  const pubs = await fetchPublicationsForEnrichment(filters);
  if (pubs.length === 0) {
    return NextResponse.json({ message: 'No publications to enrich' });
  }

  const { stream, send, close } = createSSEStream();

  runEnrichmentBatch({
    pubs,
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
