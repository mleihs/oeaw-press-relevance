export type ChangelogCategory = 'neu' | 'verbesserung' | 'hintergrund';

export interface ChangelogEntry {
  title: string;
  body: string;
  category: ChangelogCategory;
  /** Optional deep-link into the in-app Hilfe-Center for the long form. */
  href?: string;
}

// Reihenfolge: neueste oben. Bewusst ohne Datumsangaben.
// Beim Hinzufügen neuer Einträge oben anhängen, älteste in changelogBackground
// einsammeln, sobald die Liste über ~6 Einträge wächst. Beim Edit `changelogLastUpdated`
// auf das heutige Datum heben, sonst zeigt der Unread-Dot keinen neuen Stand an.
export const changelogEntries: ChangelogEntry[] = [
  {
    category: 'neu',
    title: 'SPECTER2-Embeddings als zweite Bewertungs-Achse',
    body: 'Press-Similarity ist die SPECTER2-basierte semantische Nähe einer Pub zum historischen Press-Cluster, ein vom inhaltlichen Story Score unabhängiges Signal. Eigene Hilfe-Section beschreibt Modell, Trainings-Paper (Cohan 2020, Singh 2022), Vergleich zu OpenAI/SBERT/SciNCL und den Press-Cluster-Lernloop ohne Modell-Retraining.',
    href: '/help/scores/specter2-embeddings',
  },
  {
    category: 'verbesserung',
    title: 'Mirror-Diagramm: Story Score + Press-Similarity',
    body: 'Aus der Story Score-Verteilung wurde ein Spiegel-Histogramm. Oben Story Score (0–100 %), unten Press-Similarity (gezoomt auf 70–100 %, das SPECTER2-Cosinus-Band). Press-Similarity-Pille jetzt auch in der Top-Pubs-Liste sichtbar.',
    href: '/help/dashboard/dashboard-tour#score-distribution',
  },
  {
    category: 'neu',
    title: 'In-App-Hilfe-Center',
    body: 'Über 40 Artikel zu Scores, Filtern, Triage, Pipeline und Datenquellen. Alle Erklär-Bubbles enden mit einem „Mehr im Hilfe-Center →"-Link auf die Tiefen-Erklärung.',
    href: '/help',
  },
  {
    category: 'neu',
    title: 'Triage-Sitzung als geführter Workflow',
    body: 'Strukturierte Sitzung statt freier Liste: Pubs werden eine nach der anderen vorgestellt, das Team entscheidet pro Pub Pitch / Hold / Skip / Snooze, optional mit Flag und Begründungs-Notiz. Pitch-Entscheidungen pushen direkt in MeisterTask, Snooze-Pubs tauchen zum gewählten Datum wieder im Stapel auf.',
    href: '/help/triage/entscheidungen',
  },
  {
    category: 'hintergrund',
    title: 'Typsichere Queries (Drizzle-Umbau)',
    body: 'Alle 21 Backend-Routen sind von rohen SQL-Strings auf Drizzle ORM umgestellt. Spalten-Typos fliegen jetzt beim Build raus statt beim Klick: weniger 500-Fehler, schnellere Refactorings, sauberere Fehlerseiten.',
    href: '/help/grundlagen/tech-stack#drizzle',
  },
  {
    category: 'verbesserung',
    title: 'Top-20 Publikationen mit „Mehr laden"',
    body: 'Das Dashboard zeigt jetzt die Top 20 statt der Top 10 über die letzten 2 Monate. „Mehr laden" lädt in 20er-Schritten weitere Pubs nach, bis zu 200 Einträgen.',
    href: '/help/dashboard/dashboard-tour#top10',
  },
  {
    category: 'verbesserung',
    title: 'Pressemitteilungen aufgeräumt',
    body: '114 fehlende News-Titel wiederhergestellt. „Ohne Pub-Match" ersetzt das irreführende „Externe Referenz". Alle Pressemitteilungen sind ÖAW-Output, nur die zugehörige Pub fehlt manchmal lokal (Pubs ohne Web-Freigabe landen erst gar nicht in der WebDB).',
    href: '/help/press-releases/orphans',
  },
  {
    category: 'neu',
    title: 'Glossar mit Auto-Links',
    body: 'Fachbegriffe wie WebDB, mahighlight, MeisterTask, ÖSTAT, ITA, SPECTER2 oder Drift-Korrektur verlinken bei der ersten Erwähnung in jedem Hilfe-Artikel automatisch auf den passenden Glossar-Abschnitt.',
    href: '/help/grundlagen/glossar',
  },
];

export const changelogBackground =
  'Schon länger Teil von Story Scout: WebDB-Direktimport mit allen Stammdaten (Pubs, Personen, Abteilungen, ÖSTAT-Klassifikationen), MeisterTask-Push aus dem Pub-Detail mit einem Klick, Forscher:innen-Seite mit Top-Podium, Verteilungsdiagramm und Co-Autor:innen-Netzwerk, sowie Erklär-Bubbles an allen Kennzahlen und Filtern. Unter der Haube: schnellere Statistiken, sauberere Lade- und Fehlerseiten, bessere Kontraste und durchgängige Tastatur-Bedienung, plus deutlich mehr DOI-Treffer beim Anreichern. Ein Re-Import der WebDB lässt seit April 2026 alle Analyse-Daten (Scores, Pitches, Haikus, Decisions, Flags) unangetastet, dank UPSERT pro webdb_uid.';

export const changelogClosing =
  'Und die Haikus: jetzt zuverlässig in 5-7-5, mit sauberen Umlauten und ohne ASCII-Schmuggelware.';

/**
 * ISO date watermark for the unread-dot logic in the trigger button.
 * Bump this whenever a new entry is added on top so that returning users
 * see the brand-colored dot until they open the panel.
 */
export const changelogLastUpdated = '2026-05-14T16:00:00.000Z';

/** Auto-derived from changelogLastUpdated: single source of truth for the
 *  panel's soft date anchor ("Stand Mai 2026"). */
export const changelogStandLabel = `Stand ${new Intl.DateTimeFormat('de-AT', {
  month: 'long',
  year: 'numeric',
}).format(new Date(changelogLastUpdated))}`;
