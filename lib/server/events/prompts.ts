// Prompt builder for event relevance scoring — mirrors lib/server/analysis/
// prompts.ts but for the Veranstaltungsbetrieb use case: how relevant is an
// event for the central ÖAW event programme / public event page.

import { decodeHtmlBlock } from '@/lib/shared/html-utils';
import type { EventRow } from './to-api';

/** The event row fields the prompt needs. */
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
>;

/** One LLM evaluation per event (the JSON shape the model must return). */
export interface EventAnalysisResult {
  event_index?: number;
  public_appeal: number;
  scientific_significance: number;
  reach: number;
  timeliness: number;
  pitch_suggestion: string;
  suggested_angle: string;
  target_audience: string;
  reasoning: string;
}

export const SYSTEM_PROMPT = `Du bist Veranstaltungs- und Pressereferent:in an der Österreichischen Akademie der Wissenschaften (ÖAW) und kuratierst das zentrale Veranstaltungsprogramm. Deine Aufgabe ist einzuschätzen, wie relevant eine Veranstaltung für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite und für die Presse- und Öffentlichkeitsarbeit ist, also für ein breites, überwiegend fachfremdes Publikum.

Leitlinien: Öffentliche Formate (Vorträge, Ausstellungen, Buchpräsentationen, Podien, Lesungen, Aktionstage, Kinderuni), international sichtbare Flaggschiff-Kongresse sowie Veranstaltungen zu gesellschaftlich aktuellen Themen sind in der Regel HOCH relevant, auch wenn sie im Kern wissenschaftlich sind. Rein interne Formate (Fachseminare, Arbeitstreffen, Gremiensitzungen, geschlossene Graduate Schools, reine Calls for Papers) sind in der Regel NIEDRIG relevant. Nutze die volle Skala von 0.0 bis 1.0 und weiche nicht reflexartig in die Mitte aus. Bewerte die vier Dimensionen unabhängig voneinander; sie messen Unterschiedliches und dürfen auseinanderfallen. Bewerte ausschließlich aus dem Inhalt heraus. Antworte ausschließlich mit gültigem JSON.`;

function wordTruncate(text: string, maxWords: number): string {
  const parts = text.trim().split(/\s+/);
  if (parts.length <= maxWords) return text.trim();
  return parts.slice(0, maxWords).join(' ') + '…';
}

/** Best available description: teaser + bodytext + sidebar info, HTML-stripped
 *  and truncated. Falls back to the title alone when nothing else is present. */
function pickContent(ev: EventForPrompt): string {
  const parts = [ev.teaser, ev.bodytext, ev.eventInformation]
    .map((p) => decodeHtmlBlock(p).trim())
    .filter(Boolean);
  const joined = parts.join('\n\n');
  return joined ? wordTruncate(joined, 350) : '(keine Beschreibung — Bewertung nur anhand Titel/Metadaten)';
}

export function buildEventEvaluationPrompt(events: EventForPrompt[]): string {
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
Beschreibung: ${pickContent(ev)}`;
    })
    .join('\n\n');

  return `Bewerte die folgenden ${events.length} Veranstaltungen der Österreichischen Akademie der Wissenschaften (ÖAW) danach, wie relevant sie für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite und für die Presse- und Öffentlichkeitsarbeit sind.

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

${descriptions}

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
}`;
}
