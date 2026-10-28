import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { validateQuery, withApiError } from '@/lib/server/http';
import { assertCronSecret } from '@/lib/server/ingest/cron-auth';
import { latestRuns, runToApi } from '@/lib/server/scoring/journal';
import { SCORING_ENTITIES } from '@/lib/shared/scoring/entity';

// Je Entität der jüngste abgeschlossene und der laufende Bewertungslauf, samt
// Bericht (verworfene Haikus, Lektorat-Hinweise): für den Nacht-Wrapper und die
// Nachkontrolle. Nur `?latest=1`; eine Liste aller Läufe gibt es (noch) nicht.
// Auth wie POST /api/scoring/run.

const querySchema = z.object({ latest: z.literal('1') });

export const GET = withApiError(
  async (req: NextRequest) => {
    const authFail = assertCronSecret(req);
    if (authFail) return authFail;
    validateQuery(req.nextUrl.searchParams, querySchema);
    const runs = await latestRuns();
    const toApi = (row: Parameters<typeof runToApi>[0] | null) => (row ? runToApi(row, { withReport: true }) : null);
    return NextResponse.json(
      Object.fromEntries(
        SCORING_ENTITIES.map((e) => [e, { latest: toApi(runs[e].latest), running: toApi(runs[e].running) }]),
      ),
    );
  },
  { csrf: false },
);
