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
