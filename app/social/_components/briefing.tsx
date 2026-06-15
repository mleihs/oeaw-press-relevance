import { Sparkles } from 'lucide-react';
import { InfoBubble } from '@/components/info-bubble';

/** The LLM-generated narrative summary — the "5-second" takeaway, directly
 *  under the KPI strip. */
export function Briefing({ narrative }: { narrative: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-brand/20 bg-gradient-to-br from-brand/[0.06] to-transparent p-4">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
      <div className="space-y-1">
        <p className="flex items-center gap-1 text-sm font-medium text-foreground">
          Lagebild
          <InfoBubble id="social_briefing" />
        </p>
        <p className="text-sm leading-relaxed text-foreground/90">{narrative}</p>
      </div>
    </div>
  );
}
