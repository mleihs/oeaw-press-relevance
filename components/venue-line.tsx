import { BookOpen } from 'lucide-react';
import { cn } from '@/lib/shared/utils';

/**
 * Venue (journal / book / proceedings / magazine) as a conditional, italic,
 * label-free line in the citation block — the Google Scholar / PubMed pattern.
 * Renders nothing when there is no venue, so the records without one (over
 * half the corpus) add no empty-row noise. `enriched_journal` holds a venue,
 * not strictly a journal — the publication-type badge says what kind it is.
 *
 * One line, truncated; the full venue is on the native `title` tooltip. The
 * BookOpen leading glyph sets the line apart from the pitch / haiku below it.
 */
export function VenueLine({
  journal,
  className,
}: {
  journal: string | null | undefined;
  className?: string;
}) {
  const venue = journal?.trim();
  if (!venue) return null;
  return (
    <p
      title={venue}
      className={cn(
        'mt-0.5 flex items-center gap-1 text-xs italic text-muted-foreground',
        className,
      )}
    >
      <BookOpen aria-hidden className="h-3 w-3 shrink-0 opacity-70" />
      <span className="min-w-0 truncate">{venue}</span>
    </p>
  );
}
