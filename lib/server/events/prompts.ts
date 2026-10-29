// Prompt builder for event relevance scoring — mirrors lib/server/analysis/
// prompts.ts but for the Veranstaltungsbetrieb use case: how relevant is an
// event for the central ÖAW event programme / public event page.
//
// Die Textregeln stehen als Bausteine da, weil das Lektorat des Bewertungskerns
// an denselben Sätzen misst. Der gerenderte Prompt bleibt zeichengleich
// (lib/server/events/prompts.test.ts).

import { decodeHtmlBlock } from '@/lib/shared/html-utils';
import type { EventRow } from './to-api';

/**
 * Ein am selben Wiener Kalendertag schon bewerteter Termin. Der Prompt zeigt
 * ihn je Event (Kennung B1, B2 …), damit das Modell Mehrfachanlagen über Läufe
 * hinweg erkennt (EVENT_TWIN_RULE); der Adapter übernimmt dann dessen
 * Dimensionen (lib/server/events/scoring-adapter.ts, alignTwins).
 */
export interface ScoredSibling {
  id: string;
  title: string;
  eventAt: Date | string;
  locationTitle: string | null;
  institute: string | null;
  public_appeal: number;
  scientific_significance: number;
  reach: number;
  timeliness: number;
}

/** The event row fields the prompt needs, plus the scored siblings of its day. */
export type EventForPrompt = Pick<
  EventRow,
  | 'title'
  | 'teaser'
  | 'bodytext'
  | 'eventInformation'
  | 'eventAt'
  | 'eventEndAt'
  | 'locationTitle'
  | 'organizerTitle'
  | 'institute'
> & { scoredSiblings?: readonly ScoredSibling[] };

/** One LLM evaluation per event (the JSON shape the model must return). */
export interface EventAnalysisResult {
  event_index?: number;
  public_appeal: number;
  scientific_significance: number;
  reach: number;
  timeliness: number;
  /** Kennung (B1, B2 …) des schon bewerteten Zwillings, sonst null. */
  twin_of?: string | null;
  pitch_suggestion: string;
  suggested_angle: string;
  target_audience: string;
  reasoning: string;
}

/** Kennung des i-ten schon bewerteten Termins eines Events (0-basiert): B1, B2 … */
export const siblingLabel = (i: number): string => `B${i + 1}`;

export const SYSTEM_PROMPT = `Du bist Veranstaltungs- und Pressereferent:in an der Österreichischen Akademie der Wissenschaften (ÖAW) und kuratierst das zentrale Veranstaltungsprogramm. Deine Aufgabe ist einzuschätzen, wie relevant eine Veranstaltung für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite und für die Presse- und Öffentlichkeitsarbeit ist, also für ein breites, überwiegend fachfremdes Publikum.

Leitlinien: Öffentliche Formate (Vorträge, Ausstellungen, Buchpräsentationen, Podien, Lesungen, Aktionstage, Kinderuni), international sichtbare Flaggschiff-Kongresse sowie Veranstaltungen zu gesellschaftlich aktuellen Themen sind in der Regel HOCH relevant, auch wenn sie im Kern wissenschaftlich sind. Rein interne Formate (Fachseminare, Arbeitstreffen, Gremiensitzungen, geschlossene Graduate Schools, reine Calls for Papers) sind in der Regel NIEDRIG relevant. Nutze die volle Skala von 0.0 bis 1.0 und weiche nicht reflexartig in die Mitte aus. Bewerte die vier Dimensionen unabhängig voneinander; sie messen Unterschiedliches und dürfen auseinanderfallen. Bewerte ausschließlich aus dem Inhalt heraus. Antworte ausschließlich mit gültigem JSON.`;

/** Die vier Textfelder (Punkte 5 bis 8), so wie das Modell sie schreibt. Auch
 *  der Maßstab des Lektorats im Bewertungskern (lib/server/scoring/lektorat.ts).
 *
 *  Punkt 8 verlangte bis 2026-10-29 Sätze, „die die Einstufung begründen", und
 *  das Modell nahm das wörtlich: in 12 von 27 Begründungen der ersten Nacht
 *  stand die Einstufung selbst, oft im Wortlaut der Kalibrierung („zählt damit
 *  zu den Fachvorträgen im engen Kreis"). Die Gründe gehören der Sache. */
