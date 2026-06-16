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

export const SYSTEM_PROMPT = `Du bist Veranstaltungs- und Pressereferent:in an der Österreichischen Akademie der Wissenschaften (ÖAW) und kuratierst das zentrale Veranstaltungsprogramm. Deine Aufgabe ist es einzuschätzen, wie relevant eine Veranstaltung für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite ist, also für ein breites, überwiegend fachfremdes Publikum. Öffentliche Vorträge, Ausstellungen, Podien und Aktionstage sind in der Regel relevanter als rein interne Fachseminare, Arbeitstreffen oder Gremiensitzungen. Bewerte ausschließlich aus dem Inhalt heraus. Antworte ausschließlich mit gültigem JSON.`;

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

  return `Bewerte die folgenden ${events.length} Veranstaltungen der Österreichischen Akademie der Wissenschaften (ÖAW) danach, wie relevant sie für die zentrale Bewerbung auf der ÖAW-Veranstaltungsseite sind.

Liefere für JEDE Veranstaltung:
1. public_appeal (0.0-1.0): Eignung und Interesse für ein breites, fachfremdes Publikum. Hoch bei öffentlichen Vorträgen, Ausstellungen, Lesungen, Podien, Aktionstagen; niedrig bei internen Fachseminaren, Workshops, Arbeitstreffen, Gremiensitzungen.
2. scientific_significance (0.0-1.0): Wissenschaftliche bzw. thematische Bedeutung. Prominenz von Thema oder Vortragenden, Flaggschiff- oder Leuchtturm-Charakter, gesellschaftliche Tragweite des Themas.
3. reach (0.0-1.0): Breite der Zielgruppe. Hoch bei überregionalem, allgemein anschlussfähigem Interesse; niedrig bei sehr spezialisiertem Nischenpublikum.
4. timeliness (0.0-1.0): Aktueller Anlass. Bezug zu laufendem Diskurs, Jahrestagen, Saison, aktuellen Ereignissen oder Trends.

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
