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
  /** Titel der höchstbewerteten NEU IM PROGRAMM (letzte 2 Wochen importiert)
   *  fürs Ambient-Fade im Login-Brandpanel. BEWUSST nur Titel (kein Score): der
   *  Endpoint ist gate-öffentlich, die interne Wertung soll nicht vor dem Gate
   *  leaken. Titel = bereits veröffentlichte Forschung, unkritisch. */
  hotPublications: string[];
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

  // „Neu im Programm": die höchstbewerteten Pubs, die in den letzten 2 Wochen
  // importiert wurden (created_at). ITA-Subtree ausgeschlossen — identisch zum
  // exclude_ita-Filter unter Publikationen/Dashboard (is_ita_subtree = false).
  const hot = await db.execute<{ title: string }>(sql`
    SELECT title
    FROM publications
    WHERE press_score IS NOT NULL
      AND title IS NOT NULL AND btrim(title) <> ''
      AND is_ita_subtree = false
      AND created_at >= now() - interval '14 days'
    ORDER BY press_score DESC
    LIMIT 8
  `);

  return {
    scoredPublications: Number(r?.scored ?? 0),
    upcomingEvents: Number(r?.upcoming ?? 0),
    pressReleasesWithDoi: Number(r?.press ?? 0),
    hotPublications: [...hot].map((h) => h.title).filter(Boolean),
  };
}

export const getLandingStats = unstable_cache(computeLandingStats, ['landing-stats'], {
  revalidate: 3600,
});
