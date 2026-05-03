export interface ChangelogEntry {
  title: string;
  body: string;
}

// Reihenfolge: neueste oben. Bewusst ohne Datumsangaben.
// Beim Hinzufügen neuer Einträge oben anhängen, älteste in changelogBackground
// einsammeln, sobald die Liste über ~6 Einträge wächst.
export const changelogEntries: ChangelogEntry[] = [
  {
    title: 'WebDB-Direktimport',
    body: 'Publikationen, Abteilungen, Personen und ÖSTAT-Klassifikationen kommen jetzt direkt aus der WebDB; strukturiert filterbar.',
  },
  {
    title: 'Push an MeisterTask',
    body: 'Jede Publikation lässt sich aus dem Detail mit einem Klick als Task in MeisterTask anlegen; Indikator in der Tabelle, wenn schon gepusht.',
  },
  {
    title: 'Forscher:innen-Seite',
    body: 'Top-Podium, Verteilungsdiagramm und Detailseiten mit Co-Autor:innen und Aktivitäts-Trend.',
  },
  {
    title: 'Erklär-Bubbles',
    body: 'Kleine Hinweise an Kennzahlen, Diagrammen und Filtern erklären, wie sie zu lesen sind.',
  },
];

export const changelogBackground =
  'Außerdem unter der Haube: spürbar schnellere Statistiken und Diagramme, sauberere Lade- und Fehlerseiten, bessere Kontraste und Tastatur-Bedienung, mehr DOI-Treffer beim Anreichern.';

export const changelogClosing =
  'Und die Haikus: jetzt zuverlässig in 5-7-5, mit sauberen Umlauten.';
