import { describe, it, expect } from 'vitest';
import { sanitizeText, replaceEmDashesFallback } from './text-sanitize';

// Wortgleiche Kopie der Funktion aus scripts/session-pipeline.ts vor dem Umzug
// (Stand 74a0a7d). Sie ist das Orakel: sanitizeText + replaceEmDashesFallback
// müssen zusammen exakt dasselbe liefern.
function legacySanitize(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s*—\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*([,.;:!?])/g, '$1')
    .trim();
}

const FIXTURES = [
  'Die Studie <i>zeigt</i>, dass&nbsp;Gletscher schmelzen.',
  'Zeile eins<br>Zeile zwei<br/>Zeile drei<BR />Ende',
  'A &amp; B &lt;3 &gt; C',
  '  viel    Leerraum \n\t und Zeilen  ',
  'Komma vor Punkt ,. und doppelt ,, und Leerzeichen , davor',
  'Der Befund — so die Autorinnen — ist robust.',
  'Am Satzende — .',
  '— am Anfang',
  'Strich —, dann Komma',
  'Doppelt —— gestrichen',
  'Bis-Strich 1975–1980 bleibt, Gedankenstrich – auch',
  '<p>Absatz</p><p>— zweiter</p>',
  '',
];

describe('sanitizeText', () => {
  it('equals the legacy pipeline once the em-dash fallback runs', () => {
    for (const s of FIXTURES) {
      expect(replaceEmDashesFallback(sanitizeText(s))).toBe(legacySanitize(s));
    }
  });

  it('leaves em-dashes in place so the audit can see them', () => {
    expect(sanitizeText('Der Befund — so die Autorinnen — ist robust.')).toBe(
      'Der Befund — so die Autorinnen — ist robust.',
    );
  });

  it('strips tags and decodes the four entities', () => {
    expect(sanitizeText('<b>A</b>&nbsp;&amp;&nbsp;B')).toBe('A & B');
  });
});

describe('replaceEmDashesFallback', () => {
  it('turns an em-dash into a comma and tidies the punctuation around it', () => {
    expect(replaceEmDashesFallback('Der Befund — so die Autorinnen — ist robust.')).toBe(
      'Der Befund, so die Autorinnen, ist robust.',
    );
    expect(replaceEmDashesFallback('Am Satzende — .')).toBe('Am Satzende.');
  });

  it('is a no-op on clean text', () => {
    expect(replaceEmDashesFallback('Kein Strich hier.')).toBe('Kein Strich hier.');
  });
});
