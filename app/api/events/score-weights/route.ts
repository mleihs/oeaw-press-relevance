import { NextRequest, NextResponse } from 'next/server';
import { validateBody, withApiError } from '@/lib/server/http';
import { eventScoreWeightsUpdateSchema } from '@/lib/shared/schemas';
import {
  getEventScoreWeightsState,
  saveEventScoreWeights,
} from '@/lib/server/events/score-weights';

export const dynamic = 'force-dynamic';

// GET → { current, history } for the Settings card.
export const GET = withApiError(async () => {
  return NextResponse.json(await getEventScoreWeightsState());
});

// PATCH { public_appeal, scientific_significance, reach, timeliness, note? } →
// normalize, recompute all analyzed events' score, append a history entry.
export const PATCH = withApiError(async (req: NextRequest) => {
  const patch = await validateBody(req, eventScoreWeightsUpdateSchema);
  return NextResponse.json(await saveEventScoreWeights(patch));
});
