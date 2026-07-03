import { Sparkles } from '@/lib/icons';
import { journalTier } from '@/lib/shared/journal-tier';
import { cn } from '@/lib/shared/utils';

/**
 * Compact flag for flagship general-science journals (Nature family + Science),
 * classified by the shared journalTier() — single source of truth with VenueLine.
 * Renders nothing for any other venue, so it can be dropped into a row
 * unconditionally. Complements VenueLine's brand-blue pulse: the badge is the
 * scannable flag in a dense Top-Pubs row, the venue line carries the title.
 */
export function FlagshipBadge({
  journal,
  className,
}: {
  journal: string | null | undefined;
  className?: string;
}) {
  if (journalTier(journal) !== 'top') return null;
  return (
    <span
      title="Flaggschiff-Journal (Nature-Familie oder Science)"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded bg-brand/10 px-1.5 py-0 text-[10px] font-semibold text-brand',
        className,
      )}
    >
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      Flagship
    </span>
  );
}
