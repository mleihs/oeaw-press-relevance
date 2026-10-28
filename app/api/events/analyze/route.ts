import { createScoringButtonRoute } from '@/lib/server/scoring-route';

// Bewerten-Knopf für Events, Zwilling von app/api/analysis/batch: derselbe
// Kern, dasselbe Protokoll (lib/server/scoring-route.ts).
export const maxDuration = 300;

export const POST = createScoringButtonRoute('events');
