'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, CalendarIcon, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';
import type { Publication, Decision } from '@/lib/shared/types';
import type { MeistertaskPushResult } from "@/lib/shared/meistertask-types";
import { loadSettings, getApiHeaders } from '@/lib/client/stores/settings-store';
import { DEFAULT_REVIEWER_NAME } from '@/lib/shared/constants';
import {
  loadCurrentSessionId,
  saveCurrentSessionId,
} from '@/lib/client/stores/session-store';
import { QK } from '@/lib/client/query-keys';
import { DECISION_VARIANTS, getDecisionLabel } from '@/components/decision-badge';
import { InfoBubble } from '@/components/info-bubble';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

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
        toast.warning('MeisterTask ist nicht konfiguriert. Decision wurde gespeichert.');
      }
      break;
    case 'error':
      if (mt.reason === 'rate_limited') {
        toast.warning(`MeisterTask rate-limited (Retry in ${mt.retry_after_seconds ?? '?'}s).`);
      } else if (mt.reason === 'auth') {
        toast.error('MeisterTask-Auth fehlgeschlagen. Token rotieren.');
      } else {
        toast.error('MeisterTask-Upstream-Fehler. Decision wurde aber gespeichert.');
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
  const router = useRouter();

  const mutation = useMutation({
    mutationFn: async (payload: { decision: Decision; snooze_until: string | null }): Promise<DecisionResponse> => {
      const decided_in_session = payload.decision === 'undecided' ? null : await ensureSessionId(inSession);
      const reviewer = loadSettings().reviewerName.trim() || DEFAULT_REVIEWER_NAME;
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
      // Invalidate cache keys for client surfaces (review queue,
      // publications list) AND call router.refresh() for RSC consumers
      // (e.g. `/publications/[id]`). Both run; the refresh is cheap on
      // fully-client routes. Canonical pattern: ADR 0010.
      queryClient.invalidateQueries({ queryKey: QK.publications });
      queryClient.invalidateQueries({ queryKey: QK.publicationsList });
      queryClient.invalidateQueries({ queryKey: QK.publication(pub.id) });
      queryClient.invalidateQueries({ queryKey: QK.reviewQueue });
      router.refresh();
      notifyMeistertask(data.meistertask);
      if (variables.decision !== 'undecided') {
        toast.success(`Entscheidung gespeichert: ${getDecisionLabel(variables.decision)}`);
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
    <div className="rounded-lg border border-border bg-card p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <DecisionButton
            decision="pitch"
            current={current}
            pending={pendingDecision}
            isPending={isPending}
            onClick={() => triggerDecision('pitch', null)}
          />
          <InfoBubble id="decision_pitch" size="sm" />
        </span>
        <span className="inline-flex items-center gap-1">
          <DecisionButton
            decision="hold"
            current={current}
            pending={pendingDecision}
            isPending={isPending}
            onClick={() => triggerDecision('hold')}
          />
          <InfoBubble id="decision_hold" size="sm" />
        </span>
        <span className="inline-flex items-center gap-1">
          <DecisionButton
            decision="skip"
            current={current}
            pending={pendingDecision}
            isPending={isPending}
            onClick={() => triggerDecision('skip', null)}
          />
          <InfoBubble id="decision_skip" size="sm" />
        </span>

        {current !== 'undecided' && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => triggerDecision('undecided', null)}
            className="text-muted-foreground"
          >
            Zurücksetzen
          </Button>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
            Snooze:
            <InfoBubble id="decision_snooze" size="sm" />
          </span>
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
        <div className="text-[11px] text-muted-foreground">
          Snoozed bis <span className="font-medium">{pub.snooze_until}</span>
        </div>
      )}

      <div className="flex items-start gap-2">
        <span className="inline-flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRationaleOpen((v) => !v)}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
            {rationaleOpen ? 'Notiz ausblenden' : rationale ? 'Notiz bearbeiten' : 'Notiz hinzufügen'}
          </Button>
          <InfoBubble id="decision_rationale" size="sm" />
        </span>
        {!rationaleOpen && rationale && (
          <p className="text-[11px] text-foreground/80 mt-1.5 line-clamp-1 flex-1 min-w-0 truncate">
            {rationale}
          </p>
        )}
      </div>

      {rationaleOpen && (
        <Textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Optional: Begründung der Entscheidung, die mit dem nächsten Klick gespeichert wird."
          className="min-h-[60px] text-xs"
          disabled={isPending}
        />
      )}
    </div>
  );
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
  const v = DECISION_VARIANTS[decision];
  const Icon = v.Icon;
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={isPending}
      variant={isActive ? 'default' : 'outline'}
      className={`h-9 px-4 font-medium ${isActive ? v.largeButton.active : v.largeButton.idle}`}
    >
      {isLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Icon className="h-4 w-4 mr-1.5" />}
      {v.label}
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
          className="h-7 px-2 text-[11px] text-foreground/80"
        >
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>bis {isoDate} (setzt Hold)</TooltipContent>
    </Tooltip>
  );
}
