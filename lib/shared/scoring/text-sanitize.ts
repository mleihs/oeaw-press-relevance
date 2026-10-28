// Textbereinigung für alles, was ein Modell in die Bewertungsfelder schreibt.
// Rein und ohne Abhängigkeiten: der Bewertungskern, das In-Chat-Apply und das
// Event-Apply laufen über dieselbe Funktion (vorher lag sie als Kopie in
// scripts/session-pipeline.ts).
//
// Den Gedankenstrich-Ersatz macht sanitizeText bewusst NICHT mehr. Früher wurde
// ein Em-Dash still zum Komma; damit sah das Text-Audit (text-audit.ts, Code
// `em_dash`) nie, dass das Modell die Typografie-Regel gebrochen hat, und das
// Lektorat konnte den Satz nicht ordentlich umbauen. Jetzt meldet das Audit den
// Strich, und replaceEmDashesFallback greift erst als letzte Stufe vor dem Write.

/** HTML-Reste und Entities entfernen, Leerraum und Satzzeichen-Leerstellen glätten. */
export function sanitizeText(s: string): string {
  return tidy(
    s
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  );
}

/**
 * Em-Dash (U+2014) → Komma, der ehemalige Schritt aus sanitizeText. Nur als
 * letzter Fallback vor dem Write: wer ihn braucht, hat einen Audit-Befund
 * übergangen und soll das laut melden (das CLI schreibt je Treffer eine
 * Warnzeile). Das Projekt verbietet Gedankenstriche in Texten
 * (docs/writing-style.md); ein statischer Linter erreicht DB-Inhalte nicht.
 */
export function replaceEmDashesFallback(s: string): string {
  return tidy(s.replace(/\s*—\s*/g, ', '));
}

/** Gemeinsamer Schluss beider Funktionen; Reihenfolge wie im alten Einzeiler. */
function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*([,.;:!?])/g, '$1')
    .trim();
}