export const EVENT_TEXT_RULES = `5. pitch_suggestion: Ein 2-4 Sätze langer deutscher Teaser, wie er auf der Veranstaltungsseite stehen könnte. Lebendig, zugänglich, fachfremd. Aufhänger, worum es geht, warum es einen Besuch lohnt.
6. suggested_angle: Ein Satz auf Deutsch, der den Aufhänger / die Bewerbungs-Stoßrichtung beschreibt.
7. target_audience: Das Zielpublikum (z.B. „breite Öffentlichkeit", „Familien", „Studierende", „Fachpublikum Geschichte"). 1-3 Angaben, kommagetrennt.
8. reasoning: 2-3 Sätze auf Deutsch mit den Gründen, aus der Sache heraus: Thema, Format, Zugang und Publikum, Anlass. Die Sätze beschreiben die Veranstaltung, nie ihre Bewertung: keine Einstufung, kein Bereich aus der Kalibrierung, keine Werte, kein Verweis auf eine andere Fassung desselben Termins. Gibt die Ankündigung wenig her, sag, was ihr fehlt („Die Ankündigung nennt weder Vortragende noch Ort."), nicht, wie deshalb bewertet wurde. Nur lesbarer Fließtext, keine Variablennamen oder Datenbankfelder.`;

/**
 * Kalibrierung am Bestand (seit 2026-10-28), ersetzt die früheren Archetypen.
 * Die lagen über der gelebten Praxis (ein interner Workshop ergab rund 0.25,
 * in-chat stehen solche Termine bei 0.09), und der Bewertungskern bewertete im
 * Vergleichslauf im Schnitt 0.14 höher als die In-Chat-Kohorte. Die Werte je
 * Bereich sind die Mittel der In-Chat-Bewertungen (Opus 4.8 bis 5.5, 468
 * Veranstaltungen, Stand 2026-10-28). In-Chat und Nacht teilen sich diese
 * eine Kalibrierung; docs/INCHAT_SCORING.md verweist hierher.
 */
export const EVENT_CALIBRATION = `Kalibrierung am Bestand. Die Scores müssen mit den rund 470 bereits bewerteten Veranstaltungen vergleichbar bleiben: Median 0.26, ein Viertel unter 0.13, nur jede zehnte über 0.55. Typische Werte je Bereich, in der Reihenfolge public_appeal / scientific_significance / reach / timeliness:
- um 0.09, interne oder technische Seminare, Group Meetings, Fachvorträge im engen Kreis: 0.05 / 0.17 / 0.05 / 0.05
- um 0.19, Fachworkshops, Summer Schools und Symposien für ein Fachpublikum, auch mit Anmeldung: 0.12 / 0.35 / 0.12 / 0.10
- um 0.32, Kolloquien, Preisverleihungen und öffentliche Vorträge zu einem engeren Thema: 0.32 / 0.42 / 0.24 / 0.23
- um 0.46, öffentliche Konferenzen, Abendvorträge und Podien zu breit anschlussfähigen Themen: 0.52 / 0.46 / 0.40 / 0.44
- ab 0.6, Flaggschiffe: große internationale Kongresse mit Publikumsprogramm, Publikumsabende wie die Lange Nacht der Museen, Podien zu tagesaktuellen Konflikten oder großen Jubiläen: 0.66 / 0.61 / 0.61 / 0.57
Ordne jede Veranstaltung zuerst einem dieser Bereiche zu und weiche nur ab, wo die Ankündigung es begründet; einzelne Flaggschiffe dürfen deutlich darüber liegen. Die Zuordnung ist ein Arbeitsschritt für die Zahlen, in den Texten kommen die Bereiche nicht vor. timeliness über 0.3 braucht einen Anlass, den die Ankündigung nennt oder der unmittelbar zum Thema gehört (Jahrestag, laufender Konflikt, Saison); ein allgemein wichtiges Thema ohne Anlass hebt sie nicht.`;

