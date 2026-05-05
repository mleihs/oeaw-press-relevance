'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pin, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { FlagNote } from '@/lib/types';
import { loadSettings, getApiHeaders } from '@/lib/settings-store';
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

export function PublicationFlag({ pubId, flagNotes, onChange, size = 'md' }: PublicationFlagProps) {
  // reviewerName is read on every popover open (not on every render) so a
  // freshly-edited name is picked up without a remount.
  const [reviewerName, setReviewerName] = useState(() =>
    typeof window === 'undefined' ? '' : loadSettings().reviewerName,
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const queryClient = useQueryClient();

  const myKey = norm(reviewerName.trim() || 'team');
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
      const myFreshKey = norm(fresh.trim() || 'team');
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
      // Bust list-page caches so the row reflects the new flag count.
      queryClient.invalidateQueries({ queryKey: ['publications'] });
      queryClient.invalidateQueries({ queryKey: ['publication', pubId] });
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
      queryClient.invalidateQueries({ queryKey: ['publications'] });
      queryClient.invalidateQueries({ queryKey: ['publication', pubId] });
      setOpen(false);
    },
    onError: (err) => {
      toast.error(`Flag konnte nicht entfernt werden: ${err.message}`);
    },
  });

  const busy = saveMutation.isPending || removeMutation.isPending;

  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const buttonSize = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7';

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={iAmFlagging ? 'Mein Flag bearbeiten' : 'Pub flaggen'}
              className={`relative inline-flex items-center justify-center rounded ${buttonSize} text-neutral-400 hover:text-amber-500 hover:bg-amber-50 transition-colors ${iAmFlagging ? 'text-amber-500' : ''}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Pin className={`${iconSize} ${iAmFlagging ? 'fill-amber-400' : ''}`} />
              {totalCount > 1 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[14px] h-[14px] px-1 rounded-full bg-amber-500 text-white text-[9px] font-semibold leading-none">
                  {totalCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top">
          {totalCount === 0
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
              <span className="ml-auto text-[10px] text-neutral-500">
                {totalCount} Flag{totalCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {others.length > 0 && (
            <div className="space-y-1.5 border-b pb-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                Andere
              </p>
              {others.map((n, i) => (
                <div key={`${n.by}-${i}`} className="text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="font-medium text-neutral-700">{n.by}</span>
                    <span className="text-[10px] text-neutral-400">{formatRelative(n.at)}</span>
                  </div>
                  {n.note && <p className="text-neutral-600 mt-0.5 whitespace-pre-wrap">{n.note}</p>}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor={`flag-note-${pubId}`} className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                Deine Notiz
              </label>
              <span className="text-[10px] text-neutral-400">
                als <span className="font-medium">{reviewerName.trim() || 'team'}</span>
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
              <p className="text-[10px] text-amber-600">
                Kein Name in den Einstellungen — Eintrag wird als „team" gespeichert.
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
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
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
