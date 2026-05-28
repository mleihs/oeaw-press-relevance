'use client';

import { InfoBubble } from '@/components/info-bubble';
import { EXPL } from '@/lib/client/explanations';
import { SOURCE_LABELS, SOURCE_BADGE_CLASSES as SOURCE_COLORS } from '@/lib/shared/constants';
import { cn } from '@/lib/shared/utils';

/**
 * Single enrichment-source pill: coloured label (`CrossRef`, `OpenAlex`, …)
 * plus an inline InfoBubble linking to the source-specific EXPL entry.
 * Used on the publication detail page's "Externe Anreicherung → Quellen"
 * block and inside the publications-table expanded-row Enrichment-Quellen
 * section.
 *
 * The pill is a flex container with `gap-1` so the InfoBubble icon never
 * glues to the label. Previously both call sites duplicated the pill HTML
 * inline; one forgot the gap → InfoBubble visually clamped onto the label.
 * Single component eliminates that drift class.
 *
 * Compact-variant badges (the short SOURCE_SHORT tags in the publication-
 * table row meta-strip) intentionally stay local in publication-table.tsx
 * — they have a different visual contract (no InfoBubble, tighter padding)
 * and a different audience (overview, not detail).
 */
export function EnrichmentSourceBadge({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const explId = `source_${source}` as keyof typeof EXPL;
  const hasExpl = explId in EXPL;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium',
        SOURCE_COLORS[source] || 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {SOURCE_LABELS[source] || source}
      {hasExpl && <InfoBubble id={explId} size="sm" />}
    </span>
  );
}
