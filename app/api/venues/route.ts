import { NextRequest, NextResponse } from 'next/server';
import { and, count, eq, isNotNull, ne } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import { withApiError } from '@/lib/server/http';
import { lookupVenue } from '@/lib/shared/venue-registry';

// Venue (enriched_journal) options for the publications filter facet. The
// corpus carries ~14k distinct venues, most of them a long tail of
// near-singletons — so this serves only the top N by publication count. A
// venue outside the top N is still reachable by clicking its VenueLine in
// any publication row.
const TOP_N = 500;

export const GET = withApiError(async (_req: NextRequest) => {
  // Fetch all distinct corpus venues (unbounded) and collapse them in JS
  // under their canonical registry name before applying TOP_N. The cap has
  // to happen AFTER regrouping: registered aliases like "Der Standard
  // [Blog]" (3 rows) and "Der Standard, Blog: Geschichte Österreichs" (2)
  // rank in the thousands as raw strings but belong to a top-100 canonical
  // group; capping in SQL first would silently under-count those groups.
  // ~14k rows × Map.get/set is sub-ms, well under the DB roundtrip.
  const rawRows = await db
    .select({ venue: publications.enrichedJournal, count: count() })
    .from(publications)
    .where(
      and(
        eq(publications.archived, false),
        isNotNull(publications.enrichedJournal),
        ne(publications.enrichedJournal, ''),
      ),
    )
    .groupBy(publications.enrichedJournal);

  const grouped = new Map<string, number>();
  for (const row of rawRows) {
    if (!row.venue) continue;
    const key = lookupVenue(row.venue)?.canonicalName ?? row.venue;
    grouped.set(key, (grouped.get(key) ?? 0) + row.count);
  }
  const venues = Array.from(grouped, ([venue, count]) => ({ venue, count }))
    .sort((a, b) => b.count - a.count || a.venue.localeCompare(b.venue))
    .slice(0, TOP_N);

  return NextResponse.json({ venues, total: venues.length });
});
