'use client';

import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Decision } from '@/lib/shared/types';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { QK } from '@/lib/client/query-keys';
import {
  DECISION_VARIANTS,
  getDecisionLabel,
} from '@/components/decision-badge';
import { InfoBubble } from '@/components/info-bubble';
import { Button } from '@/components/ui/button';
import type { EXPL } from '@/lib/client/explanations';

const INFO_BUBBLE_BY_DECISION: Record<
  'pitch' | 'hold' | 'skip',
  keyof typeof EXPL
> = {
  pitch: 'event_decision_pitch',
  hold: 'event_decision_hold',
  skip: 'event_decision_skip',
};

interface Props {
  eventId: string;
  current: Decision;
}

/** Compact decision toolbar for events. Lighter than
 *  components/decision-toolbar.tsx (publications) — no snooze, no rationale,
 *  no MeisterTask push, no session linkage. The popover-host (EntityFlag)
 *  triggers router.refresh() on its own mutation; we only need to refresh
 *  here because the decision mutation is fired independently of the flag
 *  save/delete. */
export function EventDecisionButtons({ eventId, current }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (decision: Decision) => {
      const r = await fetch(`/api/events/${eventId}/decision`, {
        method: 'PATCH',
        headers: getApiHeaders(),
        body: JSON.stringify({ decision }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body as { decision: Decision };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: QK.events });
      queryClient.invalidateQueries({ queryKey: QK.event(eventId) });
      router.refresh();
      toast.success(
        data.decision === 'undecided'
          ? 'Entscheidung zurückgesetzt'
          : `Status gesetzt: ${getDecisionLabel(data.decision)}`,
      );
    },
    onError: (err: Error) =>
      toast.error(`Status konnte nicht gesetzt werden: ${err.message}`),
  });

  return (
    <div className="border-t pt-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-2">
        Status
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['pitch', 'hold', 'skip'] as const).map((d) => {
          const v = DECISION_VARIANTS[d];
          const Icon = v.Icon;
          const isActive = current === d;
          const isLoading = mutation.isPending && mutation.variables === d;
          return (
            <span key={d} className="inline-flex items-center gap-0.5">
              <Button
                type="button"
                size="sm"
                variant={isActive ? 'default' : 'outline'}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(d)}
                className={`h-7 px-2 text-xs ${
                  isActive ? v.largeButton.active : v.largeButton.idle
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Icon className="h-3 w-3 mr-1" />
                )}
                {v.label}
              </Button>
              <InfoBubble id={INFO_BUBBLE_BY_DECISION[d]} size="sm" />
            </span>
          );
        })}
        {current !== 'undecided' && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate('undecided')}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
