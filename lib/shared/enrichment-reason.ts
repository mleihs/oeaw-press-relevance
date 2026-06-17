/**
 * The SPECIFIC, per-row reason a publication couldn't be enriched / scored — the
 * part the generic status / `score_na_*` explanation cannot give. The bubble
 * leads with this line, then shows the generic EXPL body as context, so EXPL
 * stays the single home for the generic copy (no duplication).
 *
 * No reason is stored — enrichment writes only the status (see
 * lib/server/enrichment/batch.ts) — so it is derived from the row. The text is
 * woven from the row's own DOI, publication type and publication date, which
 * makes it read individually per entry:
 *
 *   - failed, future-dated      → the pub isn't published yet; with a DOI this is
 *     the classic "in press" / Pre-Publication-Window (DOI minted, not yet
 *     indexed by the sources).
 *   - failed, has DOI, book DOI → CrossRef/OpenAlex rarely expose an abstract for
 *     book / edited-volume DOIs (ISBN-13 embedded in the suffix).
 *   - failed, has DOI           → a source was queried but none returned an
 *     abstract (closed access / abstract not served by the free APIs).
 *   - failed, no DOI, DOI-bearing type (journal article / indexed proceedings) →
 *     a DOI usually exists and could be back-filled; enrichment is DOI-driven, so
 *     without one nothing could be queried. Empirically ~97% of failed pubs have
 *     no DOI.
 *   - failed, no DOI, other type (chapter, newspaper/magazine, report, review,
 *     thesis, …) → such outputs are usually not indexed in CrossRef/OpenAlex at
 *     all, so there is nothing to fetch.
 *   - partial → a source returned metadata (journal/date) but no abstract.
 *
 * Returns null when there is nothing row-specific to add (enriched / pending /
 * analyzed) — the caller then falls back to the plain generic explanation.
 *
 * `now` is injected (not read from the clock) so the function stays pure and the
 * future-date branch is testable; the client component passes `new Date()`.
 */

const MONTHS_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

/** 'YYYY-MM-DD' → 'Monat JJJJ' (timezone-free; falls back to the year, then the
 *  raw string). Built from a fixed month table rather than Intl/Date so the same
 *  label renders on the server and on the client (no hydration drift). */
function monthYearLabel(isoDate: string): string {
  const [year, month] = isoDate.split('-');
  const name = MONTHS_DE[Number(month) - 1];
  return name ? `${name} ${year}` : (year || isoDate);
}

/** A DOI whose suffix carries an ISBN-13 (978…/979…) points at a book / edited
 *  volume rather than an article — those rarely expose an abstract via the APIs.
 *  e.g. 10.3828/9781805966791 (Liverpool University Press). */
function looksLikeBookDoi(doi: string): boolean {
  return /\/(?:978|979)\d{9,}/.test(doi);
}

/** Publication types that normally DO carry a DOI (journal articles, indexed
 *  conference proceedings) — so a missing DOI here is a fixable data gap, not the
 *  nature of the output. Everything else (chapters, newspaper/magazine pieces,
 *  reports, reviews, theses, software, …) is usually not in CrossRef/OpenAlex. */
function isDoiBearingType(typeLabel: string): boolean {
  return /fachzeitschrift|zeitschriftenartikel|proceeding|konferenz/i.test(typeLabel);
}

/** Capitalise the first letter so a type label reads correctly at the start of a
 *  sentence. Most WebDB type names are already capitalised nouns; the lone
 *  exception ("aufwändige Multimedia-Publikation") would otherwise open the
 *  sentence in lower case. */
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function enrichmentReason(
  pub: {
    enrichment_status: string | null;
    doi: string | null;
    /** Resolved type label — callers pass the publication_type string or, when
     *  that is empty (it is for every failed pub), the lookup's name_de. */
    publication_type?: string | null;
    /** ISO 'YYYY-MM-DD'. */
    published_at?: string | null;
  },
  now: Date,
): string | null {
  if (pub.enrichment_status === 'partial') {
    return 'Eine Quelle lieferte Metadaten (z. B. Journal oder Erscheinungsdatum), aber keinen Abstract. Für eine inhaltliche Bewertung fehlt damit die Substanz.';
  }

  if (pub.enrichment_status !== 'failed') return null;

  const doi = pub.doi?.trim() || '';
  const hasDoi = doi.length > 0;
  const typeLabel = pub.publication_type?.trim() || '';
  const publishedAt = pub.published_at?.trim() || '';
  const isFuture =
    publishedAt !== '' && publishedAt > now.toISOString().slice(0, 10);

  if (hasDoi) {
    if (isFuture) {
      return `Die DOI ${doi} ist bereits vergeben, aber das Erscheinungsdatum (${monthYearLabel(publishedAt)}) liegt noch in der Zukunft. Die Quellen haben den Eintrag daher noch nicht indexiert (Pre-Publication-Window); ein erneuter Anreicherungs-Lauf nach Erscheinen sollte den Abstract bringen.`;
    }
    if (looksLikeBookDoi(doi)) {
      return `Die DOI ${doi} verweist auf ein Buch bzw. einen Sammelband. Dafür liefern CrossRef/OpenAlex in der Regel keinen Abstract.`;
    }
    return `Die DOI ${doi} ist hinterlegt, aber keine Quelle (CrossRef, OpenAlex, Unpaywall, Semantic Scholar) lieferte einen Abstract. Typischerweise Closed-Access, oder der Abstract wird nicht über die freien APIs ausgeliefert.`;
  }

  // No DOI — the ~97% case. Enrichment is DOI-driven, so nothing could be queried.
  if (isFuture) {
    return `Erscheint erst ${monthYearLabel(publishedAt)} und hat noch keine DOI. Vor dem Erscheinen können die DOI-basierten Quellen nichts liefern.`;
  }
  if (typeLabel) {
    return isDoiBearingType(typeLabel)
      ? `${capitalizeFirst(typeLabel)} ohne hinterlegte DOI. Für diesen Typ existiert meist eine DOI, die nachgetragen werden könnte; ohne sie ließ sich keine der DOI-basierten Quellen abfragen.`
      : `${capitalizeFirst(typeLabel)} ohne DOI. Solche Beiträge sind in CrossRef/OpenAlex meist gar nicht erfasst, daher lieferte keine Quelle Daten.`;
  }
  return 'Keine DOI hinterlegt. Ohne DOI ließ sich keine der Quellen (CrossRef, OpenAlex, Unpaywall, Semantic Scholar) abfragen.';
}
