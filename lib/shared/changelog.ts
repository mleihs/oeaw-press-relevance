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
    category: 'hintergrund',
    title: 'Social Media: kostensparenderes Laden der Kanäle',
    body: 'Der Social-Media-Abruf holt pro Instagram-Kanal jetzt nur noch genau dessen eingestellten Beobachtungszeitraum, statt für alle Kanäle das jeweils breiteste Fenster zu laden und Überschüssiges wieder zu verwerfen. Da der Abrufdienst pro Beitrag abrechnet, spart das Kosten, sobald Kanäle unterschiedliche Zeiträume haben. Bei einheitlichem Zeitraum bleibt alles wie bisher; die Abrufe laufen weiterhin parallel, also ohne Tempoverlust.',
    href: '/help/social/kanaele-verwalten#datenquelle',
  },
  {
    category: 'neu',
    title: 'Veranstaltungen: Wochen- und Monatskalender',
    body: 'Die Events-Seite hat jetzt neben der Liste eine Wochen- und eine Monatsansicht. Jeder Termin erscheint als farbiger Block, dessen Farbe die Relevanz auf einen Blick zeigt (von Grau für unbewertet bis Brand-Blau für hochrelevant), mit dezenter Zeit- und Score-Angabe; die getroffene Entscheidung (Pitch/Hold/Skip) sitzt als kleines Symbol in der Ecke. Ein Klick öffnet ein Cockpit mit Score-Aufschlüsselung, Pitch und den Triage-Buttons. Umgeschaltet wird über Liste · Woche · Monat, geblättert per Pfeil oder „Heute".',
    href: '/help/events/kalender-ansichten',
  },
  {
    category: 'neu',
    title: 'Einstellbare Bewertungs-Gewichtung für Events',
    body: 'In den Einstellungen lässt sich jetzt festlegen, wie stark die vier Einzel-Scores einer Veranstaltung (Öffentlichkeitswirkung, Wissenschaftliche Bedeutung, Reichweite, Aktualität) in den Gesamt-Relevanzscore eingehen: über Presets oder einen Aufteilungsbalken (immer 100 %), mit Live-Vorschau. Beim Speichern werden alle bewerteten Events sofort neu berechnet; jede Einstellung wird im Verlauf gesichert und lässt sich per „Übernehmen" wiederherstellen.',
    href: '/help/events/bewertungs-gewichtung',
  },
  {
    category: 'verbesserung',
    title: 'Fehlender Score: jetzt mit konkretem Grund',
    body: 'Publikationen ohne Story Score zeigen in der „N/A"-Bubble jetzt einen pro Eintrag verfassten Grund statt eines allgemeinen Hinweises. Je nach Fall: keine DOI hinterlegt (bei Zeitschriften-Beiträgen oft nachtragbar), ein Publikationstyp wie Sammelwerks- oder Zeitungsbeitrag, der in CrossRef/OpenAlex gar nicht geführt wird, eine vergebene DOI ohne frei abrufbaren Abstract, ein Buch- bzw. Sammelband-DOI, oder ein noch nicht erschienenes Paper (Pre-Publication-Window). Der spezifische Grund steht voran, die allgemeine Erklärung folgt als Kontext.',
    href: '/help/scores/score-fehlt',
  },
  {
    category: 'neu',
    title: 'Veranstaltungen: Relevanz-Score & Pitch',
    body: 'Veranstaltungen werden jetzt, analog zu Publikationen, vom Sprachmodell nach Relevanz für die zentrale Veranstaltungsseite eingestuft, mit vier Dimensionen (Öffentlichkeitswirkung, Wissenschaftliche Bedeutung, Reichweite, Aktualität) und einem Pitch-Vorschlag. Über „Analysieren" auf der Events-Seite werden offene Events einmalig bewertet; die Liste zeigt den Score je Zeile, die Detailseite die Aufschlüsselung samt Begründung.',
    href: '/help/events/relevanz-score',
  },
  {
    category: 'verbesserung',
    title: 'Veranstaltungen: ÖAW-Hauptseite ausblenden',
    body: 'Die Events-Liste blendet die Beiträge aus dem News-Ordner der ÖAW-Hauptseite jetzt standardmäßig aus, damit die Institutsveranstaltungen im Vordergrund stehen. Ein Schalter „ÖAW-Hauptseite einblenden" holt sie bei Bedarf zurück; die Tab-Zähler passen sich mit an.',
  },
  {
    category: 'verbesserung',
    title: 'Barrierefreiheit, Sicherheit & Tempo',
    body: 'Eine breite Überarbeitung im Hintergrund: Tabellen und Listen sind jetzt vollständig per Tastatur bedienbar, Animationen respektieren die Systemeinstellung „Bewegung reduzieren", Detailseiten tragen sprechende Tab-Titel, und fehlgeschlagene Ladevorgänge bieten einen „Nochmal versuchen"-Knopf statt einer leeren Ansicht. Das Dashboard lädt spürbar schneller, und zusätzliche Schutzmaßnahmen (Security-Header, strengere Datenbank-Zugriffsregeln) härten die Anwendung ab.',
  },
  {
    category: 'neu',
    title: 'Social Media: Themen-Lagebild beobachteter Kanäle',
    body: 'Der neue Bereich Social Media zeigt, welche Themen auf beobachteten Instagram-Kanälen gerade behandelt werden. Posts werden geladen, das LLM extrahiert Thema und Schlagworte und bündelt sie zu einem aggregierten Lagebild. Kanäle und Beobachtungszeitraum lassen sich in den Einstellungen pflegen.',
    href: '/help/social/seiten-tour',
  },
  {
    category: 'neu',
    title: 'Veranstaltungen: ÖAW-weite Events im Blick',
    body: 'Neben Publikationen erfasst Story Scout jetzt auch kommende ÖAW-Veranstaltungen. Die Events-Seite listet anstehende Termine aus der WebDB, mit Detailansicht, Flag und derselben Triage-Logik wie bei Pubs. Das Dashboard verlinkt direkt darauf.',
    href: '/help/events/seiten-tour',
  },
  {
    category: 'verbesserung',
    title: 'Nature- und Science-Pubs hervorgehoben',
    body: 'Publikationen aus der Nature-Familie und aus Science fallen in den Listen sofort auf: eine brand-blaue, nicht kursive Venue-Zeile mit auffälliger Pulsanimation hebt diese Flaggschiff-Journale aus dem langen Stapel hervor.',
    href: '/help/datenquellen/venue#flagship',
  },
  {
    category: 'neu',
    title: 'Autor:innen-Verlinkung in der Zitation',
    body: 'Namen im Zitations-Trailer einer Publikation werden automatisch erkannt und verlinkt: ein Klick führt zur Personenseite. ÖAW-Personen erscheinen brand-blau, externe Co-Autor:innen neutral. Bei mehreren Treffern greift der längste passende Name zuerst.',
    href: '/help/datenquellen/autor-verlinkung',
  },
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
export const changelogLastUpdated = '2026-06-26T18:00:00.000Z';

/** Auto-derived from changelogLastUpdated: single source of truth for the
 *  panel's soft date anchor ("Stand Mai 2026"). */
export const changelogStandLabel = `Stand ${new Intl.DateTimeFormat('de-AT', {
  month: 'long',
  year: 'numeric',
}).format(new Date(changelogLastUpdated))}`;
