'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pin, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FlagNote, Decision } from '@/lib/shared/types';
import { loadSettings, getApiHeaders } from '@/lib/client/stores/settings-store';
import { DEFAULT_REVIEWER_NAME } from '@/lib/shared/constants';
import { QK } from '@/lib/client/query-keys';
import { DECISION_VARIANTS } from '@/components/decision-badge';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface PublicationFlagProps {
  pubId: string;
  flagNotes: FlagNote[];
  /** Optional callback fired with the new flag_notes after a successful mutation. */
  onChange?: (notes: FlagNote[]) => void;
  /** Compact mode for tight rows; default = normal. */
  size?: 'sm' | 'md';
  /** Triage decision-state — switches the icon to reflect lifecycle. */
  decision?: Decision | null;
}

/** Icon + visual styling per decision state. The Pin only shows for undecided;
 *  pitch/hold/skip get state-specific icons (from DECISION_VARIANTS) so the
 *  row's lifecycle is glanceable. */
function decisionVisuals(decision: PublicationFlagProps['decision'], iAmFlagging: boolean) {
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
    tooltip: null,
  };
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

export function PublicationFlag({ pubId, flagNotes, onChange, size = 'md', decision }: PublicationFlagProps) {
  // reviewerName is read on every popover open (not on every render) so a
  // freshly-edited name is picked up without a remount.
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

  // Re-read settings + reset draft on every popover open via the controlled
  // onOpenChange handler (instead of an effect — see lint rule
  // react-hooks/set-state-in-effect).
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

  const saveMutation = useMutation({
    mutationFn: async (note: string) => {
      const r = await fetch(`/api/publications/${pubId}/flag`, {
        method: 'POST',
        headers: getApiHeaders(),
        body: JSON.stringify({ by: reviewerName, note }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body.flag_notes as FlagNote[];
    },
    onSuccess: (notes) => {
      onChange?.(notes);
      // Cache invalidation for client-cached surfaces + router.refresh() for
      // RSC consumers (e.g. `/publications/[id]` post-ADR 0009). Both run;
      // the refresh is a no-op when no Server-Component segment reads the
      // pub. See ADR 0010 for the canonical pattern.
      queryClient.invalidateQueries({ queryKey: QK.publications });
      queryClient.invalidateQueries({ queryKey: QK.publication(pubId) });
      router.refresh();
      setOpen(false);
    },
    onError: (err) => {
      toast.error(`Flag konnte nicht gespeichert werden: ${err.message}`);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/publications/${pubId}/flag`, {
        method: 'DELETE',
        headers: getApiHeaders(),
        body: JSON.stringify({ by: reviewerName }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
      return body.flag_notes as FlagNote[];
    },
    onSuccess: (notes) => {
      onChange?.(notes);
      queryClient.invalidateQueries({ queryKey: QK.publications });
      queryClient.invalidateQueries({ queryKey: QK.publication(pubId) });
      router.refresh();
      setOpen(false);
    },
    onError: (err) => {
      toast.error(`Flag konnte nicht entfernt werden: ${err.message}`);
    },
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
              aria-label={visuals.tooltip ?? (iAmFlagging ? 'Mein Flag bearbeiten' : 'Pub flaggen')}
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
              ? 'Pub flaggen für die nächste Sitzung'
              : totalCount === 1 && iAmFlagging
                ? 'Du hast diese Pub geflaggt'
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
              <label htmlFor={`flag-note-${pubId}`} className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Deine Notiz
              </label>
              <span className="text-[10px] text-muted-foreground/70">
                als <span className="font-medium">{reviewerName.trim() || DEFAULT_REVIEWER_NAME}</span>
              </span>
            </div>
            <Textarea
              id={`flag-note-${pubId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Optional: warum diese Pub auf die Sitzungs-Liste?"
              className="min-h-[64px] text-xs"
              disabled={busy}
            />
            {!reviewerName.trim() && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                Kein Name in den Einstellungen — Eintrag wird als „{DEFAULT_REVIEWER_NAME}" gespeichert.
              </p>
            )}
          </div>

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
