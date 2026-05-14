export interface ChangelogEntry {
  title: string;
  body: string;
  /** Optional deep-link into the in-app Hilfe-Center for the long form. */
  href?: string;
}

// Reihenfolge: neueste oben. Bewusst ohne Datumsangaben.
// Beim Hinzufügen neuer Einträge oben anhängen, älteste in changelogBackground
// einsammeln, sobald die Liste über ~6 Einträge wächst.
export const changelogEntries: ChangelogEntry[] = [
  {
    title: 'SPECTER2-Embeddings als zweite Bewertungs-Achse',
    body: 'Press-Similarity ist die SPECTER2-basierte semantische Nähe einer Pub zum historischen Press-Cluster — ein vom inhaltlichen StoryScore unabhängiges Signal. Eigene Hilfe-Section beschreibt Modell, Trainings-Paper (Cohan 2020, Singh 2022), Vergleich zu OpenAI/SBERT/SciNCL und den Press-Cluster-Lernloop ohne Modell-Retraining.',
    href: '/help/datenquellen/specter2-embeddings',
  },
  {
    title: 'Mirror-Diagramm: StoryScore + Press-Similarity',
    body: 'Aus der StoryScore-Verteilung wurde ein Spiegel-Histogramm. Oben StoryScore (0–100 %), unten Press-Similarity (gezoomt auf 70–100 %, das SPECTER2-Cosinus-Band). Press-Similarity-Pille jetzt auch in der Top-Pubs-Liste sichtbar.',
    href: '/help/dashboard/dashboard-tour#score-distribution',
  },
  {
    title: 'In-App-Hilfe-Center',
    body: 'Über 40 Artikel zu Scores, Filtern, Triage, Pipeline und Datenquellen. Alle Erklär-Bubbles enden mit einem „Mehr im Hilfe-Center →"-Link auf die Tiefen-Erklärung.',
    href: '/help',
  },
  {
    title: 'Typsichere Queries (Drizzle-Umbau)',
    body: 'Alle 21 Backend-Routen sind von rohen SQL-Strings auf Drizzle ORM umgestellt. Spalten-Typos fliegen jetzt beim Build raus statt beim Klick — weniger 500-Fehler, schnellere Refactorings, sauberere Fehlerseiten.',
    href: '/help/grundlagen/tech-stack#drizzle',
  },
  {
    title: 'Top-20 Publikationen mit „Mehr laden"',
    body: 'Das Dashboard zeigt jetzt die Top 20 statt der Top 10 über die letzten 2 Monate. „Mehr laden" lädt in 20er-Schritten weitere Pubs nach, bis zu 200 Einträgen.',
    href: '/help/dashboard/dashboard-tour#top10',
  },
  {
    title: 'Pressemitteilungen aufgeräumt',
    body: '114 fehlende News-Titel wiederhergestellt. „Ohne Pub-Match" ersetzt das irreführende „Externe Referenz" — alle Pressemitteilungen sind ÖAW-Output, nur die zugehörige Pub fehlt manchmal lokal (Pubs ohne Web-Freigabe landen erst gar nicht in der WebDB).',
    href: '/help/press-releases/orphans',
  },
  {
    title: 'Glossar mit Auto-Links',
    body: 'Fachbegriffe wie WebDB, mahighlight, MeisterTask, ÖSTAT, ITA, SPECTER2 oder Drift-Korrektur verlinken bei der ersten Erwähnung in jedem Hilfe-Artikel automatisch auf den passenden Glossar-Abschnitt.',
    href: '/help/grundlagen/glossar',
  },
];

export const changelogBackground =
  'Schon länger Teil von StoryScout: WebDB-Direktimport mit allen Stammdaten (Pubs, Personen, Abteilungen, ÖSTAT-Klassifikationen), MeisterTask-Push aus dem Pub-Detail mit einem Klick, Forscher:innen-Seite mit Top-Podium, Verteilungsdiagramm und Co-Autor:innen-Netzwerk, sowie Erklär-Bubbles an allen Kennzahlen und Filtern. Unter der Haube: schnellere Statistiken, sauberere Lade- und Fehlerseiten, bessere Kontraste und durchgängige Tastatur-Bedienung, plus deutlich mehr DOI-Treffer beim Anreichern. Ein Re-Import der WebDB lässt seit April 2026 alle Analyse-Daten (Scores, Pitches, Haikus, Decisions, Flags) unangetastet — UPSERT pro webdb_uid.';

export const changelogClosing =
  'Und die Haikus: jetzt zuverlässig in 5-7-5, mit sauberen Umlauten und ohne ASCII-Schmuggelware.';
