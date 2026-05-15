import { NextRequest, NextResponse } from 'next/server';
import {
  apiError,
  createSSEStream,
  withApiError,
} from '@/lib/server/http';
import {
  enrichmentPayloadToFilters,
  fetchPublicationsForEnrichment,
  runEnrichmentBatch,
} from '@/lib/server/enrichment/batch';
import { enrichmentBatchPayloadSchema } from '@/lib/shared/schemas';

export const maxDuration = 300;

export const POST = withApiError(async (req: NextRequest) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }

  const parsed = enrichmentBatchPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? 'Invalid payload', 400);
  }
  const filters = enrichmentPayloadToFilters(parsed.data);

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
