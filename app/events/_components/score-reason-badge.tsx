'use client';

import { ScoreBadge } from '@/components/score-bar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

/** The list's Relevanz badge with the model's short justification on hover /
 *  focus, so the editor can judge an event at scan-time without opening the
 *  detail page. `reasoning` (2-3 sentences) rides in the slim list projection
 *  for exactly this; when it's absent (older rows) the bare badge renders. The
 *  trigger is a focusable button so the tooltip is keyboard-reachable; it has no
 *  aria-label of its own, so the badge's "Relevanz-Score: N%" stays the
 *  accessible name and Radix wires the reasoning as the description. */
export function ScoreReasonBadge({
  score,
  reasoning,
}: {
  score: number;
  reasoning: string | null;
}) {
  const badge = <ScoreBadge score={score} ariaLabel="Relevanz-Score" />;
  if (!reasoning) return badge;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help rounded-full align-middle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none"
        >
          {badge}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        className="max-w-xs whitespace-normal text-left leading-relaxed"
      >
        {reasoning}
      </TooltipContent>
    </Tooltip>
  );
}
