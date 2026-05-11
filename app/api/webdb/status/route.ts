import { NextRequest, NextResponse } from 'next/server';
import { count, desc, isNotNull } from 'drizzle-orm';
import {
  db,
  publications,
  persons,
  orgunits,
  projects,
  lectures,
  extunits,
  oestat6Categories,
  personPublications,
  orgunitPublications,
  publicationProjects,
} from '@/lib/server/db';
import { apiError } from '@/lib/server/http';

export async function GET(_req: NextRequest) {
  try {
    // Eleven parallel COUNT(*) queries + one most-recent synced_at lookup.
    // postgres-js pools on a single connection (max: 1 in drizzle.ts) so
    // these serialise inside the driver — the round-trip cost is negligible
    // compared to PostgREST's per-call HTTP overhead.
    const [
      publicationsCount,
      personsCount,
      orgunitsCount,
      projectsCount,
      lecturesCount,
      extunitsCount,
      oestat6Count,
      personPublicationsCount,
      orgunitPublicationsCount,
      publicationProjectsCount,
      lastSyncRows,
    ] = await Promise.all([
      db.select({ c: count() }).from(publications),
      db.select({ c: count() }).from(persons),
      db.select({ c: count() }).from(orgunits),
      db.select({ c: count() }).from(projects),
      db.select({ c: count() }).from(lectures),
      db.select({ c: count() }).from(extunits),
      db.select({ c: count() }).from(oestat6Categories),
      db.select({ c: count() }).from(personPublications),
      db.select({ c: count() }).from(orgunitPublications),
      db.select({ c: count() }).from(publicationProjects),
      db
        .select({ syncedAt: publications.syncedAt })
        .from(publications)
        .where(isNotNull(publications.syncedAt))
        .orderBy(desc(publications.syncedAt))
        .limit(1),
    ]);

    return NextResponse.json({
      publications: publicationsCount[0]?.c ?? 0,
      persons: personsCount[0]?.c ?? 0,
      orgunits: orgunitsCount[0]?.c ?? 0,
      projects: projectsCount[0]?.c ?? 0,
      lectures: lecturesCount[0]?.c ?? 0,
      extunits: extunitsCount[0]?.c ?? 0,
      oestat6: oestat6Count[0]?.c ?? 0,
      person_publications: personPublicationsCount[0]?.c ?? 0,
      orgunit_publications: orgunitPublicationsCount[0]?.c ?? 0,
      publication_projects: publicationProjectsCount[0]?.c ?? 0,
      // ISO-8601 to match the rest of the wire shape (Drizzle returns the
      // raw Postgres timestamp string with `mode: 'string'`; normalise here).
      last_synced: lastSyncRows[0]?.syncedAt
        ? new Date(lastSyncRows[0].syncedAt).toISOString()
        : null,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
