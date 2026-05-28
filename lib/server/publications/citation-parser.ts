/**
 * Pure (Elsevier) renderingHtml citation parser.
 *
 * 45 % of the publications corpus stores citation as Pure's `renderingHtml`
 * export. The format is documented and consistent enough that we can lift
 * structured fields (title, authors with roles, venue, trailing
 * bibliographic detail) out of it — useful for two things:
 *
 *   1. Richer detail-page display: bold title, italicised venue, author
 *      list with ÖAW authors linked to their person page.
 *   2. Fallback author source: for the ~4 % of pubs where
 *      `person_publications` is sparse (the same cohort the orgunit
 *      author-affiliation derivation covers), the citation carries the
 *      complete author list; matching against the resolved ÖAW persons by
 *      name normalisation gives us a way to surface every contributor with
 *      the OEAW ones still distinguished.
 *
 * Pattern (from the Pure spec + 5 random prod samples):
 *
 *   <div class="rendering rendering_<type> rendering_<type>_<style>
 *               rendering_<subtype> rendering_standard
 *               rendering_<subtype>_standard">
 *     <span><strong>$TITLE</strong></span> /
 *     [<span>]$AUTHOR1[</span>]<span>; $AUTHOR2[ ($ROLE)]</span>… [et al.]
 *     <br/>                                          ← only for non-monograph subtypes
 *     [in: ]<span>$VENUE</span>, $TRAILER          ← "in:" prefix only for journal articles
 *   </div>
 *
 * Documented at:
 *   https://adk.elsevierpure.com/ws/api/documentation/user-guide/working-with-types.html
 *
 * Why cheerio over regex? Titles in our corpus can contain " / " (173 pubs
 * have a literal space-slash-space) so the slash separator between title
 * and authors is not safe for text-level splitting. Cheerio gives us the
 * `<strong>` boundary as the unambiguous title anchor.
 *
 * Why server-only? cheerio ships ~200 KB; we never need to parse on the
 * client because the result already rides on the wire as JSON.
 *
 * Robustness contract:
 *   - Strict pattern match: returns `null` when the input doesn't look
 *     like Pure renderingHtml (caller falls back to `decodeHtmlBlock`).
 *   - Decoded fields are plain text (entities resolved, sub/sup → Unicode)
 *     via the same `decodeHtmlInline` used elsewhere.
 *   - Malformed Pure HTML returns a partial `ParsedCitation` where the
 *     missing fields are null — we never throw.
 */

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { decodeHtmlInline } from '@/lib/shared/html-utils';
import type {
  ParsedCitation,
  ParsedCitationAuthor,
  ParsedCitationType,
} from '@/lib/shared/types';

const TYPE_BY_TOKEN: Record<string, ParsedCitationType> = {
  rendering_researchoutput: 'researchoutput',
  rendering_dataset: 'dataset',
};

// Pure subtype tokens we've observed in the OEAW corpus. The set is not
// exhaustive — extending it doesn't change parser behaviour, only what
// subtype string we attach to the result for downstream UI hints.
const KNOWN_SUBTYPE_TOKENS = new Set([
  'contributiontojournal',
  'contributiontobookanthology',
  'bookanthology',
  'conferencecontribution',
  'workingpaper',
  'patent',
  'report',
]);

/** Strip a trailing role annotation in parens, e.g. "Name, X (Herausgeber:in)". */
function splitAuthorRole(raw: string): ParsedCitationAuthor {
  const roleMatch = raw.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  if (roleMatch) {
    return { name: roleMatch[1].trim(), role: roleMatch[2].trim() };
  }
  return { name: raw.trim(), role: null };
}

/**
 * Split a decoded author block ("Name 1; Name 2 (Role); Name 3 et al.")
 * into structured entries. Recognises the trailing " et al." marker.
 */
