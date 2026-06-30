// Pure title-matching helpers for the no-DOI external-recovery script
// (scripts/match-external-by-title.mjs). Kept here — not lib/server/*.ts — so
// the node-run .mjs script imports them directly, the same seam as
// scripts/lib/doi-extract.mjs. No I/O. Unit-tested in title-match.test.mjs.

/**
 * Canonical title key for exact-match comparison: strip HTML entities + tags,
 * fold diacritics (NFKD + combining-mark removal), lowercase, collapse every
 * run of non-alphanumerics to a single space, trim. Two titles "match exactly"
 * iff their normTitle values are equal.
 */
export function normTitle(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&[a-z]+;/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Front-matter / generic titles that would exact-match meaninglessly
// ("Introduction" === "Introduction"). Every entry is a single token, so the
// blocklist only ever fires for one-word titles — the >=3-word floor in
// isMatchableTitle already rejects those, making the set belt-and-braces to
// that floor. Kept verbatim from the script (faithful, redundancy and all).
const GENERIC_TITLES = new Set([
  'introduction', 'einleitung', 'einfuhrung', 'vorwort', 'vorbemerkung',
  'preface', 'foreword', 'editorial', 'geleitwort', 'nachwort', 'nachruf',
  'obituary', 'conclusion', 'schluss', 'schlusswort', 'inhalt', 'contents',
  'abstract', 'review', 'rezension', 'buchbesprechung', 'vorschau', 'impressum',
]);

/**
 * Whether a normalized title is specific enough to risk an exact-title match:
 * >=3 words AND not on the generic front-matter blocklist. Guards against
 * false positives where a generic short title matches a wholly unrelated work.
 */
export function isMatchableTitle(normalized) {
  const words = normalized.split(' ').filter(Boolean);
  return words.length >= 3 && !GENERIC_TITLES.has(normalized);
}

/** Strip XML/JATS tags + collapse whitespace (CrossRef abstracts are JATS). */
export function stripJats(s) {
  return (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** Reconstruct plain text from an OpenAlex `abstract_inverted_index`
 *  (`{ word: [positions] }`). Returns '' for a missing/invalid index. */
export function openalexAbstract(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const words = [];
  for (const [w, ps] of Object.entries(inv)) for (const p of ps) words[p] = w;
  return words.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pick the best exact-title match from `candidates` for a publication whose
 * normalized title is `normPubTitle` and (optional) year is `pubYear`:
 *   - keep only candidates whose normalized title EQUALS normPubTitle;
 *   - corroborate by year (±1) when BOTH the pub year and candidate year are
 *     known — a candidate with an unknown year is NOT rejected;
 *   - among survivors prefer the longest abstract, then one carrying a DOI.
 * Returns the winning candidate, or null when none match. Each candidate is
 * `{ title, year, abstract, doi, ... }` (abstract is a string, '' if none).
 */
export function pickExactTitleMatch(candidates, normPubTitle, pubYear) {
  const exact = candidates
    .filter((c) => c.title && normTitle(c.title) === normPubTitle)
    .filter((c) => !(pubYear && c.year) || Math.abs(c.year - pubYear) <= 1);
  if (exact.length === 0) return null;
  exact.sort(
    (a, b) =>
      b.abstract.length - a.abstract.length ||
      (b.doi ? 1 : 0) - (a.doi ? 1 : 0),
  );
  return exact[0];
}
