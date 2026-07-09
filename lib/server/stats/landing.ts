import 'server-only';
import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';

/**
 * Drei Kennzahlen fürs Marken-Panel des Anmelde-Screens. Bewusst die
 * AUSSAGEKRÄFTIGEN Zahlen, nicht die Rohbestände:
 *  - bewertete Publikationen = die KANONISCHE press_eligible_publications-Sicht
 *    (analysiert, nicht archiviert, kein ITA-Subtree, keine Pop-Science, presse-
 *    tauglicher Typ) — dieselbe Scope-Definition wie Publikationen/Dashboard,
 *    NICHT ein roher press_score-Count (der ITA/Theses/archivierte mitzählte),
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
  /** Haikus der höchstbewerteten NEU IM PROGRAMM (letzte 2 Wochen importiert)
   *  fürs Ambient-Fade im Login-Brandpanel. BEWUSST nur das Haiku (kein Score,
   *  kein Titel): der Endpoint ist gate-öffentlich; das Haiku ist eine poetische
   *  Verdichtung des (öffentlichen) Inhalts und leakt keine interne Wertung.
   *  Format „5 / 7 / 5" mit „/"-Trennern — die UI rendert drei Zeilen. */
  hotHaikus: string[];
}

async function computeLandingStats(): Promise<LandingStats> {
  const rows = await db.execute<{
    scored: number;
    upcoming: number;
    press: number;
  }>(sql`
    SELECT
      (SELECT count(*) FROM press_eligible_publications)::int AS scored,
      (SELECT count(*) FROM events WHERE event_at >= now())::int AS upcoming,
      (SELECT count(*) FROM press_releases WHERE doi IS NOT NULL AND doi <> '')::int AS press
  `);
  const r = rows[0];

  // „Neu im Programm": Haikus der höchstbewerteten Pubs, die in den letzten 2
  // Wochen importiert wurden (created_at) — auf die kanonische eligibility-Sicht
  // gejoint (kein ITA/Pop-Science/archiviert/untauglicher Typ), damit identisch
  // zur Titelscreen-Zahl gescopt.
  const hot = await db.execute<{ haiku: string }>(sql`
    SELECT p.haiku
    FROM publications p
    JOIN press_eligible_publications e ON e.id = p.id
    WHERE p.created_at >= now() - interval '14 days'
      AND p.haiku IS NOT NULL AND btrim(p.haiku) <> ''
    ORDER BY p.press_score DESC
    LIMIT 8
  `);

  return {
    scoredPublications: Number(r?.scored ?? 0),
    upcomingEvents: Number(r?.upcoming ?? 0),
    pressReleasesWithDoi: Number(r?.press ?? 0),
    hotHaikus: [...hot].map((h) => h.haiku).filter(Boolean),
  };
}

export const getLandingStats = unstable_cache(computeLandingStats, ['landing-stats'], {
  revalidate: 3600,
});
