import type { Publication } from './types';
import { decodeHtmlInline } from './html-utils';

type WithOrgunits = {
  orgunits?: Array<{ akronym_de: string | null; name_de: string }>;
};

/** Display the primary author. Falls back to 'Unbekannt' only when nothing is available. */
export function displayAuthor(pub: Pick<Publication, 'lead_author'>): string {
  return pub.lead_author?.trim() || 'Unbekannt';
}

/** Display the primary institute via the orgunits relation. Returns null when no orgunit is attached. */
export function displayInstitute(pub: WithOrgunits): string | null {
  const first = pub.orgunits?.[0];
  return first?.akronym_de?.trim() || first?.name_de?.trim() || null;
}

/**
 * Normalises an author name for fuzzy matching: lower-case + drop common
 * separators (whitespace, comma, dot, hyphen). Symmetric: applied to both
 * sides of the comparison.
 *
 * Pulled out so the lead-author meta-link, the citation-card linker, and
 * any future "is this name an OEAW author?" probe all use the same rule.
 * Drift between two normalisers would silently break linking on edge-case
 * names ("van der Berg" vs "Vanderberg"); one helper makes the contract
 * explicit.
 */
export function normalizeAuthorName(name: string): string {
  return name.toLowerCase().replace(/[\s,.\-]/g, '');
}

/** Minimal author shape needed for name matching. Both `firstname` and
 *  `lastname` are required because we match in both orderings. */
type AuthorNameSource = { firstname: string; lastname: string };

/**
 * Find the first OEAW author whose `Firstname Lastname` (or the reversed
 * order) matches the given name after normalisation. Returns null when no
 * match exists.
 *
 * The caller passes the full resolved-person row so the caller can keep
 * additional fields (id, orcid, …) for downstream rendering — this helper
 * only needs name fields and so its generic accepts any superset.
 */
export function matchAuthorByName<T extends AuthorNameSource>(
  name: string,
  candidates: readonly T[],
): T | null {
  const target = normalizeAuthorName(name);
  for (const c of candidates) {
    const a = normalizeAuthorName(`${c.lastname}${c.firstname}`);
    const b = normalizeAuthorName(`${c.firstname}${c.lastname}`);
    if (a === target || b === target) return c;
  }
  return null;
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
 *
 * HTML in either field (entities, sub/sup, Pure renderingHtml wrapper) is
 * normalised via `decodeHtmlInline` so the comparison and the output are
 * both plain text. Domain logic lives here; pure HTML mechanics live in
 * `html-utils.ts`.
 */
export function displayTitle(
  primary: string,
  citation: string | null | undefined,
): string {
  const decoded = decodeHtmlInline(primary);
  if (!citation) return decoded;

  const plain = decodeHtmlInline(citation);

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
