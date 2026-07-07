import 'server-only';
import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';

/**
 * Drei Kennzahlen fürs Marken-Panel des Anmelde-Screens. Bewusst die
 * AUSSAGEKRÄFTIGEN Zahlen, nicht die Rohbestände:
 *  - bewertete Publikationen (mit Press-Score), nicht der WebDB-Gesamtimport,
 *  - anstehende Veranstaltungen (in der Zukunft), nicht alle je importierten,
 *  - Pressemeldungen mit DOI (also solche, die eine Publikation referenzieren).
 *
 * Param-frei und nur langsam veränderlich → 1 h gecacht (unstable_cache), damit
 * die drei count(*) nicht bei jedem Aufruf des öffentlichen Endpoints laufen.
 */
export interface LandingStats {
  scoredPublications: number;
  upcomingEvents: number;
  pressReleasesWithDoi: number;
}

async function computeLandingStats(): Promise<LandingStats> {
  const rows = await db.execute<{
    scored: number;
    upcoming: number;
    press: number;
  }>(sql`
    SELECT
      (SELECT count(*) FROM publications WHERE press_score IS NOT NULL)::int AS scored,
      (SELECT count(*) FROM events WHERE event_at >= now())::int AS upcoming,
      (SELECT count(*) FROM press_releases WHERE doi IS NOT NULL AND doi <> '')::int AS press
  `);
  const r = rows[0];
  return {
    scoredPublications: Number(r?.scored ?? 0),
    upcomingEvents: Number(r?.upcoming ?? 0),
    pressReleasesWithDoi: Number(r?.press ?? 0),
  };
}

export const getLandingStats = unstable_cache(computeLandingStats, ['landing-stats'], {
  revalidate: 3600,
});
