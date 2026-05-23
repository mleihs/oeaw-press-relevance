import { NextRequest, NextResponse } from 'next/server';
import { and, asc, count, desc, eq, isNotNull, ne } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import { withApiError } from '@/lib/server/http';
import { lookupVenue } from '@/lib/shared/venue-registry';

// Venue (enriched_journal) options for the publications filter facet. The
// corpus carries thousands of distinct venues, most of them a long tail of
// near-singletons — so this serves only the top N by publication count. A
// venue outside the top N is still reachable by clicking its VenueLine in
// any publication row.
const TOP_N = 500;

export const GET = withApiError(async (_req: NextRequest) => {
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
    .groupBy(publications.enrichedJournal)
    .orderBy(desc(count()), asc(publications.enrichedJournal))
    .limit(TOP_N);

  // Collapse corpus spellings under their canonical registry name so the
  // facette shows one "Der Standard: 87" entry instead of four siblings
  // ("Der Standard: 44" + "DerStandard.at: 38" + …). Unknown venues stay
  // under their raw string. JS-side post-aggregation: the registry has ~20
  // entries and the SQL pre-fetch already capped to TOP_N rows, so the
  // overhead is negligible compared to the DB roundtrip.
  const grouped = new Map<string, number>();
  for (const row of rawRows) {
    if (!row.venue) continue;
    const key = lookupVenue(row.venue)?.canonicalName ?? row.venue;
    grouped.set(key, (grouped.get(key) ?? 0) + row.count);
  }
  const venues = Array.from(grouped, ([venue, count]) => ({ venue, count }))
    .sort((a, b) => b.count - a.count || a.venue.localeCompare(b.venue));

  return NextResponse.json({ venues, total: venues.length });
});
