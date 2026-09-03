// Events-Domäne des EXPL-Objekts — Kalender-Pflege (Flag, Status-Workflow)
// und der Relevanz-Score samt Dimensionen. Zusammengeführt in ./index.tsx.

import { Para, type Explanation } from './primitives';

export const EVENTS_EXPL = {
  // ─── Veranstaltungen ─────────────────────────────────────────────────────
  event_flag: {
    title: 'Flag für die Kalender-Pflege',
    body: (
      <>
        <Para>
          Markiert ein Event mit einer Pin-Nadel, damit es beim nächsten Durchgang
          garantiert auf den Tisch kommt. Mehrere Teammitglieder können dasselbe
          Event flaggen; jede Notiz behält ihren Urheber.
        </Para>
        <Para>
          Sinnvoll als kurze Begründung („Termin mit Kanzler abklären", „doppelt
          gelistet?"), sichtbar im Tooltip und im aufgeklappten Flag-Panel.
        </Para>
      </>
    ),
  },
  event_decision_pitch: {
    title: 'Status: Markiert',
    body: (
      <Para>
        Das Event ist als relevant markiert und im zentralen Kalender
        eingetragen, keine weitere Maintainer-Aktion nötig. Aus der
        Default-Liste „Offen" verschwindet es und taucht im Tab „Markiert" auf.
      </Para>
    ),
  },
  event_decision_hold: {
    title: 'Status: Warten',
    body: (
      <Para>
        Das Event ist unklar: Rückfrage an die Veranstalter:innen, fehlende
        Infos oder Doppel-Eintrag im WEBDB. Hold parkt es sichtbar im Tab
        „Warten", ohne dass es aus den anderen Ansichten verschwindet.
      </Para>
    ),
  },
  event_decision_skip: {
    title: 'Status: Verworfen',
    body: (
      <Para>
        Das Event ist für den zentralen Kalender nicht relevant (intern,
        eingeladen, falsch markiert). Verschwindet aus der Default-Liste,
        bleibt im Tab „Verworfen" auffindbar und in der DB für Audits.
      </Para>
    ),
  },

  // ─── Events: Relevanz-Score (Veranstaltungsbetrieb) ───────────────────────
  event_score: {
    title: 'Relevanz-Score',
    body: (
      <Para>
        Gewichtete Einschätzung des Sprachmodells, wie relevant eine Veranstaltung
        für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite ist. Setzt sich
        aus vier Dimensionen zusammen: Öffentlichkeitswirkung (35%), Wissenschaftl.
        Bedeutung (30%), Reichweite (20%), Aktualität (15%).
      </Para>
    ),
  },
  event_public_appeal: {
    title: 'Öffentlichkeitswirkung',
    body: (
      <Para>
        Eignung und Interesse für ein breites, fachfremdes Publikum. Hoch bei
        öffentlichen Vorträgen, Ausstellungen, Lesungen, Podien; niedrig bei
        internen Fachseminaren, Workshops oder Arbeitstreffen.
      </Para>
    ),
  },
  event_significance: {
    title: 'Wissenschaftliche Bedeutung',
    body: (
      <Para>
        Bedeutung von Thema und Vortragenden, Flaggschiff- oder Leuchtturm-Charakter,
        gesellschaftliche Tragweite des behandelten Themas.
      </Para>
    ),
  },
  event_reach: {
    title: 'Reichweite',
    body: (
      <Para>
        Breite der Zielgruppe: hoch bei überregional anschlussfähigem Interesse,
        niedrig bei sehr spezialisiertem Nischenpublikum.
      </Para>
    ),
  },
  event_timeliness: {
    title: 'Aktualität',
    body: (
      <Para>
        Aktueller Anlass: Bezug zu laufendem Diskurs, Jahrestagen, Saison oder
        aktuellen Ereignissen und Trends.
      </Para>
    ),
  },
  event_pitch: {
    title: 'Vorschlag für die Veranstaltungsseite',
    body: (
      <Para>
        Vom Sprachmodell formulierter Teaser, wie er auf der Veranstaltungsseite
        stehen könnte: Aufhänger, worum es geht und warum ein Besuch lohnt.
        Redaktioneller Entwurf, vor Verwendung prüfen.
      </Para>
    ),
  },
  event_angle: {
    title: 'Blickwinkel',
    body: <Para>Ein-Satz-Aufhänger bzw. Bewerbungs-Stoßrichtung für die Veranstaltung.</Para>,
  },
  event_audience: {
    title: 'Zielpublikum',
    body: <Para>Vom Sprachmodell vorgeschlagenes Zielpublikum (z.B. breite Öffentlichkeit, Familien, Fachpublikum).</Para>,
  },
  event_reasoning: {
    title: 'Begründung',
    body: <Para>Kurze Begründung des Sprachmodells für die Relevanz-Einstufung dieser Veranstaltung.</Para>,
  },
  event_ai_provenance: {
    title: 'KI-Analyse',
    body: (
      <Para>
        Modell und Kosten dieser Einstufung. Die Relevanz-Bewertung stammt von einem
        Sprachmodell und ist eine Entscheidungshilfe, kein Ersatz für die redaktionelle
        Einschätzung.
      </Para>
    ),
  },

} satisfies Record<string, Explanation>;
