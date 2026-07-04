'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Check, X, RotateCcw, Kanban, Zap } from '@/lib/icons';
import { toast } from 'sonner';
import type { Decision } from '@/lib/shared/types';
import { getApiHeaders } from '@/lib/client/stores/settings-store';
import { QK } from '@/lib/client/query-keys';
import { getDecisionLabel } from '@/components/decision-badge';

interface Props {
  eventId: string;
  current: Decision;
  /** Deep-Link zur Board-Karte, falls das (gepitchte) Event eine hat. */
  boardCardHref?: string;
}

/** Geteilte Decision-Mutation der Zeilen-Aktionen (Desktop-Tabelle) und der
 *  Mobile-Agenda-Aktionen — ein Endpoint, ein Invalidation-/Toast-Verhalten. */
function useDecisionMutation(eventId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
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
}

/**
 * Inline Pitchen/Verwerfen-Aktionen pro Zeile gemäß Toolkit-Redesign-Comp
 * (Z. 286–298). Ersetzt in der Zeile den Popover-Weg für die zwei häufigsten
 * Entscheidungen (dieselbe `/api/events/:id/decision`-Mutation wie
 * <EventDecisionButtons>). Entschiedene Events zeigen einen Status-Pill +
 * Zurücksetzen. Hold/undecided über den Flag-Popover bleiben unberührt.
 */
export function EventRowActions({ eventId, current, boardCardHref }: Props) {
  const mutation = useDecisionMutation(eventId);

  const busy = mutation.isPending;
  const spin = <Loader2 className="h-3.5 w-3.5 animate-spin" />;

  if (current === 'undecided') {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => mutation.mutate('pitch')}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {busy && mutation.variables === 'pitch' ? spin : <Check className="h-3.5 w-3.5" />}
          Pitchen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => mutation.mutate('skip')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-ink-subtle transition hover:bg-canvas disabled:opacity-60"
        >
          {busy && mutation.variables === 'skip' ? spin : <X className="h-3.5 w-3.5" />}
          Verwerfen
        </button>
      </div>
    );
  }

  // Entschieden: Status-Pill + Zurücksetzen (Reopen).
  const pill =
    current === 'pitch'
      ? { label: 'Übernommen', cls: 'bg-success-tint text-success' }
      : current === 'hold'
        ? { label: 'Warten', cls: 'bg-warning-tint text-warning-ink' }
        : { label: 'Verworfen', cls: 'bg-fill text-ink-muted' };

  return (
    <div className="flex items-center justify-end gap-1.5">
      {current === 'pitch' && boardCardHref ? (
        // Gepitcht + hat Board-Karte → Deep-Link statt „Übernommen"-Pill
        // (Comp Z. 292). Ohne Karte bleibt es beim Status-Pill.
        <Link
          href={boardCardHref}
          className="inline-flex items-center gap-1.5 rounded-lg bg-success-tint px-3 py-2 text-xs font-semibold text-success transition hover:brightness-95"
        >
          <Kanban className="h-3.5 w-3.5" />
          Im Board · Karte öffnen
        </Link>
      ) : (
        <span
          className={`inline-flex items-center rounded-lg px-3 py-2 text-xs font-semibold ${pill.cls}`}
        >
          {pill.label}
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => mutation.mutate('undecided')}
        title="Zurücksetzen"
        aria-label="Entscheidung zurücksetzen"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:bg-canvas disabled:opacity-60"
      >
        {busy && mutation.variables === 'undecided' ? spin : <RotateCcw className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

/**
 * Full-width-Aktionsreihe der Mobile-Agenda (M5, Mock Board-Mobile Z. 464–477):
 * Pitchen (flex-1, brand) / Verwerfen unter dem Titel; entschieden → Status
 * flex-1 („Im Board"-Deep-Link bei gepitcht+Karte, sonst Pill) + „Zurück".
 * Dieselbe Mutation wie die Desktop-Zeile.
 */
export function EventAgendaActions({ eventId, current, boardCardHref }: Props) {
  const mutation = useDecisionMutation(eventId);

  const busy = mutation.isPending;
  const spin = <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  const backBtn =
    'inline-flex items-center justify-center rounded-[9px] border border-line-strong bg-surface px-3.5 py-[9px] text-[12.5px] font-semibold text-ink-subtle transition active:bg-canvas disabled:opacity-60';

  if (current === 'undecided') {
    return (
      <div className="mt-[11px] flex items-center gap-[7px]">
        <button
          type="button"
          disabled={busy}
          onClick={() => mutation.mutate('pitch')}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-brand py-[9px] text-[12.5px] font-semibold text-white transition active:brightness-110 disabled:opacity-60"
        >
          {busy && mutation.variables === 'pitch' ? spin : <Zap weight="bold" className="h-3.5 w-3.5" />}
          Pitchen
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => mutation.mutate('skip')}
          className={backBtn}
        >
          {busy && mutation.variables === 'skip' ? spin : null}
          Verwerfen
        </button>
      </div>
    );
  }

  const pill =
    current === 'pitch'
      ? { label: 'Übernommen', cls: 'bg-success-tint text-success' }
      : current === 'hold'
        ? { label: 'Warten', cls: 'bg-warning-tint text-warning-ink' }
        : { label: 'Verworfen', cls: 'bg-fill text-ink-muted' };

  return (
    <div className="mt-[11px] flex items-center gap-[7px]">
      {current === 'pitch' && boardCardHref ? (
        <Link
          href={boardCardHref}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[9px] bg-success-tint py-[9px] text-[12.5px] font-semibold text-success transition active:brightness-95"
        >
          <Kanban weight="bold" className="h-3.5 w-3.5" />
          Im Board
        </Link>
      ) : (
        <span
          className={`inline-flex flex-1 items-center justify-center rounded-[9px] py-[9px] text-[12.5px] font-semibold ${pill.cls}`}
        >
          {pill.label}
        </span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => mutation.mutate('undecided')}
        className={backBtn}
      >
        {busy && mutation.variables === 'undecided' ? spin : null}
        Zurück
      </button>
    </div>
  );
}
