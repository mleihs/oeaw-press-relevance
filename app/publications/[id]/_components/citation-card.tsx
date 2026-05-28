import Link from 'next/link';
import { Fragment } from 'react';
import type { ParsedCitation, PublicationWithRelations } from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import { SectionLabel } from '@/components/section-label';

type AuthorResolved = NonNullable<PublicationWithRelations['authors_resolved']>[number];

/** Normalise a name string for fuzzy matching against ÖAW persons.
 *  Lower-case, strip whitespace + common separators. Mirrors the
 *  leadAuthorPerson lookup in detail-client.tsx so a name appears as a
 *  link if and only if the same person already exists in
 *  person_publications. */
function normName(s: string): string {
  return s.toLowerCase().replace(/[\s,.\-]/g, '');
}

function matchAuthor(
  name: string,
  oeawAuthors: AuthorResolved[],
): AuthorResolved | null {
  const target = normName(name);
  for (const a of oeawAuthors) {
    if (
      normName(`${a.lastname}${a.firstname}`) === target ||
      normName(`${a.firstname}${a.lastname}`) === target
    ) {
      return a;
    }
  }
  return null;
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
            const matched = matchAuthor(a.name, oeawAuthors);
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
          {parsed.etAl && <span className="italic"> et al.</span>}
        </p>
      )}
      {parsed.venue && (
        <p className="mt-1 text-xs text-muted-foreground">
          {parsed.venueKind === 'journal' ? 'in: ' : ''}
          <span className="italic text-foreground/80">{parsed.venue}</span>
          {parsed.trailer && <span>, {parsed.trailer}</span>}
        </p>
      )}
      {!parsed.venue && parsed.trailer && (
        <p className="mt-1 text-xs text-muted-foreground">{parsed.trailer}</p>
      )}
    </div>
  );
}
