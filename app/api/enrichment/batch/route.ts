import { NextRequest, NextResponse } from 'next/server';
import {
  createSSEStream,
  sseResponse,
  validateBody,
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
  const filters = enrichmentPayloadToFilters(
    await validateBody(req, enrichmentBatchPayloadSchema),
  );

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

  return sseResponse(stream);
});
