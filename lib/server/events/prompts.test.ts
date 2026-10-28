import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT, buildEventEvaluationPrompt, eventTwinNote, type EventForPrompt } from './prompts';

// Zwilling von lib/server/analysis/prompts.test.ts: die Event-Rubrik ist Teil
// der Kalibrierung, die Bausteine (EVENT_TEXT_RULES, EVENT_TYPOGRAPHY_RULES)
// nutzt auch das Lektorat des Bewertungskerns. Eine Extraktion darf den
// gerenderten Text um kein Zeichen verschieben.

const rich: EventForPrompt = {
  title: 'Demokratie unter Druck',
  teaser: '<p>Ein Abend über <strong>Populismus</strong> &amp; Öffentlichkeit.</p>',
  bodytext: '<p>Mit Beiträgen aus Zeitgeschichte und Politikwissenschaft.</p><p>Eintritt frei.</p>',
  eventInformation: '<ul><li>Anmeldung nicht erforderlich</li></ul>',
  eventAt: '2026-11-12T18:00:00+01:00',
  eventEndAt: '2026-11-12T20:00:00+01:00',
  locationTitle: 'ÖAW, Festsaal',
  organizerTitle: 'Institut für Zeitgeschichte',
  institute: 'Institut für Neuzeit- und Zeitgeschichtsforschung',
};

const bare: EventForPrompt = {
  title: 'Arbeitstreffen',
  teaser: null,
  bodytext: null,
  eventInformation: null,
  eventAt: '2026-12-01T09:00:00+01:00',
  eventEndAt: null,
  locationTitle: '  ',
  organizerTitle: null,
  institute: null,
};

