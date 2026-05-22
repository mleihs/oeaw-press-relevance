// Venue extraction from a publication's WebDB-native citation exports.
//
// The HeboWebDB has no dedicated journal column — the venue (journal title,
// book title, proceedings title) lives embedded in the BibTeX / RIS / EndNote
// export strings. The DOI-keyed API enrichment (CrossRef / OpenAlex / Semantic
// Scholar) only ever reaches DOI-bearing rows; this module recovers the venue
// for everything that carries a citation export — local, free, no API, no DOI.
// It is the fallback that lifts `enriched_journal` coverage from ~5% to ~80%.
//
// Pure, no I/O. Consumed by the enrichment batch (./batch.ts) and the one-shot
// backfill (scripts/backfill-venue.ts).

export interface VenueInput {
  bibtex?: string | null;
  ris?: string | null;
  endnote?: string | null;
}

export interface VenueResult {
  venue: string;
  /** which citation format the venue was read from — provenance for callers */
  source: 'bibtex' | 'ris' | 'endnote';
}

const LATEX_ACCENT: Record<string, string> = {
  a: 'ä', o: 'ö', u: 'ü', A: 'Ä', O: 'Ö', U: 'Ü',
};

/**
 * Strip the LaTeX / HTML noise BibTeX and EndNote exports carry, collapse
 * whitespace and drop stray braces. RIS is already clean UTF-8 — harmless here.
 */
export function cleanVenue(raw: string): string {
  let s = raw;
  // HTML entities (EndNote %B/%S carry &amp; etc.)
  s = s
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&(?:#0?39|apos);/gi, "'")
    .replace(/&nbsp;/gi, ' ');
  // LaTeX umlauts: {\"u}, {"u}, \"u  ->  ü   (+ ß)
  s = s
    .replace(/\{\\?"([aouAOU])\}/g, (_, c: string) => LATEX_ACCENT[c])
    .replace(/\\"([aouAOU])/g, (_, c: string) => LATEX_ACCENT[c])
    .replace(/\{\\?ss\}/g, 'ß');
  // escaped specials: \& \% \_ \{ ...
  s = s.replace(/\\([&%$#_{}])/g, '$1');
  // drop any remaining braces, collapse whitespace
  s = s.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
  // shed wrapping punctuation
  s = s.replace(/^[\s,.;:]+/, '').replace(/[\s,;:]+$/, '').trim();
  return s;
}

/**
 * Reject empties and stray number/code fragments (e.g. a BibTeX `series`
 * value like "150, 0007 (2017)") — a real venue carries a run of letters.
 */
function isPlausibleVenue(s: string): boolean {
  return s.length >= 3 && /\p{L}{3,}/u.test(s);
}

/**
 * Read a delimited BibTeX field value. Handles "..."- and {...}-delimited
 * values, brace-aware so a `"` inside a LaTeX accent (`M{"a}rz`) does not
 * terminate a quoted value.
 */
function readBibtexField(bibtex: string, field: string): string | null {
  const m = new RegExp(`(?:^|[,{\\s])${field}\\s*=\\s*`, 'i').exec(bibtex);
  if (!m) return null;
  let i = m.index + m[0].length;
  const open = bibtex[i];
  if (open !== '"' && open !== '{') return null; // bare value — skip (rare)
  i += 1;
  let depth = 0;
  let out = '';
  for (; i < bibtex.length; i += 1) {
    const ch = bibtex[i];
    if (ch === '{') { depth += 1; out += ch; continue; }
    if (ch === '}') {
      if (open === '{' && depth === 0) break;
      depth -= 1; out += ch; continue;
    }
    if (ch === '"' && open === '"' && depth === 0) break;
    out += ch;
  }
  return out;
}

function fromBibtex(bibtex: string): string | null {
  // @article -> journal; @incollection / @inproceedings -> booktitle.
  // Whichever is populated is the venue; `series` is deliberately ignored
  // (too noisy — e.g. "150, 0007 (2017)").
  for (const field of ['journal', 'booktitle']) {
    const raw = readBibtexField(bibtex, field);
    if (raw != null) {
      const v = cleanVenue(raw);
      if (isPlausibleVenue(v)) return v;
    }
  }
  return null;
}

function fromRis(ris: string): string | null {
  // RIS line "TAG  - value". JF = full journal, JO/J2 = journal name, T2 =
  // secondary title (journal for articles, book/proceedings for chapters).
  for (const tag of ['JF', 'JO', 'J2', 'T2']) {
    const m = new RegExp(`^${tag}[^\\S\\n]*-[^\\S\\n]*(.+)$`, 'm').exec(ris);
    if (m) {
      const v = cleanVenue(m[1]);
      if (isPlausibleVenue(v)) return v;
    }
  }
  return null;
}

function fromEndnote(endnote: string): string | null {
  // EndNote line "%X value". %J = journal/periodical, %B = secondary title.
  for (const tag of ['J', 'B']) {
    const m = new RegExp(`^%${tag}[^\\S\\n]+(.+)$`, 'm').exec(endnote);
    if (m) {
      const v = cleanVenue(m[1]);
      if (isPlausibleVenue(v)) return v;
    }
  }
  return null;
}

/**
 * Extract the publication venue from whichever citation export carries it.
 * BibTeX first (most structured), then RIS, then EndNote. Returns null when
 * no format yields a plausible venue.
 */
export function extractVenue(input: VenueInput): VenueResult | null {
  if (input.bibtex) {
    const v = fromBibtex(input.bibtex);
    if (v) return { venue: v, source: 'bibtex' };
  }
  if (input.ris) {
    const v = fromRis(input.ris);
    if (v) return { venue: v, source: 'ris' };
  }
  if (input.endnote) {
    const v = fromEndnote(input.endnote);
    if (v) return { venue: v, source: 'endnote' };
  }
  return null;
}
