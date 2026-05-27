'use client';

import { useRouter } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { InfoBubble } from '@/components/info-bubble';
import { cn } from '@/lib/shared/utils';
import { canonicalName } from '@/lib/shared/venue-registry';
import { journalTier } from '@/lib/shared/journal-tier';

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
  // Resolve to the registry's canonical name when this venue is a known
  // outlet — collapses corpus spellings ("DerStandard.at" → "Der Standard")
  // so the displayed text and the filter URL match the detail page and the
  // facette. Unknown venues fall through to the raw string.
  const canonical = canonicalName(venue);
  // Flagship Nature/Science-family pubs get a non-italic, bold, brand-blue
  // line so the eye catches them in long lists (Dashboard top-pubs + the
  // /publications table both render via this one component).
  const isTop = journalTier(canonical) === 'top';
  return (
    <p
      className={cn(
        'mt-0.5 flex items-center gap-1 text-xs',
        isTop
          ? 'font-medium text-brand motion-safe:animate-pulse'
          : 'italic text-muted-foreground',
        className,
      )}
    >
      <button
        type="button"
        title={canonical}
        aria-label={`Publikationen aus ${canonical} anzeigen`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(`/publications?journal=${encodeURIComponent(canonical)}`);
        }}
        className={cn(
          'group flex min-w-0 items-center gap-1 text-left transition-colors',
          isTop ? 'hover:underline' : 'hover:text-brand',
        )}
      >
        <BookOpen
          aria-hidden
          className={cn('h-3 w-3 shrink-0', isTop ? '' : 'opacity-70')}
        />
        <span className="min-w-0 truncate group-hover:underline">{canonical}</span>
      </button>
      <InfoBubble id="venue" size="sm" />
    </p>
  );
}
