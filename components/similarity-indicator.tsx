'use client';

import { Sparkles } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PRESS_SIMILARITY_BAND_HIGH, PRESS_SIMILARITY_BAND_MID } from '@/lib/shared/constants';

interface SimilarityIndicatorProps {
  /** SPECTER2 cosine similarity to press-cluster k-NN (0..1). */
  similarity: number | null | undefined;
}

/** Three-band label for the cosine similarity (badge-friendly). */
function band(sim: number): { label: string; classes: string } {
  if (sim >= PRESS_SIMILARITY_BAND_HIGH)
    return {
      label: 'sehr hoch',
      classes:
        'bg-purple-100 text-purple-800 ring-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:ring-purple-500/30',
    };
  if (sim >= PRESS_SIMILARITY_BAND_MID)
    return {
      label: 'hoch',
      classes:
        'bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30',
    };
  return {
    label: 'mittel',
    classes:
      'bg-muted text-muted-foreground ring-border',
  };
}

/**
 * Compact press-similarity indicator: Sparkles icon + percentage in a coloured pill.
 * Visualises how close a publication's SPECTER2-embedding sits to the centroid
 * of all already-pressed publications (k-NN avg over top-5).
 */
export function SimilarityIndicator({ similarity }: SimilarityIndicatorProps) {
  if (similarity === null || similarity === undefined) return null;
  const pct = Math.round(similarity * 100);
  const b = band(similarity);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-semibold ring-1 ring-inset tabular-nums',
            b.classes,
          )}
          aria-label={`Press-Similarity: ${pct}% (${b.label})`}
        >
          <Sparkles className="h-2.5 w-2.5" />
          {pct}%
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p className="font-medium">Press-Similarity {pct}% ({b.label})</p>
        <p className="text-muted-foreground mt-1">
          Wie ähnlich ist diese Publikation den schon gepressten Pubs der ÖAW?
          Cosine-Similarity über SPECTER2-Embeddings (k-NN avg, Top-5).
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