/**
 * Mehrfachanlagen über Läufe hinweg (seit 2026-10-28). Dieselbe Veranstaltung
 * steht oft mehrfach im Export: als Sprachfassung, als Neuauflage auf der
 * Zentralseite („OEAW - Home") mit neuem Titel, als TYPO3-Kopie. Im selben Lauf
 * gruppiert eventTwinGroups sie; ist eine Fassung schon bewertet, sieht das
 * Modell sie je Event und entscheidet wie die In-Chat-Bewertung, ob es derselbe
 * Termin ist. Eine Textregel träfe die neu betitelten Fassungen der Zentralseite
 * und die Übersetzungen nicht sicher.
 */
export const EVENT_TWIN_RULE = `Mehrfachanlagen. Bei manchen Veranstaltungen stehen am selben Tag bereits bewertete Termine dabei (Kennung B1, B2 und so fort). Ist die Veranstaltung derselbe Termin wie einer davon, also eine Sprachfassung, eine Neuauflage auf der Zentralseite mit anderem Titel oder eine Kopie, übernimm dessen vier Dimensionen exakt und gib seine Kennung in twin_of an. Ein anderer Vortrag derselben Reihe oder ein anderer Termin am selben Tag ist kein Zwilling: dann twin_of null und eine eigene Bewertung. Erwähne die Übernahme in keinem Textfeld: Pitch, Angle und Begründung beschreiben die Veranstaltung selbst, nicht ihre Bewertung und nicht ihre andere Fassung.`;

const VIENNA_TIME = new Intl.DateTimeFormat('de-AT', { timeZone: 'Europe/Vienna', hour: '2-digit', minute: '2-digit' });

/** Die schon bewerteten Termine des Tages, als Block unter der Beschreibung (leer ohne). */
function siblingBlock(siblings: readonly ScoredSibling[] | undefined): string {
  if (!siblings?.length) return '';
  const lines = siblings.map(
    (s, i) =>
      `- ${siblingLabel(i)}: ${VIENNA_TIME.format(new Date(s.eventAt))}, ${s.locationTitle?.trim() || 'N/A'}, ${
        s.institute?.trim() || 'N/A'
      }, „${s.title}" → ${s.public_appeal} / ${s.scientific_significance} / ${s.reach} / ${s.timeliness}`,
  );
  return `\nAm selben Tag bereits bewertet (Beginn, Ort, Institut, Titel → public_appeal / scientific_significance / reach / timeliness):\n${lines.join('\n')}`;
}

/** Typografie aller Textfelder. */
export const EVENT_TYPOGRAPHY_RULES = `Verwende echte deutsche Umlaute (ä, ö, ü, ß), niemals „ae/oe/ue/ss". Verwende keine Geviert- oder Gedankenstriche (das Zeichen —); formuliere mit Komma, Doppelpunkt oder zwei Sätzen.`;

function wordTruncate(text: string, maxWords: number): string {
  const parts = text.trim().split(/\s+/);
  if (parts.length <= maxWords) return text.trim();
  return parts.slice(0, maxWords).join(' ') + '…';
}

/** Best available description: teaser + bodytext + sidebar info, HTML-stripped
 *  and truncated. Falls back to the title alone when nothing else is present.
 *  Exportiert für den Bewertungskern (Quelltext des Lektorats). */
export function pickContent(ev: Pick<EventForPrompt, 'teaser' | 'bodytext' | 'eventInformation'>): string {
  const parts = [ev.teaser, ev.bodytext, ev.eventInformation]
    .map((p) => decodeHtmlBlock(p).trim())
    .filter(Boolean);
  const joined = parts.join('\n\n');
  return joined ? wordTruncate(joined, 350) : '(keine Beschreibung — Bewertung nur anhand Titel/Metadaten)';
}

/**
 * Hinweis auf Zwillinge im Batch: Sprachversionen oder Kopien desselben
 * Termins (lib/server/events/scoring-adapter.ts, eventTwinGroups). Ohne ihn
 * bewertet das Modell beide Anlagen unabhängig, und dieselbe Veranstaltung
 * bekommt zwei Scores. `twins` sind 1-basierte Positionen je Gruppe; null,
 * wenn es keine Gruppe gibt.
 */
export function eventTwinNote(twins: readonly (readonly number[])[]): string | null {
  const lines = twins
    .filter((group) => group.length >= 2)
    .map((group) => {
      const listed = `${group.slice(0, -1).join(', ')} und ${group[group.length - 1]}`;
      return `Hinweis: Die Veranstaltungen ${listed} sind Sprachversionen oder Kopien desselben Termins. Vergib ihnen dieselben vier Dimensionen.`;
    });
  return lines.length > 0 ? lines.join('\n') : null;
}

