import { NextRequest, NextResponse } from 'next/server';
import { validateBody, withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
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
  // Mutierend → angemeldete Identität Pflicht (Security-Audit M1).
  // Bewusst requireUser statt requireAdmin: die Gewichtungs-Karte in den
  // Settings ist (wie die Social-Settings) für alle Mitglieder sichtbar —
  // admin-only ist dort nur die Nutzerverwaltung (requireAdmin-Präzedenz:
  // /api/auth/users).
  await requireUser();

  const patch = await validateBody(req, eventScoreWeightsUpdateSchema);
  return NextResponse.json(await saveEventScoreWeights(patch));
});
