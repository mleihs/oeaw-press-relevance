import { Sparkles } from 'lucide-react';

/** The LLM-generated narrative summary — the "5-second" takeaway, directly
 *  under the KPI strip. */
export function Briefing({ narrative }: { narrative: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-brand/20 bg-gradient-to-br from-brand/[0.06] to-transparent p-4">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Lagebild</p>
        <p className="text-sm leading-relaxed text-foreground/90">{narrative}</p>
      </div>
    </div>
  );
}
