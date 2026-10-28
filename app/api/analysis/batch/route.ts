import { createScoringButtonRoute } from '@/lib/server/scoring-route';

// Bewerten-Knopf für Publikationen: ein Lauf des Bewertungskerns
// (lib/server/scoring/run.ts) mit SSE-Frames fürs Modal. Anmeldung, Gates und
// Protokoll stehen in lib/server/scoring-route.ts, gemeinsam mit der
// Event-Route app/api/events/analyze.
export const maxDuration = 300;

export const POST = createScoringButtonRoute('publications');
