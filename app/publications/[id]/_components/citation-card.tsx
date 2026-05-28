import Link from 'next/link';
import { Fragment } from 'react';
import type { ParsedCitation, PublicationWithRelations } from '@/lib/shared/types';
import { cn } from '@/lib/shared/utils';
import { matchAuthorByName } from '@/lib/shared/publication-display';
import { SectionLabel } from '@/components/section-label';

type AuthorResolved = NonNullable<PublicationWithRelations['authors_resolved']>[number];

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
          {parsed.trailer && <span>, {parsed.trailer}</span>}
        </p>
      )}
      {!parsed.venue && parsed.trailer && (
        <p className="mt-1 text-xs text-muted-foreground">{parsed.trailer}</p>
      )}
    </div>
  );
}
