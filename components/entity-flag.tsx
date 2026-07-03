'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Pin, Loader2, Trash2 } from '@/lib/icons';
import { toast } from 'sonner';
import type { FlagNote, Decision } from '@/lib/shared/types';
import { loadSettings, getApiHeaders } from '@/lib/client/stores/settings-store';
import { DEFAULT_REVIEWER_NAME } from '@/lib/shared/constants';
import { DECISION_VARIANTS } from '@/components/decision-badge';
import { InfoBubble } from '@/components/info-bubble';
import type { EXPL } from '@/lib/client/explanations';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface EntityFlagProps {
  entityId: string;
  flagNotes: FlagNote[];
  /** Base URL for flag endpoints. Resulting fetches:
   *    POST   `${apiBase}/flag`
   *    DELETE `${apiBase}/flag`
   *  Body shapes (`{by, note}` / `{by}`) and response shape (`{flag_notes}`)
   *  are identical across entities by contract — both the publications and
   *  events flag handlers wrap the same set/clear logic. */
  apiBase: string;
  /** React-Query keys to invalidate after a successful save/delete (cache
   *  consistency, complements router.refresh() for RSC consumers — same
   *  dual-pattern as ADR 0010). */
  invalidateOnSuccess: readonly QueryKey[];
  /** Optional decision-state icon swap (Pin → state icon) so the row's
   *  triage outcome is glanceable from the flag button itself. */
  decision?: Decision | null;
  /** Compact mode for tight rows; default = normal. */
  size?: 'sm' | 'md';
  /** Optional content rendered between the textarea and the save/delete row
   *  (e.g. EventDecisionButtons). */
  extraPopoverContent?: ReactNode;
  /** Notified with the new flag_notes after a successful mutation. */
  onChange?: (notes: FlagNote[]) => void;
  /** EXPL key for the InfoBubble in the popover header. Each entity passes
   *  its own copy ('publication_flag' / 'event_flag') so the tooltip + the
   *  "Mehr im Hilfe-Center"-link match the entity the user is looking at. */
  infoBubbleId: keyof typeof EXPL;
}

/** Generic flag-popover for any entity with a `flag_notes` JSONB column and
 *  a decision-state. Extracted from the original publication-flag.tsx (now a
 *  thin wrapper) so the events route can reuse the same UX without copying
 *  the open/mutation/dedup logic that several incident fixes baked into it. */