describe('Bewertungs-Prompt der Veranstaltungen', () => {
  it('rendert den System-Prompt unverändert', () => {
    expect(SYSTEM_PROMPT).toMatchInlineSnapshot(`
      "Du bist Veranstaltungs- und Pressereferent:in an der Österreichischen Akademie der Wissenschaften (ÖAW) und kuratierst das zentrale Veranstaltungsprogramm. Deine Aufgabe ist einzuschätzen, wie relevant eine Veranstaltung für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite und für die Presse- und Öffentlichkeitsarbeit ist, also für ein breites, überwiegend fachfremdes Publikum.

      Leitlinien: Öffentliche Formate (Vorträge, Ausstellungen, Buchpräsentationen, Podien, Lesungen, Aktionstage, Kinderuni), international sichtbare Flaggschiff-Kongresse sowie Veranstaltungen zu gesellschaftlich aktuellen Themen sind in der Regel HOCH relevant, auch wenn sie im Kern wissenschaftlich sind. Rein interne Formate (Fachseminare, Arbeitstreffen, Gremiensitzungen, geschlossene Graduate Schools, reine Calls for Papers) sind in der Regel NIEDRIG relevant. Nutze die volle Skala von 0.0 bis 1.0 und weiche nicht reflexartig in die Mitte aus. Bewerte die vier Dimensionen unabhängig voneinander; sie messen Unterschiedliches und dürfen auseinanderfallen. Bewerte ausschließlich aus dem Inhalt heraus. Antworte ausschließlich mit gültigem JSON."
    `);
  });

  it('rendert den Bewertungs-Prompt unverändert', () => {
    expect(buildEventEvaluationPrompt([rich, bare])).toMatchInlineSnapshot(`
      "Bewerte die folgenden 2 Veranstaltungen der Österreichischen Akademie der Wissenschaften (ÖAW) danach, wie relevant sie für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite und für die Presse- und Öffentlichkeitsarbeit sind.

      Grundhaltung: Öffentliche Formate (Vorträge, Ausstellungen, Buchpräsentationen, Podien, Lesungen, Aktionstage, Kinderuni), international sichtbare Flaggschiff-Kongresse und Veranstaltungen zu gesellschaftlich aktuellen Themen sind HOCH relevant, auch wenn sie im Kern wissenschaftlich sind. Rein interne Formate (Fachseminare, Arbeitstreffen, Gremiensitzungen, geschlossene Graduate Schools, reine Calls for Papers) sind NIEDRIG relevant. Nutze die volle Skala von 0.0 bis 1.0 und weiche nicht reflexartig in die Mitte aus.

      Liefere für JEDE Veranstaltung vier UNABHÄNGIG zu bewertende Dimensionen. Sie messen Unterschiedliches und dürfen auseinanderfallen, vergib also nicht vier ähnliche Zahlen:
      1. public_appeal (0.0-1.0): Interesse eines breiten, fachfremden Laienpublikums am THEMA selbst, unabhängig vom Format. Hoch bei gesellschaftlich, historisch oder kulturell anschlussfähigen Themen (Demokratie, Identität, aktuelle Konflikte, Alltags- und Kulturgeschichte, Jubiläen); niedrig bei hochspezialisierten Fachthemen ohne Alltagsbezug.
      2. scientific_significance (0.0-1.0): wissenschaftliche und kulturelle Bedeutung sowie Prominenz. Hoch bei Leuchtturm- oder Flaggschiff-Charakter, internationaler Strahlkraft, prominenten Vortragenden, großer Tragweite; niedrig bei Routine- oder Nischenformaten.
      3. reach (0.0-1.0): tatsächliche Breitenwirkung und Öffnung, das FORMAT-Maß. Hoch bei öffentlich zugänglichen, auf ein großes oder überregionales Publikum angelegten Veranstaltungen (offener Eintritt, Ausstellung, Publikumsprogramm, Medienanschluss, großes Teilnehmerfeld); niedrig bei geschlossenem oder kleinem Fachkreis (Anmeldung, Teilnehmerbegrenzung, CfP). Fällt oft von public_appeal ab: ein breit interessantes Thema im geschlossenen Workshop hat niedrige reach, ein Fachthema als großes öffentliches Festival hohe.
      4. timeliness (0.0-1.0): aktueller Anlass. Hoch bei Bezug zu laufendem öffentlichem Diskurs, aktuellen Ereignissen und Konflikten, Jahrestagen und Jubiläen, Saison; niedrig ohne aktuellen Aufhänger.

      Kalibrierung (Archetypen zur Orientierung, nicht wörtlich übernehmen):
      - Internationaler Flaggschiff-Kongress mit öffentlichem Begleitprogramm (Ausstellungen, Stadt-Kooperation, großes Teilnehmerfeld): public_appeal ~0.7, scientific_significance ~0.9, reach ~0.8, timeliness ~0.4.
      - Öffentliche Buchpräsentation oder Abendvortrag zu einem gesellschaftlich-historischen Thema an prominentem Ort, offene Einladung: public_appeal ~0.7, scientific_significance ~0.5, reach ~0.6, timeliness ~0.4.
      - Veranstaltung zu einem tagesaktuellen gesellschaftlichen Thema (aktueller Konflikt, großes Jubiläum) mit öffentlichem Zugang: timeliness ~0.85, public_appeal ~0.7, reach ~0.6.
      - Geschlossene Graduate School, interner Workshop oder Fachseminar mit Anmeldung und kleinem Teilnehmerkreis: public_appeal ~0.2, scientific_significance ~0.4, reach ~0.15, timeliness ~0.2.

      5. pitch_suggestion: Ein 2-4 Sätze langer deutscher Teaser, wie er auf der Veranstaltungsseite stehen könnte. Lebendig, zugänglich, fachfremd. Aufhänger, worum es geht, warum es einen Besuch lohnt.
      6. suggested_angle: Ein Satz auf Deutsch, der den Aufhänger / die Bewerbungs-Stoßrichtung beschreibt.
      7. target_audience: Das Zielpublikum (z.B. „breite Öffentlichkeit", „Familien", „Studierende", „Fachpublikum Geschichte"). 1-3 Angaben, kommagetrennt.
      8. reasoning: 2-3 Sätze auf Deutsch, die die Einstufung begründen. Nur lesbarer Fließtext, keine Variablennamen oder Datenbankfelder.

      Typografie (alle Textfelder): Verwende echte deutsche Umlaute (ä, ö, ü, ß), niemals „ae/oe/ue/ss". Verwende keine Geviert- oder Gedankenstriche (das Zeichen —); formuliere mit Komma, Doppelpunkt oder zwei Sätzen.

      --- Veranstaltung 1 ---
      Titel: Demokratie unter Druck
      Datum: 2026-11-12T18:00:00+01:00 bis 2026-11-12T20:00:00+01:00
      Ort: ÖAW, Festsaal
      Veranstalter: Institut für Zeitgeschichte
      Institut/Bereich: Institut für Neuzeit- und Zeitgeschichtsforschung
      Beschreibung: Ein Abend über Populismus & Öffentlichkeit.

      Mit Beiträgen aus Zeitgeschichte und Politikwissenschaft.

      Eintritt frei.

      Anmeldung nicht erforderlich

      --- Veranstaltung 2 ---
      Titel: Arbeitstreffen
      Datum: 2026-12-01T09:00:00+01:00
      Ort: N/A
      Veranstalter: N/A
      Institut/Bereich: N/A
      Beschreibung: (keine Beschreibung — Bewertung nur anhand Titel/Metadaten)

      Antworte AUSSCHLIESSLICH mit gültigem JSON in diesem exakten Format:
      {
        "evaluations": [
          {
            "event_index": 1,
            "public_appeal": 0.0,
            "scientific_significance": 0.0,
            "reach": 0.0,
            "timeliness": 0.0,
            "pitch_suggestion": "...",
            "suggested_angle": "...",
            "target_audience": "...",
            "reasoning": "..."
          }
        ]
      }"
    `);
  });
});

describe('Zwillingshinweis', () => {
  it('nennt jede Gruppe in einer eigenen Zeile', () => {
    expect(eventTwinNote([[3, 4], [1, 2, 5]])).toBe(
      'Hinweis: Die Veranstaltungen 3 und 4 sind Sprachversionen oder Kopien desselben Termins. Vergib ihnen dieselben vier Dimensionen.\n' +
        'Hinweis: Die Veranstaltungen 1, 2 und 5 sind Sprachversionen oder Kopien desselben Termins. Vergib ihnen dieselben vier Dimensionen.',
    );
  });

  it('schweigt ohne Gruppe, auch bei Einzelpositionen', () => {
    expect(eventTwinNote([])).toBeNull();
    expect(eventTwinNote([[2]])).toBeNull();
  });

  it('steht zwischen den Veranstaltungen und dem Antwortformat', () => {
    const prompt = buildEventEvaluationPrompt([rich, bare], { twins: [[1, 2]] });
    expect(prompt).toContain(
      'Beschreibung: (keine Beschreibung — Bewertung nur anhand Titel/Metadaten)\n\nHinweis: Die Veranstaltungen 1 und 2 sind',
    );
    expect(prompt).toContain('Vergib ihnen dieselben vier Dimensionen.\n\nAntworte AUSSCHLIESSLICH');
  });

  it('lässt den Prompt ohne Zwillinge zeichengleich', () => {
    expect(buildEventEvaluationPrompt([rich, bare], { twins: [] })).toBe(buildEventEvaluationPrompt([rich, bare]));
  });
});
