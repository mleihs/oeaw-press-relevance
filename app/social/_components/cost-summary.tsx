import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import type { SocialCostSummary } from '@/lib/shared/types';
import { InfoBubble } from '@/components/info-bubble';

const usd = (n: number) => `$${n.toFixed(4)}`;

/** Compact accumulated-cost line for the /social header. Hidden until the
 *  first real refresh has run. */
export function CostSummary({ cost }: { cost: SocialCostSummary }) {
  if (cost.runs === 0) return null;
  const last = cost.last_run_at
    ? formatDistanceToNow(new Date(cost.last_run_at), { addSuffix: true, locale: de })
    : null;

  return (
    <p className="inline-flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <span>
        Bisherige Kosten ≈{' '}
        <span className="font-medium text-foreground">{usd(cost.total_usd)}</span>{' '}
        (Apify ≈ {usd(cost.apify_usd)} · LLM {usd(cost.llm_usd)}) ·{' '}
        {cost.runs} {cost.runs === 1 ? 'Aktualisierung' : 'Aktualisierungen'}
        {last && <> · zuletzt {last}</>}
      </span>
      <InfoBubble id="social_cost" />
    </p>
  );
}
