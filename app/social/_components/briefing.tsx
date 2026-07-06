import { Sparkles } from '@/lib/icons';
import { InfoBubble } from '@/components/info-bubble';

/** The LLM-generated narrative summary — the "5-second" takeaway, directly
 *  under the KPI strip. Mock: Gradient-Karte mit blauem Sparkle-Quadrat und
 *  „KI-Zusammenfassung"-Pill neben dem Titel. */
export function Briefing({ narrative }: { narrative: string }) {
  return (
    <div className="flex gap-3.5 rounded-xl border border-brand-200/70 bg-gradient-to-br from-brand-50 to-surface-muted p-4 sm:p-5 dark:border-brand-500/25 dark:from-brand-500/10 dark:to-transparent">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-brand-500 text-white shadow-[0_4px_12px_rgba(0,71,187,.28)]"
        aria-hidden
      >
        <Sparkles className="h-4 w-4" weight="fill" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-brand-700 dark:text-brand-300">
          Lagebild
          <span className="rounded-full bg-surface px-2 py-px font-mono text-[10px] font-medium text-brand-400 dark:bg-brand-500/15 dark:text-brand-300">
            KI-Zusammenfassung
          </span>
          <InfoBubble id="social_briefing" />
        </p>
        <p className="text-sm leading-relaxed text-foreground/90">{narrative}</p>
      </div>
    </div>
  );
}
