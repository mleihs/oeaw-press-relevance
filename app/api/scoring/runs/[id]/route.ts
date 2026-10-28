import { NextResponse, type NextRequest } from 'next/server';
import { apiError, validateParams, withApiError } from '@/lib/server/http';
import { assertCronSecret } from '@/lib/server/ingest/cron-auth';
import { idParamSchema } from '@/lib/server/schemas';
import { getRun, runToApi } from '@/lib/server/scoring/journal';

// Poll eines Bewertungslaufs (Nacht-Wrapper, alle 30 Sekunden). Eine Zeile,
// die länger als STALE_RUNNING_MINUTES auf `running` steht, kommt als
// `failed`/`aborted` zurück, damit der Poll endet, auch wenn der Prozess
// gestorben ist. Auth wie POST /api/scoring/run.

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiError(
  async (req: NextRequest, { params }: Ctx) => {
    const authFail = assertCronSecret(req);
    if (authFail) return authFail;
    const { id } = validateParams(await params, idParamSchema);
    const row = await getRun(id);
    if (!row) return apiError('Unbekannter Bewertungslauf.', 404);
    return NextResponse.json(runToApi(row));
  },
  { csrf: false },
);
