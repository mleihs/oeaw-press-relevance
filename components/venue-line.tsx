'use client';

import { useRouter } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { InfoBubble } from '@/components/info-bubble';
import { cn } from '@/lib/shared/utils';

/**
 * Venue (journal / book / proceedings / magazine) as a conditional, italic,
 * label-free line in the citation block — the Google Scholar / PubMed pattern.
 * Renders nothing when there is no venue, so the records without one (over
 * half the corpus) add no empty-row noise. `enriched_journal` holds a venue,
 * not strictly a journal — the publication-type badge says what kind it is.
 *
 * Clickable: filters the Publications list to this venue. Rendered as a
 * <button> doing programmatic navigation (not a <Link>) because VenueLine sits
 * inside the mobile card's outer <Link> — a nested anchor is invalid HTML.
 * preventDefault cancels that card link; stopPropagation cancels the desktop
 * row's expand toggle. Mirrors the in-card MeisterTask / press-release buttons.
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
  const router = useRouter();
  const venue = journal?.trim();
  if (!venue) return null;
  return (
    <p
      className={cn(
        'mt-0.5 flex items-center gap-1 text-xs italic text-muted-foreground',
        className,
      )}
    >
      <button
        type="button"
        title={venue}
        aria-label={`Publikationen aus ${venue} anzeigen`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(`/publications?journal=${encodeURIComponent(venue)}`);
        }}
        className="group flex min-w-0 items-center gap-1 text-left hover:text-brand transition-colors"
      >
        <BookOpen aria-hidden className="h-3 w-3 shrink-0 opacity-70" />
        <span className="min-w-0 truncate group-hover:underline">{venue}</span>
      </button>
      <InfoBubble id="venue" size="sm" />
    </p>
  );
}