export function EntityFlag({
  entityId,
  flagNotes,
  apiBase,
  invalidateOnSuccess,
  decision,
  size = 'md',
  extraPopoverContent,
  onChange,
  infoBubbleId,
}: EntityFlagProps) {
  const [reviewerName, setReviewerName] = useState(() =>
    typeof window === 'undefined' ? '' : loadSettings().reviewerName,
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();
  const router = useRouter();

  const myKey = norm(reviewerName.trim() || DEFAULT_REVIEWER_NAME);
  const myExisting = flagNotes.find((n) => norm(n.by) === myKey);
  const others = flagNotes.filter((n) => norm(n.by) !== myKey);
  const totalCount = flagNotes.length;
  const iAmFlagging = !!myExisting;

  const handleOpenChange = (next: boolean) => {
    if (next) {
      const fresh = loadSettings().reviewerName;
      setReviewerName(fresh);
      const myFreshKey = norm(fresh.trim() || DEFAULT_REVIEWER_NAME);
      const my = flagNotes.find((n) => norm(n.by) === myFreshKey);
      setDraft(my?.note ?? '');
    }
    setOpen(next);
  };

  const invalidateAndRefresh = (notes: FlagNote[]) => {
    onChange?.(notes);
    for (const key of invalidateOnSuccess) {
      queryClient.invalidateQueries({ queryKey: key });
    }
    router.refresh();
    setOpen(false);
  };

  const saveMutation = useMutation({
    mutationFn: async (note: string) => {
      const r = await fetch(`${apiBase}/flag`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ by: reviewerName, note }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body.flag_notes as FlagNote[];
    },
    onSuccess: invalidateAndRefresh,
    onError: (err) => toast.error(`Flag konnte nicht gespeichert werden: ${err.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${apiBase}/flag`, {
        method: 'DELETE',
        headers: getApiHeaders(),
        body: JSON.stringify({ by: reviewerName }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body.flag_notes as FlagNote[];
    },
    onSuccess: invalidateAndRefresh,
    onError: (err) => toast.error(`Flag konnte nicht entfernt werden: ${err.message}`),
  });

  const busy = saveMutation.isPending || removeMutation.isPending;

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const buttonSize = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';
  const visuals = decisionVisuals(decision, iAmFlagging);
  const StateIcon = visuals.Icon;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={visuals.tooltip ?? (iAmFlagging ? 'Meinen Flag bearbeiten' : 'Eintrag flaggen')}
              className={`relative inline-flex items-center justify-center rounded ${buttonSize} ${visuals.buttonClass} transition-colors`}
              onClick={(e) => e.stopPropagation()}
            >
              <StateIcon className={`${iconSize} ${visuals.iconClass}`} />
              {totalCount > 1 && !visuals.tooltip && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-semibold leading-none">
                  {totalCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          {visuals.tooltip
            ? visuals.tooltip
            : totalCount === 0
              ? 'Eintrag flaggen für die nächste Sitzung'
              : totalCount === 1 && iAmFlagging
                ? 'Du hast diesen Eintrag geflaggt'
                : `${totalCount} Flag${totalCount > 1 ? 's' : ''}`}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-80"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-amber-500" />
            <h4 className="text-sm font-semibold">Flag</h4>
            <InfoBubble id={infoBubbleId} size="sm" />
            {totalCount > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">
                {totalCount} Flag{totalCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {others.length > 0 && (
            <div className="space-y-1.5 border-b pb-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Andere
              </p>
              {others.map((n, i) => (
                <div key={`${n.by}-${i}`} className="text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-foreground/90">{n.by}</span>
                    <span className="text-[10px] text-muted-foreground/70">{formatRelative(n.at)}</span>
                  </div>
                  {n.note && <p className="text-foreground/80 mt-0.5 whitespace-pre-wrap">{n.note}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor={`flag-note-${entityId}`} className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Deine Notiz
              </label>
              <span className="text-[10px] text-muted-foreground/70">
                als <span className="font-medium">{reviewerName.trim() || DEFAULT_REVIEWER_NAME}</span>
              </span>
            </div>
            <Textarea
              id={`flag-note-${entityId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Optional: kurze Notiz für die nächste Sitzung."
              className="min-h-[64px] text-xs"
              disabled={busy}
            />
            {!reviewerName.trim() && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Kein Name in den Einstellungen, daher wird der Eintrag als „{DEFAULT_REVIEWER_NAME}" gespeichert.
              </p>
            )}
          </div>

          {extraPopoverContent}

          <div className="flex items-center justify-between gap-2 pt-1">
            {iAmFlagging ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMutation.mutate()}
                disabled={busy}
                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-500/15"
              >
                {removeMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
                Mein Flag entfernen
              </Button>
            ) : <span />}
            <Button
              size="sm"
              onClick={() => saveMutation.mutate(draft)}
              disabled={busy}
            >
              {saveMutation.isPending && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {iAmFlagging ? 'Notiz aktualisieren' : 'Flaggen'}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function norm(name: string): string {
  return name.trim().toLowerCase();
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60000);
  if (diffMin < 1) return 'gerade eben';
  if (diffMin < 60) return `vor ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `vor ${diffD} d`;
  return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
}

function decisionVisuals(
  decision: Decision | null | undefined,
  iAmFlagging: boolean,
) {
  if (decision && decision !== 'undecided') {
    const v = DECISION_VARIANTS[decision];
    return {
      Icon: v.Icon,
      iconClass: 'fill-none',
      buttonClass: v.iconButton,
      tooltip: `Entschieden: ${v.label}`,
    };
  }
  return {
    Icon: Pin,
    iconClass: iAmFlagging ? 'fill-amber-400' : '',
    buttonClass: `text-muted-foreground/70 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/15 ${iAmFlagging ? 'text-amber-500' : ''}`,
    tooltip: null as string | null,
  };
}
