/**
 * HTML decoding helpers for fields ingested from WebDB, Pure (Elsevier)
 * and enrichment APIs (CrossRef / OpenAlex). All output is plain text —
 * no `dangerouslySetInnerHTML` required; XSS-safe by construction.
 *
 * Two shapes:
 *   - `decodeHtmlTitle`: inline, collapses ALL whitespace to single spaces.
 *     Use for titles and single-line strings.
 *   - `decodeHtmlBlock`: preserves document line structure by mapping `<br>`
 *     and block-element close tags to newlines BEFORE the tag-strip pass,
 *     then collapses horizontal whitespace per line. Use for citation,
 *     summary, abstract — anything rendered with `whitespace-pre-wrap`.
 *
 * Both share a preprocessing step that decodes HTML entities and converts
 * `<sub>` / `<sup>` markup to Unicode subscript / superscript characters,
 * so scientific notation in enrichment data (`Cu<sub>54</sub>Zr<sub>46</sub>`,
 * `e<sup>+</sup>e<sup>-</sup>`) survives the strip.
 *
 * Pure (Elsevier) HTML — the dominant pattern in the citation column —
 * follows the documented `<div class="rendering rendering_<contentType>
 * rendering_<contentType>_<style>">` wrapper, with `<span><strong>$TITLE
 * </strong></span> / $AUTHORS <br/>in: <span>$JOURNAL</span>, …`. The
 * generic strip handles it cleanly because the structural information
 * (slash separator, "in:", commas) is text, not markup.
 * https://adk.elsevierpure.com/ws/api/documentation/user-guide/working-with-types.html
 *
 * Publication titles from the WebDB sometimes ship escaped HTML like
 *   e&lt;SUP&gt;+&lt;/SUP&gt;e&lt;SUP&gt;-&lt;/SUP&gt;
 * which becomes e⁺e⁻ after entity-decode + sub/sup→Unicode.
 */

const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³',
  '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷',
  '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻',
  '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ',
  'i': 'ⁱ',
};

const SUBSCRIPT_MAP: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃',
  '4': '₄', '5': '₅', '6': '₆', '7': '₇',
  '8': '₈', '9': '₉', '+': '₊', '-': '₋',
  '=': '₌', '(': '₍', ')': '₎',
};

function toUnicode(text: string, map: Record<string, string>): string {
  return text.split('').map(ch => map[ch] ?? ch).join('');
}

/** Shared preprocessing — common to inline and block decoders. */
function decodeEntitiesAndScripts(raw: string): string {
  let s = raw
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ');
  s = s.replace(/<sup>(.*?)<\/sup>/gi, (_, inner) => toUnicode(inner, SUPERSCRIPT_MAP));
  s = s.replace(/<sub>(.*?)<\/sub>/gi, (_, inner) => toUnicode(inner, SUBSCRIPT_MAP));
  return s;
}

export function decodeHtmlTitle(raw: string): string {
  let s = decodeEntitiesAndScripts(raw);
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Block-text variant of `decodeHtmlTitle`. Preserves the document's line
 * structure: `<br>` becomes `\n`, `</p>` becomes `\n\n`, `</li>` becomes
 * `\n`. Horizontal whitespace within a line gets collapsed; newlines do
 * not. Runs of more than two consecutive blank lines are capped at one.
 *
 * Use for citation, summary, abstract — fields rendered with
 * `whitespace-pre-wrap`. Returns plain text — safe to interpolate into
 * JSX without `dangerouslySetInnerHTML`.
 */
export function decodeHtmlBlock(raw: string): string {
  let s = decodeEntitiesAndScripts(raw);
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p\s*>/gi, '\n\n');
  s = s.replace(/<\/li\s*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/**
 * Returns the best display title for a publication.
 *
 * The WebDB import sometimes truncates titles at the first colon, leaving
 * generic stubs like "Wissenschaftliche Zusammenfassung" while the full title
 * including the subtitle lives only in the citation field. This heuristic
 * extends the title with the subtitle from the citation when that pattern is
 * confidently detected.
 *
 * Conservative match: only extends when the citation's title-segment starts
 * with exactly "<dbTitle>:" (case-insensitive). Anything else falls back to
 * the original — this avoids gluing author names or journal info onto the
 * title when the citation doesn't follow the expected format.
 */
export function displayTitle(primary: string, citation: string | null | undefined): string {
  const decoded = decodeHtmlTitle(primary);
  if (!citation) return decoded;

  const plain = decodeHtmlTitle(citation);

  // Citation typically ends the title-segment at " / " before authors.
  const titleSegment = plain.split(/\s+\/\s+/)[0].trim();

  const expectedPrefix = decoded + ':';
  if (
    titleSegment.length > expectedPrefix.length &&
    titleSegment.toLowerCase().startsWith(expectedPrefix.toLowerCase())
  ) {
    const extended = titleSegment.replace(/\.\s*$/, '');
    // Sanity guard: extension > 260 chars probably means the citation didn't
    // separate cleanly and we'd be appending bibliographic noise.
    if (extended.length - decoded.length < 260) {
      return extended;
    }
  }

  return decoded;
}