export function buildEventEvaluationPrompt(
  events: EventForPrompt[],
  opts: { twins?: readonly (readonly number[])[] } = {},
): string {
  const twinNote = eventTwinNote(opts.twins ?? []);
  const descriptions = events
    .map((ev, idx) => {
      const ort = ev.locationTitle?.trim() || 'N/A';
      const veranstalter = ev.organizerTitle?.trim() || 'N/A';
      const institut = ev.institute?.trim() || 'N/A';
      return `--- Veranstaltung ${idx + 1} ---
Titel: ${ev.title}
Datum: ${ev.eventAt}${ev.eventEndAt ? ` bis ${ev.eventEndAt}` : ''}
Ort: ${ort}
Veranstalter: ${veranstalter}
Institut/Bereich: ${institut}
Beschreibung: ${pickContent(ev)}${siblingBlock(ev.scoredSiblings)}`;
    })
    .join('\n\n');

  return `Bewerte die folgenden ${events.length} Veranstaltungen der Österreichischen Akademie der Wissenschaften (ÖAW) danach, wie relevant sie für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite und für die Presse- und Öffentlichkeitsarbeit sind.

Grundhaltung: Öffentliche Formate (Vorträge, Ausstellungen, Buchpräsentationen, Podien, Lesungen, Aktionstage, Kinderuni), international sichtbare Flaggschiff-Kongresse und Veranstaltungen zu gesellschaftlich aktuellen Themen sind HOCH relevant, auch wenn sie im Kern wissenschaftlich sind. Rein interne Formate (Fachseminare, Arbeitstreffen, Gremiensitzungen, geschlossene Graduate Schools, reine Calls for Papers) sind NIEDRIG relevant. Nutze die volle Skala von 0.0 bis 1.0 und weiche nicht reflexartig in die Mitte aus.

Liefere für JEDE Veranstaltung vier UNABHÄNGIG zu bewertende Dimensionen. Sie messen Unterschiedliches und dürfen auseinanderfallen, vergib also nicht vier ähnliche Zahlen:
1. public_appeal (0.0-1.0): Interesse eines breiten, fachfremden Laienpublikums am THEMA selbst, unabhängig vom Format. Hoch bei gesellschaftlich, historisch oder kulturell anschlussfähigen Themen (Demokratie, Identität, aktuelle Konflikte, Alltags- und Kulturgeschichte, Jubiläen); niedrig bei hochspezialisierten Fachthemen ohne Alltagsbezug.
2. scientific_significance (0.0-1.0): wissenschaftliche und kulturelle Bedeutung sowie Prominenz. Hoch bei Leuchtturm- oder Flaggschiff-Charakter, internationaler Strahlkraft, prominenten Vortragenden, großer Tragweite; niedrig bei Routine- oder Nischenformaten.
3. reach (0.0-1.0): tatsächliche Breitenwirkung und Öffnung, das FORMAT-Maß. Hoch bei öffentlich zugänglichen, auf ein großes oder überregionales Publikum angelegten Veranstaltungen (offener Eintritt, Ausstellung, Publikumsprogramm, Medienanschluss, großes Teilnehmerfeld); niedrig bei geschlossenem oder kleinem Fachkreis (Anmeldung, Teilnehmerbegrenzung, CfP). Fällt oft von public_appeal ab: ein breit interessantes Thema im geschlossenen Workshop hat niedrige reach, ein Fachthema als großes öffentliches Festival hohe.
4. timeliness (0.0-1.0): aktueller Anlass. Hoch bei Bezug zu laufendem öffentlichem Diskurs, aktuellen Ereignissen und Konflikten, Jahrestagen und Jubiläen, Saison; niedrig ohne aktuellen Aufhänger.

${EVENT_CALIBRATION}

${EVENT_TWIN_RULE}

${EVENT_TEXT_RULES}

Typografie (alle Textfelder): ${EVENT_TYPOGRAPHY_RULES}

${descriptions}
${twinNote ? `\n${twinNote}\n` : ''}
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
}`;
}
