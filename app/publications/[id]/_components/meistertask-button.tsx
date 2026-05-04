'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, Send, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildTaskUrl } from '@/lib/meistertask/urls';
import type { Publication } from '@/lib/types';

type State =
  | { kind: 'idle' }
  | { kind: 'pushing' }
  | { kind: 'pushed'; taskId: string; taskUrl: string | null };

interface Props {
  pub: Pick<Publication, 'id' | 'press_score' | 'meistertask_task_id' | 'meistertask_task_token'>;
}

export function MeistertaskButton({ pub }: Props) {
  const [state, setState] = useState<State>(() =>
    pub.meistertask_task_id
      ? {
          kind: 'pushed',
          taskId: pub.meistertask_task_id,
          taskUrl: buildTaskUrl(pub.meistertask_task_token),
        }
      : { kind: 'idle' },
  );

  // Drop late setState if the user navigated away mid-fetch.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const safeSetState = (s: State) => {
    if (mountedRef.current) setState(s);
  };

  if (state.kind === 'pushed') {
    if (state.taskUrl) {
      return (
        <Button
          asChild
          variant="outline"
          size="sm"
          className="gap-1.5 text-brand border-brand/30 hover:bg-brand/[0.04]"
        >
          <a href={state.taskUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            In MeisterTask geöffnet
          </a>
        </Button>
      );
    }
    return (
      <Button variant="outline" size="sm" disabled className="gap-1.5">
        <Check className="h-3.5 w-3.5" />
        An MeisterTask gesendet
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

  const onClick = async () => {
    safeSetState({ kind: 'pushing' });
    try {
      const res = await fetch('/api/meistertask/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publication_id: pub.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(`Push fehlgeschlagen: ${data.error ?? `HTTP ${res.status}`}`);
        safeSetState({ kind: 'idle' });
        return;
      }
      const msg =
        data.status === 'already_pushed'
          ? 'Bereits in MeisterTask vorhanden'
          : 'An MeisterTask gesendet';
      toast.success(msg);
      safeSetState({
        kind: 'pushed',
        taskId: String(data.task_id),
        taskUrl: data.task_url || null,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Netzwerkfehler';
      toast.error(`Push fehlgeschlagen: ${msg}`);
      safeSetState({ kind: 'idle' });
    }
  };

  return (
    <Button size="sm" onClick={onClick} className="gap-1.5">
      <Send className="h-3.5 w-3.5" />
      An MeisterTask senden
    </Button>
  );
}
