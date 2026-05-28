import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import type {
  ParsedCitation,
  ParsedCitationTrailerPerson,
  PublicationWithRelations,
} from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import { matchAuthorByName } from '@/lib/shared/publication-display';
import { SectionLabel } from '@/components/section-label';

type AuthorResolved = NonNullable<PublicationWithRelations['authors_resolved']>[number];

/**
 * Splits a trailer string into a mix of plain-text chunks and `<Link>`
 * elements, with each occurrence of a `trailer_persons` name replaced by
 * a link to that person's detail page. Longer names take priority when
 * matches overlap (so "Anna Klein-Müller" beats "Anna Klein") and matches
 * are returned in original-source order.
 *
 * `external=false` persons (OEAW) get the brand-blue treatment to match
 * the author list above; externals stay neutral but still linkable so a
 * reviewer can navigate from the citation to the (existing) external
 * person page.
 */
function renderTrailerWithPersonLinks(
  trailer: string,
  persons: ParsedCitationTrailerPerson[],
): ReactNode[] {
  if (persons.length === 0) return [trailer];

  // Find every occurrence of every person's name. Longer names first so
  // overlapping shorter substrings don't pre-claim a position.
  type Match = { start: number; end: number; person: ParsedCitationTrailerPerson };
  const sorted = [...persons].sort((a, b) => b.name.length - a.name.length);
  const matches: Match[] = [];
  for (const person of sorted) {
    let cursor = 0;
    while (cursor < trailer.length) {
      const found = trailer.indexOf(person.name, cursor);
      if (found === -1) break;
      const end = found + person.name.length;
      const overlaps = matches.some((m) => found < m.end && end > m.start);
      if (!overlaps) matches.push({ start: found, end, person });
      cursor = end;
    }
  }

  if (matches.length === 0) return [trailer];

  // Walk matches in source order, emitting plain text between them and
  // a `<Link>` at each match position.
  matches.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) out.push(trailer.slice(cursor, m.start));
    out.push(
      <Link
        key={`tp-${m.start}-${m.person.person_id}`}
        href={`/persons/${m.person.person_id}`}
        className={
          m.person.external
            ? 'text-foreground hover:text-brand hover:underline'
            : 'text-brand hover:underline'
        }
      >
        {m.person.name}
      </Link>,
    );
    cursor = m.end;
  }
  if (cursor < trailer.length) out.push(trailer.slice(cursor));
  return out;
}

/**
 * Structured citation rendering for Pure-format input. Bold title, author
 * list with ÖAW authors linked in brand-blue + matched name-match
 * highlight, italicised journal/host-book, trailing bibliographic detail
 * in muted text.
 *
 * Falls back to a plain-text dump when the publication's citation didn't
 * match the Pure pattern — that branch is handled by the parent (see
 * detail-client.tsx) which passes `parsed_citation: null`.
 */
export function CitationCard({
  parsed,
  oeawAuthors,
  className,
}: {
  parsed: ParsedCitation;
  oeawAuthors: AuthorResolved[];
  className?: string;
}) {
  return (
    <div className={cn('text-xs leading-relaxed', className)}>
      <SectionLabel>Vollständige Autor:innen-Angabe (laut Zitation)</SectionLabel>
      <p className="mt-1 text-sm font-medium text-foreground leading-snug">
        {parsed.title}
      </p>
      {parsed.authors.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {parsed.authors.map((a, i) => {
            const matched = matchAuthorByName(a.name, oeawAuthors);
            const isLast = i === parsed.authors.length - 1;
            const sep = isLast ? '' : '; ';
            const display = (
              <>
                {a.name}
                {a.role && (
                  <span className="text-muted-foreground/70"> ({a.role})</span>
                )}
              </>
            );
            return (
              <Fragment key={`${a.name}-${i}`}>
                {matched ? (
                  <Link
                    href={`/persons/${matched.id}`}
                    className="text-brand hover:underline"
                  >
                    {display}
                  </Link>
                ) : (
                  <span>{display}</span>
                )}
                {sep}
              </Fragment>
            );
          })}
          {parsed.et_al && <span className="italic"> et al.</span>}
        </p>
      )}
      {parsed.venue && (
        <p className="mt-1 text-xs text-muted-foreground">
          {parsed.venue_kind === 'journal' ? 'in: ' : ''}
          <span className="italic text-foreground/80">{parsed.venue}</span>
          {parsed.trailer && (
            <span>
              , {renderTrailerWithPersonLinks(parsed.trailer, parsed.trailer_persons)}
            </span>
          )}
        </p>
      )}
      {!parsed.venue && parsed.trailer && (
        <p className="mt-1 text-xs text-muted-foreground">
          {renderTrailerWithPersonLinks(parsed.trailer, parsed.trailer_persons)}
        </p>
      )}
    </div>
  );
}
