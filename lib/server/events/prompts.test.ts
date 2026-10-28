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

      Kalibrierung am Bestand. Die Scores müssen mit den rund 470 bereits bewerteten Veranstaltungen vergleichbar bleiben: Median 0.26, ein Viertel unter 0.13, nur jede zehnte über 0.55. Typische Werte je Bereich, in der Reihenfolge public_appeal / scientific_significance / reach / timeliness:
      - um 0.09, interne oder technische Seminare, Group Meetings, Fachvorträge im engen Kreis: 0.05 / 0.17 / 0.05 / 0.05
      - um 0.19, Fachworkshops, Summer Schools und Symposien für ein Fachpublikum, auch mit Anmeldung: 0.12 / 0.35 / 0.12 / 0.10
      - um 0.32, Kolloquien, Preisverleihungen und öffentliche Vorträge zu einem engeren Thema: 0.32 / 0.42 / 0.24 / 0.23
      - um 0.46, öffentliche Konferenzen, Abendvorträge und Podien zu breit anschlussfähigen Themen: 0.52 / 0.46 / 0.40 / 0.44
      - ab 0.6, Flaggschiffe: große internationale Kongresse mit Publikumsprogramm, Publikumsabende wie die Lange Nacht der Museen, Podien zu tagesaktuellen Konflikten oder großen Jubiläen: 0.66 / 0.61 / 0.61 / 0.57
      Ordne jede Veranstaltung zuerst einem dieser Bereiche zu und weiche nur ab, wo die Ankündigung es begründet; einzelne Flaggschiffe dürfen deutlich darüber liegen. timeliness über 0.3 braucht einen Anlass, den die Ankündigung nennt oder der unmittelbar zum Thema gehört (Jahrestag, laufender Konflikt, Saison); ein allgemein wichtiges Thema ohne Anlass hebt sie nicht.

      Mehrfachanlagen. Bei manchen Veranstaltungen stehen am selben Tag bereits bewertete Termine dabei (Kennung B1, B2 und so fort). Ist die Veranstaltung derselbe Termin wie einer davon, also eine Sprachfassung, eine Neuauflage auf der Zentralseite mit anderem Titel oder eine Kopie, übernimm dessen vier Dimensionen exakt und gib seine Kennung in twin_of an. Ein anderer Vortrag derselben Reihe oder ein anderer Termin am selben Tag ist kein Zwilling: dann twin_of null und eine eigene Bewertung. Erwähne die Übernahme in keinem Textfeld: Pitch, Angle und Begründung beschreiben die Veranstaltung selbst, nicht ihre Bewertung und nicht ihre andere Fassung.

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
            "twin_of": null,
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

describe('Schon bewertete Termine des Tages', () => {
  const sibling = {
    id: 'alt',
    title: 'Balkanforschung: Die Insel Hvar im Wandel der Zeit',
    eventAt: '2026-11-05T17:00:00+01:00',
    locationTitle: 'Österreichische Akademie der Wissenschaften',
    institute: 'OEAW - Home',
    public_appeal: 0.45,
    scientific_significance: 0.4,
    reach: 0.3,
    timeliness: 0.2,
  };

  it('stehen mit Kennung, Wiener Uhrzeit, Ort, Institut und Dimensionen unter der Beschreibung', () => {
    const prompt = buildEventEvaluationPrompt([{ ...rich, scoredSiblings: [sibling] }, bare]);
    expect(prompt).toContain(
      'Am selben Tag bereits bewertet (Beginn, Ort, Institut, Titel → public_appeal / scientific_significance / reach / timeliness):\n' +
        '- B1: 17:00, Österreichische Akademie der Wissenschaften, OEAW - Home, „Balkanforschung: Die Insel Hvar im Wandel der Zeit" → 0.45 / 0.4 / 0.3 / 0.2',
    );
    // Nur beim Event mit Geschwistern, und vor der nächsten Veranstaltung.
    expect(prompt.indexOf('Am selben Tag bereits bewertet')).toBeLessThan(prompt.indexOf('--- Veranstaltung 2 ---'));
    expect(prompt.split('Am selben Tag bereits bewertet').length).toBe(2);
  });

  it('lassen den Prompt ohne Geschwister zeichengleich', () => {
    expect(buildEventEvaluationPrompt([{ ...rich, scoredSiblings: [] }, bare])).toBe(buildEventEvaluationPrompt([rich, bare]));
  });
});
