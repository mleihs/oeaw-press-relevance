import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import { withApiError } from '@/lib/server/http';

// Venue (enriched_journal) options for the publications filter facet. The
// corpus carries thousands of distinct venues, most of them a long tail of
// near-singletons — so this serves only the top N by publication count. A
// venue outside the top N is still reachable by clicking its VenueLine in
// any publication row.
const TOP_N = 500;

export const GET = withApiError(async (_req: NextRequest) => {
  const venues = await db
    .select({ venue: publications.enrichedJournal, count: count() })
    .from(publications)
    .where(
      and(
        eq(publications.archived, false),
        isNotNull(publications.enrichedJournal),
        ne(publications.enrichedJournal, ''),
      ),
    )
    .groupBy(publications.enrichedJournal)
    .orderBy(desc(count()), asc(publications.enrichedJournal))
    .limit(TOP_N);

  return NextResponse.json({ venues, total: venues.length });
});
