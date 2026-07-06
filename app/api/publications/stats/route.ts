import { NextRequest, NextResponse } from 'next/server';
import { validateQuery, withApiError } from '@/lib/server/http';
import { publicationsStatsQuerySchema } from '@/lib/shared/schemas';
import { fetchPublicationDashboardStats } from '@/lib/server/publications/dashboard-stats';

// Stats-Endpoint für das Dashboard. Aus /api/publications ausgegliedert,
// damit `revalidate = 60` greift und Vercel die Antwort 60s am Edge cached.
// Vorher (im /api/publications-Branch) hat Vercel den Cache-Control-Header
// ignoriert, weil der Browser bei eingeloggtem Gate `Cookie:` mitschickt.
// Diese Route hat keine Auth-Logik und ist Cookie-unabhängig — Cache wirkt.
export const revalidate = 60;

export const GET = withApiError(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const { default_eligible: defaultEligible } = validateQuery(
    searchParams,
    publicationsStatsQuerySchema,
  );
  const stats = await fetchPublicationDashboardStats(defaultEligible);
  return NextResponse.json(stats);
});
