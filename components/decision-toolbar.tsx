'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Pause, X as XIcon, Loader2, CalendarIcon, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import type { Publication } from '@/lib/types';
import type { MeistertaskPushResult } from '@/lib/meistertask/push';
import { loadSettings, getApiHeaders } from '@/lib/settings-store';
import {
  loadCurrentSessionId,
  saveCurrentSessionId,
} from '@/lib/session-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type Decision = 'undecided' | 'pitch' | 'hold' | 'skip';

interface DecisionToolbarProps {
  pub: Pick<Publication, 'id' | 'decision' | 'snooze_until' | 'decision_rationale'>;
  /** True on the /review page — enables lazy session-create on first decision. */
  inSession?: boolean;
  /** Called after a successful decision (used by /review to fade the card out). */
  onDecided?: () => void;
}

interface DecisionPayload {
  decision: Decision;
  decided_by: string;
  decision_rationale: string | null;
  snooze_until: string | null;
  decided_in_session: string | null;
}

interface DecisionResponse {
  publication: Publication;
  meistertask: MeistertaskPushResult | null;
}

function toIsoDate(d: Date): string {
  // Format as YYYY-MM-DD in local time (snooze_until is a DATE column).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/**
 * Lazy-creates a draft session if `inSession` is true and none is active yet.
 * Returns the session-id (existing or newly created) or null when not in /review.
 */
async function ensureSessionId(inSession: boolean): Promise<string | null> {
  if (!inSession) return null;
  const existing = loadCurrentSessionId();
  if (existing) return existing;

  const r = await fetch('/api/sessions', {
    method: 'POST',
    headers: getApiHeaders(),
    body: '{}',
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${r.status}`);
  }
  const body = await r.json();
  const id = body?.session?.id as string | undefined;
  if (!id) throw new Error('Session create returned no id');
  saveCurrentSessionId(id);
  return id;
}

function notifyMeistertask(mt: MeistertaskPushResult | null) {
  if (!mt) return;
  switch (mt.status) {
    case 'created':
      toast.success('Pitch in MeisterTask angelegt', {
        action: { label: 'Öffnen', onClick: () => window.open(mt.task_url, '_blank', 'noopener') },
      });
      break;
    case 'already_pushed':
      // Quiet — pub was already pushed manually.
      break;
    case 'skipped':
      if (mt.reason === 'not_configured') {
        toast.warning('MeisterTask ist nicht konfiguriert — Decision wurde gespeichert.');
      }
      break;
    case 'error':
      if (mt.reason === 'rate_limited') {
        toast.warning(`MeisterTask rate-limited (Retry in ${mt.retry_after_seconds ?? '?'}s).`);
      } else if (mt.reason === 'auth') {
        toast.error('MeisterTask-Auth fehlgeschlagen — Token rotieren.');
      } else {
        toast.error('MeisterTask-Upstream-Fehler — Decision wurde aber gespeichert.');
      }
      break;
  }
}

export function DecisionToolbar({ pub, inSession = false, onDecided }: DecisionToolbarProps) {
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const [rationale, setRationale] = useState(pub.decision_rationale ?? '');
  const [pendingDecision, setPendingDecision] = useState<Decision | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (payload: { decision: Decision; snooze_until: string | null }): Promise<DecisionResponse> => {
      const decided_in_session = payload.decision === 'undecided' ? null : await ensureSessionId(inSession);
      const reviewer = loadSettings().reviewerName.trim() || 'team';
      const body: DecisionPayload = {
        decision: payload.decision,
        decided_by: reviewer,
        decision_rationale: rationale.trim() || null,
        snooze_until: payload.snooze_until,
        decided_in_session,
      };
      const r = await fetch(`/api/publications/${pub.id}/decision`, {
        method: 'PATCH',
        headers: getApiHeaders(),
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      return data as DecisionResponse;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['publications'] });
      queryClient.invalidateQueries({ queryKey: ['publications-list'] });
      queryClient.invalidateQueries({ queryKey: ['publication', pub.id] });
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
      notifyMeistertask(data.meistertask);
      if (variables.decision !== 'undecided') {
        toast.success(`Entscheidung gespeichert: ${decisionLabel(variables.decision)}`);
        onDecided?.();
      } else {
        toast.success('Entscheidung zurückgesetzt');
      }
      setPendingDecision(null);
    },
    onError: (err: Error) => {
      toast.error(`Entscheidung konnte nicht gespeichert werden: ${err.message}`);
      setPendingDecision(null);
    },
  });

  const triggerDecision = (decision: Decision, snooze: string | null = pub.snooze_until ?? null) => {
    setPendingDecision(decision);
    mutation.mutate({ decision, snooze_until: snooze });
  };

  const isPending = mutation.isPending;
  const current = pub.decision;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <DecisionButton
          decision="pitch"
          current={current}
          pending={pendingDecision}
          isPending={isPending}
          onClick={() => triggerDecision('pitch', null)}
        />
        <DecisionButton
          decision="hold"
          current={current}
          pending={pendingDecision}
          isPending={isPending}
          onClick={() => triggerDecision('hold')}
        />
        <DecisionButton
          decision="skip"
          current={current}
          pending={pendingDecision}
          isPending={isPending}
          onClick={() => triggerDecision('skip', null)}
        />

        {current !== 'undecided' && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => triggerDecision('undecided', null)}
            className="text-neutral-500"
          >
            Zurücksetzen
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-neutral-500 font-medium">Snooze:</span>
          <SnoozeButton label="1W" isoDate={addDays(7)} disabled={isPending} onPick={(d) => triggerDecision('hold', d)} />
          <SnoozeButton label="4W" isoDate={addDays(28)} disabled={isPending} onPick={(d) => triggerDecision('hold', d)} />
          <SnoozeButton label="Quartal" isoDate={addDays(91)} disabled={isPending} onPick={(d) => triggerDecision('hold', d)} />

          <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isPending} className="h-7 px-2">
                    <CalendarIcon className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>Snooze bis Datum (setzt Hold)</TooltipContent>
            </Tooltip>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={pub.snooze_until ? new Date(pub.snooze_until) : undefined}
                onSelect={(date) => {
                  if (!date) return;
                  setSnoozeOpen(false);
                  triggerDecision('hold', toIsoDate(date));
                }}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {pub.snooze_until && (
        <div className="text-[11px] text-neutral-500">
          Snoozed bis <span className="font-medium">{pub.snooze_until}</span>
        </div>
      )}

      <div className="flex items-start gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRationaleOpen((v) => !v)}
          className="h-7 px-2 text-[11px] text-neutral-500 hover:text-neutral-700"
        >
          <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
          {rationaleOpen ? 'Notiz ausblenden' : rationale ? 'Notiz bearbeiten' : 'Notiz hinzufügen'}
        </Button>
        {!rationaleOpen && rationale && (
          <p className="text-[11px] text-neutral-600 mt-1.5 line-clamp-1 flex-1 min-w-0 truncate">
            {rationale}
          </p>
        )}
      </div>

      {rationaleOpen && (
        <Textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Optional: Begründung der Entscheidung — wird mit dem nächsten Klick gespeichert."
          className="min-h-[60px] text-xs"
          disabled={isPending}
        />
      )}
    </div>
  );
}

function decisionLabel(d: Decision): string {
  return d === 'pitch' ? 'Pitch' : d === 'hold' ? 'Hold' : d === 'skip' ? 'Skip' : 'Offen';
}

function DecisionButton({
  decision,
  current,
  pending,
  isPending,
  onClick,
}: {
  decision: Exclude<Decision, 'undecided'>;
  current: Decision;
  pending: Decision | null;
  isPending: boolean;
  onClick: () => void;
}) {
  const isActive = current === decision;
  const isLoading = isPending && pending === decision;

  const config = {
    pitch: {
      Icon: Check,
      label: 'Pitch',
      activeClass: 'bg-green-600 text-white hover:bg-green-700',
      idleClass: 'border-green-300 text-green-700 hover:bg-green-50',
    },
    hold: {
      Icon: Pause,
      label: 'Hold',
      activeClass: 'bg-blue-600 text-white hover:bg-blue-700',
      idleClass: 'border-blue-300 text-blue-700 hover:bg-blue-50',
    },
    skip: {
      Icon: XIcon,
      label: 'Skip',
      activeClass: 'bg-neutral-700 text-white hover:bg-neutral-800',
      idleClass: 'border-neutral-300 text-neutral-600 hover:bg-neutral-100',
    },
  }[decision];

  const Icon = config.Icon;
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={isPending}
      variant={isActive ? 'default' : 'outline'}
      className={`h-9 px-4 font-medium ${isActive ? config.activeClass : config.idleClass}`}
    >
      {isLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Icon className="h-4 w-4 mr-1.5" />}
      {config.label}
    </Button>
  );
}

function SnoozeButton({
  label,
  isoDate,
  disabled,
  onPick,
}: {
  label: string;
  isoDate: string;
  disabled: boolean;
  onPick: (iso: string) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onPick(isoDate)}
          className="h-7 px-2 text-[11px] text-neutral-600"
        >
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>bis {isoDate} (setzt Hold)</TooltipContent>
    </Tooltip>
  );
}