function parseAuthorBlock(decoded: string): {
  authors: ParsedCitationAuthor[];
  etAl: boolean;
} {
  let s = decoded.trim();
  // Strip trailing punctuation that Pure leaves between the author list and
  // the <br>: ".", ",", or just whitespace.
  s = s.replace(/[\s.,]+$/, '');
  const etAl = / et al\.?$/i.test(s);
  if (etAl) s = s.replace(/ et al\.?$/i, '').trim();

  if (!s) return { authors: [], etAl };

  const parts = s
    .split(/\s*;\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { authors: parts.map(splitAuthorRole), etAl };
}

/**
 * Inspect the outer `.rendering` div's class list and pick out the content
 * type (researchoutput / dataset) and the subtype slug, if any.
 */
function classifyFromClassList(classList: string): {
  type: ParsedCitationType;
  subtype: string | null;
} {
  const tokens = classList.split(/\s+/).filter(Boolean);
  let type: ParsedCitationType = 'unknown';
  for (const tok of tokens) {
    const mapped = TYPE_BY_TOKEN[tok];
    if (mapped) {
      type = mapped;
      break;
    }
  }
  // Subtype is encoded twice: as `rendering_<subtype>` and
  // `rendering_<subtype>_<style>`. Prefer the bare-subtype form, fall back
  // to any known-token match.
  let subtype: string | null = null;
  for (const tok of tokens) {
    const m = tok.match(/^rendering_([a-z]+)$/);
    if (m && KNOWN_SUBTYPE_TOKENS.has(m[1])) {
      subtype = m[1];
      break;
    }
  }
  return { type, subtype };
}

/**
 * Walks the DOM after the title `<strong>` and before the first `<br>`,
 * concatenating all text content into the raw author block. We can't
 * cleanly slice by string position because the author wrapping varies
 * (first author sometimes naked, sometimes in `<span>`).
 */
function extractTextBetweenStrongAndBr($: cheerio.CheerioAPI): {
  authorRaw: string;
  tailRaw: string;
} {
  const root = $.root().find('.rendering').first();
  // Iterate root's text nodes + descendants linearly. Cheerio's `.contents()`
  // gives an array including text/comment nodes. We need a full DOM walk
  // because the author/venue text sits at the same depth as inline tags.
  let foundStrong = false;
  let foundBr = false;
  let authorAcc = '';
  let tailAcc = '';

  // `Cheerio<AnyNode>` (AnyNode from `domhandler`, cheerio's underlying
  // parse tree) is the most general node-selection shape — accepts both
  // Document (from `$.root()`) and Element (from `$(el)` during recursion).
  const walk = (node: cheerio.Cheerio<AnyNode>): void => {
    node.contents().each((_, el) => {
      if (el.type === 'tag') {
        const tag = el.name?.toLowerCase();
        if (tag === 'strong' && !foundStrong) {
          foundStrong = true;
          return;
        }
        if (tag === 'br') {
          foundBr = true;
          return;
        }
        // Recurse into spans / wrapper divs.
        walk($(el));
        return;
      }
      if (el.type === 'text') {
        if (!foundStrong) return;
        const text = el.data ?? '';
        if (foundBr) tailAcc += text;
        else authorAcc += text;
      }
    });
  };
  walk(root);

  // The author block always opens with " / " in Pure's format; strip it so
  // the remainder is the actual author list.
  authorAcc = authorAcc.replace(/^\s*\/\s*/, '').trim();
  return { authorRaw: authorAcc, tailRaw: tailAcc.trim() };
}

/**
 * Extract the `<strong>` inner text as the title. Cheerio's `.text()` on
 * the strong handles entities + sub/sup correctly; we then run it through
 * `decodeHtmlInline` to fold any remaining inline tags or entities.
 */
function extractTitle($: cheerio.CheerioAPI): string | null {
  const strong = $.root().find('.rendering').first().find('strong').first();
  if (!strong.length) return null;
  const decoded = decodeHtmlInline(strong.html());
  // Pure tends to terminate the title with a period or other punctuation.
  // Strip ONE trailing period so the rendered title doesn't read "Foo.."
  // when callers append their own punctuation. Multi-period (..., …) keep
  // the rest of the dots.
  return decoded.replace(/\.$/, '').trim() || null;
}

/**
 * Parse the tail after the title-line. Two shapes in the OEAW corpus:
 *
 *   Journal article:  "in: <span>JOURNAL</span>, $REST"
 *                  → venue = "JOURNAL", venueKind = 'journal',
 *                    trailer = "$REST" (volume/issue/pages/date)
 *
 *   Book chapter:    "BOOK TITLE. $REST" (no leading "in:")
 *                  → venue = "BOOK TITLE", venueKind = 'book-host',
 *                    trailer = "$REST"
 *
 * For monographs / datasets the tail is empty and we leave venue null.
 */
function parseTail(tailRaw: string): {
  venue: string | null;
  venueKind: 'journal' | 'book-host' | null;
  trailer: string | null;
} {
  const cleaned = tailRaw.trim();
  if (!cleaned) return { venue: null, venueKind: null, trailer: null };

  const inMatch = cleaned.match(/^in:\s*(.+)$/i);
  if (inMatch) {
    const rest = inMatch[1].trim();
    // First comma separates the journal name from the volume/issue/date
    // string. Journal names with embedded commas are rare in Pure exports.
    const commaAt = rest.indexOf(',');
    if (commaAt === -1) {
      return {
        venue: rest.replace(/[.\s]+$/, '').trim() || null,
        venueKind: 'journal',
        trailer: null,
      };
    }
    const venue = rest.slice(0, commaAt).trim() || null;
    const trailer = rest.slice(commaAt + 1).trim() || null;
    return { venue, venueKind: 'journal', trailer };
  }

  // Chapter-style tail: first sentence-ending period or first ". ed. by"
  // marks the end of the host-book title.
  const periodAt = cleaned.search(/\.\s/);
  if (periodAt > 0) {
    const venue = cleaned.slice(0, periodAt).trim() || null;
    const trailer = cleaned.slice(periodAt + 1).trim() || null;
    return { venue, venueKind: 'book-host', trailer };
  }
  return {
    venue: cleaned.replace(/[.\s]+$/, '').trim() || null,
    venueKind: 'book-host',
    trailer: null,
  };
}

/**
 * Parse a Pure renderingHtml citation into structured fields. Returns
 * `null` when the input doesn't match the Pure wrapper — callers fall back
 * to `decodeHtmlBlock` for plain-text rendering.
 */
export function parseCitation(
  rawHtml: string | null | undefined,
): ParsedCitation | null {
  if (!rawHtml) return null;
  // Cheap pre-check: only invoke the parser on inputs that actually look
  // like Pure HTML. Saves a cheerio.load on every plain-text citation.
  if (!/<div\s+class="rendering[^"]*"/i.test(rawHtml)) return null;

  // Cheerio's `null, false` options disable the default `<html><body>`
  // wrapping so DOM walks land on the source tree directly.
  const $ = cheerio.load(rawHtml, null, false);
  const wrapper = $.root().find('.rendering').first();
  if (!wrapper.length) return null;

  const classList = wrapper.attr('class') ?? '';
  const { type, subtype } = classifyFromClassList(classList);

  const title = extractTitle($);
  if (!title) return null;

  const { authorRaw, tailRaw } = extractTextBetweenStrongAndBr($);
  const { authors, etAl } = parseAuthorBlock(decodeHtmlInline(authorRaw));
  const { venue, venueKind, trailer } = parseTail(decodeHtmlInline(tailRaw));

  return {
    type,
    subtype,
    title,
    authors,
    etAl,
    venue,
    venueKind,
    trailer,
  };
}
