// Social-Media-Domäne des EXPL-Objekts — KPIs, Beobachtungszeitraum, Momentum,
// Lagebild und Feature-Kosten. Zusammengeführt in ./index.tsx.

import { Para, type Explanation } from './primitives';

export const SOCIAL_EXPL = {
  // ─── Social Media ───────────────────────────────────────────────────────────
  social_kpi_posts: {
    title: 'Posts im Fenster',
    body: (
      <Para>
        Anzahl der geladenen Posts aller aktiven Kanäle innerhalb des aktuellen
        Beobachtungszeitraums. Beim Seitenaufruf entstehen keine Kosten, geladen
        wird nur beim Aktualisieren.
      </Para>
    ),
  },
  social_kpi_channels: {
    title: 'Beobachtete Kanäle',
    body: (
      <Para>
        Aktive Instagram-Kanäle, die ausgewertet werden. Klick öffnet die
        Kanal-Ansicht (Liste, pro Kanal ausklappbar). Verwaltung in den
        Einstellungen.
      </Para>
    ),
  },
  social_kpi_themes: {
    title: 'Erkannte Themen',
    body: (
      <Para>
        Vom Sprachmodell aus den Posts gebündelte Themencluster. Klick öffnet die
        Themen-Ansicht, dort lässt sich jedes Thema aufklappen, um die
        zugehörigen Posts zu sehen.
      </Para>
    ),
  },
  social_window: {
    title: 'Beobachtungszeitraum',
    body: (
      <Para>
        Globaler Standard (in Tagen), wie weit zurück Posts berücksichtigt
        werden, sowohl beim Laden als auch in Anzeige und Lagebild. Pro Kanal in
        den Einstellungen überschreibbar.
      </Para>
    ),
  },
  social_momentum: {
    title: 'Momentum',
    formula: '((Likes jüngere Hälfte − Likes ältere Hälfte) / ältere Hälfte) × 100',
    body: (
      <Para>
        Vergleicht die Likes der jüngeren Hälfte des Beobachtungszeitraums mit
        der älteren Hälfte. Ein positiver Wert heißt: Die Beiträge der letzten
        Fensterhälfte kommen besser an als davor; ein negativer Wert heißt, das
        Interesse hat nachgelassen. Im Kachelkopf über alle Posts gerechnet, an
        den Themenzeilen jeweils nur über die Posts des Themas.
      </Para>
    ),
    example: (
      <Para>
        −10 % bei „14 Tage" bedeutet: Die Posts der letzten 7 Tage haben zusammen
        10 % weniger Likes als die der 7 Tage davor.
      </Para>
    ),
    note: (
      <Para>
        Ohne Likes in der älteren Fensterhälfte fehlt der Bezugswert; dann steht
        statt einer Prozentzahl ein „neu" (frisches Thema), nicht etwa ±0 %.
        Junge Posts hatten zudem weniger Zeit, Likes zu sammeln; kleine
        Ausschläge nicht überbewerten.
      </Para>
    ),
  },
  social_briefing: {
    title: 'Lagebild',
    body: (
      <Para>
        Vom Sprachmodell erzeugte Kurz-Zusammenfassung der aktuellen Themenlage
        über alle beobachteten Kanäle, als schneller Überblick auf einen Blick.
      </Para>
    ),
  },
  social_cost: {
    title: 'Feature-Kosten',
    body: (
      <Para>
        Aufsummierte Kosten aller Aktualisierungen: Apify (Abruf der Posts,
        geschätzt nach Ergebnissen) plus LLM (Themen-Analyse, exakt abgerechnet).
        Der Seitenaufruf selbst ist kostenlos, geladen wird nur auf Klick.
      </Para>
    ),
  },

} satisfies Record<string, Explanation>;
