/**
 * Decode HTML entities and convert common markup to Unicode.
 *
 * Publication titles from the ÖAW database often contain escaped HTML like:
 *   e&lt;SUP&gt;+&lt;/SUP&gt;e&lt;SUP&gt;-&lt;/SUP&gt;
 * which should display as: e⁺e⁻
 */

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3',
  '4': '\u2074', '5': '\u2075', '6': '\u2076', '7': '\u2077',
  '8': '\u2078', '9': '\u2079', '+': '\u207A', '-': '\u207B',
  '=': '\u207C', '(': '\u207D', ')': '\u207E', 'n': '\u207F',
  'i': '\u2071',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '\u2080', '1': '\u2081', '2': '\u2082', '3': '\u2083',
  '4': '\u2084', '5': '\u2085', '6': '\u2086', '7': '\u2087',
  '8': '\u2088', '9': '\u2089', '+': '\u208A', '-': '\u208B',
  '=': '\u208C', '(': '\u208D', ')': '\u208E',
};

function toUnicode(text: string, map: Record<string, string>): string {
  return text.split('').map(ch => map[ch] ?? ch).join('');
}

export function decodeHtmlTitle(raw: string): string {
  let s = raw;

  // Step 1: Decode HTML entities → real HTML tags
  s = s.replace(/&lt;/gi, '<')
       .replace(/&gt;/gi, '>')
       .replace(/&amp;/gi, '&')
       .replace(/&quot;/gi, '"')
       .replace(/&#39;/gi, "'")
       .replace(/&apos;/gi, "'");

  // Step 2: Convert <SUP>...</SUP> → Unicode superscript
  s = s.replace(/<sup>(.*?)<\/sup>/gi, (_, inner) => toUnicode(inner, SUPERSCRIPT_MAP));

  // Step 3: Convert <SUB>...</SUB> → Unicode subscript
  s = s.replace(/<sub>(.*?)<\/sub>/gi, (_, inner) => toUnicode(inner, SUBSCRIPT_MAP));

  // Step 4: Strip any remaining HTML tags
  s = s.replace(/<[^>]+>/g, '');

  // Step 5: Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}
