/**
 * Plain-text decoders for HTML-bearing fields ingested from heterogeneous
 * upstream sources (WebDB → Pure/Elsevier renderingHtml, TYPO3 RTE,
 * CrossRef/OpenAlex JATS-style abstracts).
 *
 * ---------- Architecture Decision Record ----------
 *
 * Why hand-rolled regex (not `sanitize-html`, `html-to-text`, `cheerio`)?
 *
 * Our inputs are *narrow and well-formed*:
 *   • Pure renderingHtml — a documented `<div class="rendering_…">` wrapper
 *     with predictable `<span>/<strong>/<br>` content.
 *     https://adk.elsevierpure.com/ws/api/documentation/user-guide/working-with-types.html
 *   • TYPO3 RTE — a curated allow-list of tags (covered by sanitize-html
 *     for the one surface that renders structured HTML).
 *   • Enrichment APIs — only sub/sup/italic markup for science notation.
 *
 * We only need: entity-decode, sub/sup → Unicode, drop-all-tags, preserve
 * paragraph/line structure for block contexts. No DOM walking, no attribute
 * parsing, no allow-listing. Regex is the right tool — small, client-safe,
 * intent-clear.
 *
 * The pieces we DO delegate:
 *   • Entity decoding → `html-entities`. Named entities (250+), decimal and
 *     hex numeric, surrogate pairs — getting this right by hand is brittle;
 *     the library is 3 KB gzip.
 *   • HTML sanitization for `<dangerouslySetInnerHTML>` → `sanitize-html`
 *     (separate module: `lib/server/events/html-utils.ts`). That is the
 *     allow-list path, not a stripper. The two responsibilities stay split.
 *   • Structural DOM extraction (event-info label-proximity walker) →
 *     `cheerio` (in `lib/server/ingest/adapters/typo3-events.ts`).
 *
 * When a future use case needs DOM-level work (e.g. structured Pure-citation
 * parsing for `{ title, authors, journal, …}` extraction), introduce
 * `htmlparser2` or `cheerio` *for that consumer*; don't broaden these
 * decoders.
 *
 * ---------- API ----------
 *
 *   • `decodeHtmlInline(s)`   — single-line output. Entities decoded,
 *                                sub/sup → Unicode, tags stripped, all
 *                                whitespace collapsed to single spaces.
 *                                Use for: titles, names, single-cell text.
 *
 *   • `decodeHtmlBlock(s)`    — multi-line output. Same preprocessing as
 *                                inline, but `<br>` → "\n", `</p>` → "\n\n",
 *                                `</li>` → "\n" BEFORE tag-strip, and only
 *                                horizontal whitespace gets collapsed per
 *                                line. Pair with `whitespace-pre-wrap`.
 *                                Use for: citation, summary, abstract,
 *                                teaser, bodytext.
 *
 * Both accept `string | null | undefined` and return `''` for nullish input
 * so call sites stay declarative (`decodeHtmlBlock(pub.citation)` instead
 * of `pub.citation ? decode(pub.citation) : ''`).
 *
 * Output is plain text — safe to interpolate into JSX, never reaches
 * `dangerouslySetInnerHTML`, XSS-clean by construction.
 */

import { decode as decodeEntities } from 'html-entities';

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
  // Preserves any character not in the map (e.g., letters inside `<sup>exp</sup>`)
  // as plain text. Partial conversion is honest: digits/+/- become Unicode,
  // the rest remains readable.
  return text.split('').map((ch) => map[ch] ?? ch).join('');
}

/**
 * Common preprocessing pipeline:
 *   1. Decode HTML entities (named + numeric, via `html-entities`).
 *   2. Convert `<sub>…</sub>` / `<sup>…</sup>` to Unicode subscript /
 *      superscript characters so chemical formulae (`Cu<sub>54</sub>Zr<sub>46</sub>`),
 *      mathematical notation (`x<sup>2</sup>`) and particle annotations
 *      (`e<sup>+</sup>e<sup>-</sup>`) survive the strip pass.
 *
 * Returns a string with all entities decoded and sub/sup wrappers
 * converted; other tags remain in place for the caller's strip pass to
 * remove.
 */
function decodeEntitiesAndScripts(raw: string): string {
  let s = decodeEntities(raw);
  // Normalise non-breaking space (`&nbsp;` → U+00A0) to a regular space.
  // Our output is plain text rendered with `whitespace-pre-wrap`; preserving
  // NBSP would invisibly change line-wrap behaviour vs the source HTML and
  // also makes string equality surprising for tests/consumers ("1010 Wien"
  // looks identical but isn't). Same principle for zero-width space.
  s = s.replace(/[ ​]/g, ' ');
  s = s.replace(/<sup>(.*?)<\/sup>/gi, (_, inner: string) =>
    toUnicode(inner, SUPERSCRIPT_MAP),
  );
  s = s.replace(/<sub>(.*?)<\/sub>/gi, (_, inner: string) =>
    toUnicode(inner, SUBSCRIPT_MAP),
  );
  return s;
}

/**
 * Inline decoder: HTML → single-line plain text. All whitespace runs
 * (including newlines) collapse to single spaces. Tags are dropped; their
 * text content survives.
 *
 * Use for titles, names, anything that goes on one line.
 */
export function decodeHtmlInline(raw: string | null | undefined): string {
  if (!raw) return '';
  let s = decodeEntitiesAndScripts(raw);
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Block decoder: HTML → multi-line plain text. `<br>` / `</p>` / `</li>`
 * become newlines BEFORE tag-strip so the document's line structure
 * survives. Horizontal whitespace within each line collapses; newlines do
 * not. More than two consecutive blank lines cap at one paragraph break.
 *
 * Use for citation, summary, abstract, teaser, bodytext — anything
 * rendered with `whitespace-pre-wrap`.
 */
export function decodeHtmlBlock(raw: string | null | undefined): string {
  if (!raw) return '';
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
