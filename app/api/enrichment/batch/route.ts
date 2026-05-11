import { NextRequest, NextResponse } from 'next/server';
import { apiError, createSSEStream } from '@/lib/server/http';
import {
  fetchPublicationsForEnrichment,
  InvalidEnrichmentPayloadError,
  parseEnrichmentBatchBody,
  runEnrichmentBatch,
} from '@/lib/server/enrichment/batch';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Invalid request', 400);
  }

  let filters;
  try {
    filters = parseEnrichmentBatchBody(body);
  } catch (err) {
    if (err instanceof InvalidEnrichmentPayloadError) {
      return apiError(err.message, 400);
    }
    return apiError(err instanceof Error ? err.message : 'Invalid payload', 400);
  }

  let pubs;
  try {
    pubs = await fetchPublicationsForEnrichment(filters);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
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
}
