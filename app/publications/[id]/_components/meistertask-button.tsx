'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { PRESS_SCORE_PUSH_THRESHOLD } from '@/lib/meistertask/constants';
import type { Publication } from '@/lib/types';

type State =
  | { kind: 'idle' }
  | { kind: 'pushing' }
  | { kind: 'pushed'; taskId: string; taskUrl: string };

interface Props {
  pub: Pick<Publication, 'id' | 'press_score' | 'meistertask_task_id' | 'meistertask_task_token'>;
}

export function MeistertaskButton({ pub }: Props) {
  // Initial state derives from server-data: if there's already a task_id,
  // the button starts in `pushed`. Otherwise idle.
  const [state, setState] = useState<State>(() =>
    pub.meistertask_task_id && pub.meistertask_task_token
      ? {
          kind: 'pushed',
          taskId: pub.meistertask_task_id,
          taskUrl: `https://www.meistertask.com/app/task/${pub.meistertask_task_token}`,
        }
      : { kind: 'idle' },
  );

  const score = pub.press_score ?? 0;
  const belowThreshold = pub.press_score === null || score < PRESS_SCORE_PUSH_THRESHOLD;

  // Disabled state: rendered only when idle (already-pushed wins precedence).
  if (state.kind === 'idle' && belowThreshold) {
    const tooltip =
      pub.press_score === null
        ? 'Pub noch nicht analysiert (kein Score)'
        : `Score ${Math.round(score * 100)}% — Schwellwert ${Math.round(PRESS_SCORE_PUSH_THRESHOLD * 100)}%`;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            {/* span wrapper because disabled buttons swallow pointer events */}
            <Button variant="outline" size="sm" disabled className="gap-1.5">
              <Send className="h-3.5 w-3.5" />
              An MeisterTask senden
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{tooltip}</TooltipContent>
      </Tooltip>
    );
  }

  if (state.kind === 'pushed') {
    return (
      <Button
        asChild
        variant="outline"
        size="sm"
        className="gap-1.5 text-[#0047bb] border-[#0047bb]/30 hover:bg-[#0047bb]/[0.04]"
      >
        <a href={state.taskUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-3.5 w-3.5" />
          In MeisterTask geöffnet
        </a>
      </Button>
    );
  }

  if (state.kind === 'pushing') {
    return (
      <Button size="sm" disabled className="gap-1.5">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        wird gesendet…
      </Button>
    );
  }

  // idle + above threshold
  const onClick = async () => {
    setState({ kind: 'pushing' });
    try {
      const res = await fetch('/api/meistertask/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publication_id: pub.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? `HTTP ${res.status}`;
        toast.error(`Push fehlgeschlagen: ${msg}`);
        setState({ kind: 'idle' });
        return;
      }
      // success or already_pushed — both yield task_id + task_url
      const taskId = String(data.task_id);
      const taskUrl = data.task_url ?? `https://www.meistertask.com/app/task/${taskId}`;
      const msg =
        data.status === 'already_pushed'
          ? 'Bereits in MeisterTask vorhanden'
          : 'An MeisterTask gesendet';
      toast.success(msg);
      setState({ kind: 'pushed', taskId, taskUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Netzwerkfehler';
      toast.error(`Push fehlgeschlagen: ${msg}`);
      setState({ kind: 'idle' });
    }
  };

  return (
    <Button size="sm" onClick={onClick} className="gap-1.5">
      <Send className="h-3.5 w-3.5" />
      An MeisterTask senden
    </Button>
  );
}
