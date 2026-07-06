import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiError, validateQuery } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { searchReferenceTargets } from '@/lib/server/board';

const querySchema = z.object({
  kind: z.enum(['event', 'publication']),
  q: z.string().max(200).optional(),
});

// Live-Suche des „Objekt hinzufügen"-Pickers (Tabs Veranstaltung/Publikation):
// Titel-Substring, neueste zuerst; leere Query liefert die jüngsten Einträge.
export const GET = withApiError(async (req: NextRequest) => {
  await requireUser();
  const { kind, q } = validateQuery(req.nextUrl.searchParams, querySchema);
  const suggestions = await searchReferenceTargets(kind, q ?? '');
  return NextResponse.json({ suggestions });
});
