import { Check, Pause, X as XIcon, type LucideIcon } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { getDecisionLabel } from '@/components/decision-badge';

export interface CalendarSummary {
  total: number;
  /** Analyzed events with a high-band score (≥ 0.7). */
  high: number;
  /** Events not yet analyzed. */
  unscored: number;
  /** Still undecided (triage open). */
  undecided: number;
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-3 w-3 shrink-0 rounded-sm', className)} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function IconItem({ Icon, className, label }: { Icon: LucideIcon; className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className={cn('h-3 w-3 shrink-0', className)} aria-hidden />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

/** Learnable colour key + at-a-glance window summary, so the press desk can read
 *  the calendar's two signals (fill = relevance band, left border = decision)
 *  and immediately see how many events / how many are high-relevance / unscored
 *  in the visible window. Pure server render. */
export function CalendarLegend({ summary }: { summary: CalendarSummary }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card/50 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="font-medium text-foreground/70">Relevanz:</span>
        <Swatch className="bg-brand" label="Hoch ≥70%" />
        <Swatch className="bg-amber-500" label="Mittel" />
        <Swatch className="bg-orange-500" label="Niedrig" />
        <Swatch className="bg-muted-foreground/40" label="Unbewertet" />
        <span className="ml-1 font-medium text-foreground/70">Status:</span>
        <IconItem Icon={Check} className="text-success dark:text-emerald-400" label={getDecisionLabel('pitch', 'events')} />
        <IconItem Icon={Pause} className="text-info dark:text-brand-300" label={getDecisionLabel('hold', 'events')} />
        <IconItem Icon={XIcon} className="text-muted-foreground" label={getDecisionLabel('skip', 'events')} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap tabular-nums">
        <span className="font-semibold text-foreground">{summary.total} Events</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-brand">{summary.high} hochrelevant</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{summary.unscored} unbewertet</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{summary.undecided} offen</span>
      </div>
    </div>
  );
}
