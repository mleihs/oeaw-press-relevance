// Haiku-Nachforderung. Hält ein Haiku die Prüfung nicht (Struktur, 5-7-5,
// unklares Wort), fordert der Kern bis zu zweimal ein neues an, statt es still
// zu verwerfen (so machte es der Bewerten-Knopf bis Oktober 2026). Der Auftrag
// ist derselbe wie in der Bewertung (HAIKU_RULES, dieselbe Persona), ergänzt
// um die Form, die die Prüfung verlangt, und um die gescheiterten Versuche
// samt Silbenzählung je Wort: das Modell soll sehen, woran es lag.

import { HAIKU_RULES, PERSONA } from '@/lib/server/analysis/prompts';
import { completeJson, parseJsonContent } from '@/lib/server/llm-client';
import type { ScoringCall } from './types';

export interface HaikuAttempt {
  haiku: string;
  /** Meldungen der Prüfung (checkHaiku), mit Silben je Wort. */
  issues: string[];
}

export const HAIKU_SYSTEM_PROMPT = `${PERSONA} Du schreibst ein deutsches Haiku zu einer Publikation der Akademie.

${HAIKU_RULES}

Form: Die drei Zeilen stehen in einer Zeichenkette, getrennt durch " / " (Leerzeichen, Schrägstrich, Leerzeichen). Erlaubt sind Buchstaben, Leerzeichen und die Satzzeichen , . : ; ! ? Keine Ziffern, keine Anführungszeichen, keine Binde- oder Gedankenstriche, keine Klammern.

Silben: Zähle jede Zeile Wort für Wort, bevor du antwortest. Gezählt wird nach deutscher Aussprache, eine Silbe je Vokalkern; ei, ai, au, eu und äu sind je eine Silbe, getrennt gesprochene Vokale zwei (Mu-se-um, Me-di-en, Na-ti-on). Meide Wörter, deren Silbenzahl strittig ist: Lehnwörter wie Code, Team oder Design, Eigennamen und Abkürzungen. Die Prüfung verwirft ein Haiku, sobald sie ein Wort nicht sicher zählen kann.

Antworte ausschließlich mit gültigem JSON: {"haiku": "erste Zeile / zweite Zeile / dritte Zeile"}`;

export function buildHaikuRetryPrompt(args: { title: string; content: string; previous: readonly HaikuAttempt[] }): string {
  const attempts = args.previous
    .map((a, i) => `Versuch ${i + 1}: "${a.haiku}"\n${a.issues.map((issue) => `- ${issue}`).join('\n')}`)
    .join('\n\n');
  return `Titel: ${args.title}
Inhalt: ${args.content}

Diese Versuche sind an der Prüfung gescheitert:

${attempts}

Schreibe ein neues Haiku mit genau 5, 7 und 5 Silben. Wiederhole keinen der gescheiterten Versuche.`;
}

/**
 * Ein neues Haiku, mit Effort max. Eine Antwort ohne verwertbares Feld liefert
 * einen leeren Text statt eines Fehlers: der Aufruf ist dann trotzdem bezahlt
 * und zählt als gescheiterter Versuch, die Prüfung meldet „Haiku fehlt".
 */
export async function requestHaiku(args: {
  title: string;
  content: string;
  previous: readonly HaikuAttempt[];
  call: ScoringCall;
}): Promise<{ haiku: string; tokensUsed: number; cost: number }> {
  const { content, tokensUsed, cost } = await completeJson({
    system: HAIKU_SYSTEM_PROMPT,
    user: buildHaikuRetryPrompt(args),
    apiKey: args.call.apiKey,
    model: args.call.model,
    effort: args.call.effort,
    batch: args.call.batch,
    maxTokens: 600,
  });
  let haiku = '';
  try {
    const parsed = parseJsonContent<{ haiku?: unknown }>(content);
    if (typeof parsed.haiku === 'string') haiku = parsed.haiku;
  } catch {
    // parseJsonContent hat geloggt; der Versuch zählt als gescheitert.
  }
  return { haiku, tokensUsed, cost };
}
