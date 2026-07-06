'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/shared/utils';
import type { BoardMember, CardDetail } from '@/lib/shared/board';
import { patchCardApi } from '../_lib/api';
import { displayNameOf } from '../_lib/people';
import { BoardAvatar } from './board-avatar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Check, ChevronDown, Search, UserPlus, UserMinus } from '@/lib/icons';

/** Prominenter Zuweisen-Button im Modal-Kopf (Design Board-Celebration §1b,
 *  MeisterTask-Pendant): Avatar + Name der zuständigen Person (oder gestrichelter
 *  Platzhalter), Klick öffnet den Picker mit Suche, Team-Liste und „Zuweisung
 *  entfernen". Die Sidebar behält ihr „Zuständig"-Feld — mobil ist der
 *  Header-Button ausgeblendet (Platz) und die Sidebar der Weg. */
export function AssignButton({
  card,
  members,
  onPatch,
}: {
  card: CardDetail;
  members: BoardMember[];
  onPatch: (c: CardDetail) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Aus members ableitbar — kein byId-Prop nötig (Cleanup-Backlog 2026-07-06).
  const assignee = card.assignee_id
    ? members.find((m) => m.id === card.assignee_id)
    : undefined;

  const patch = useMutation({
    mutationFn: (assigneeId: string | null) => patchCardApi(card.id, { assignee_id: assigneeId }),
    onSuccess: (updated) => {
      onPatch(updated);
      setOpen(false);
      setQuery('');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = useMemo(() => {
    const active = members.filter((m) => !m.disabled_at);
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (m) => displayNameOf(m).toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [members, query]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={assignee ? `Zugewiesen an ${displayNameOf(assignee)}` : 'Karte zuweisen'}
          className={cn(
            'hidden h-9 items-center gap-2 rounded-md border py-0 pl-1.5 pr-2.5 text-sm font-semibold transition-colors md:inline-flex',
            open
              ? 'border-brand-200 bg-brand-50/70 text-brand'
              : 'border-input bg-card text-foreground hover:border-brand-200 hover:bg-brand-50/70 hover:text-brand',
          )}
        >
          {assignee ? (
            <BoardAvatar member={assignee} size={26} />
          ) : (
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-muted-foreground/40 text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="max-w-[130px] truncate">
            {assignee ? displayNameOf(assignee) : 'Zuweisen'}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[296px] p-0" sideOffset={8}>
        <div className="border-b p-2.5">
          <div className="flex h-9 items-center gap-2 rounded-lg border border-input px-2.5 focus-within:border-brand">
            <Search className="h-[15px] w-[15px] shrink-0 text-muted-foreground/70" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mitglied suchen…"
              aria-label="Mitglied suchen"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
            />
          </div>
        </div>
        <div className="px-3.5 pb-1 pt-2 font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Redaktionsteam
        </div>
        <div className="max-h-[236px] overflow-y-auto px-1.5 pb-1.5">
          {options.length === 0 && (
            <div className="px-2.5 py-3 text-sm text-muted-foreground">Keine Treffer.</div>
          )}
          {options.map((m) => {
            const current = card.assignee_id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => patch.mutate(current ? null : m.id)}
                disabled={patch.isPending}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-brand-50/70',
                  current && 'bg-brand-50',
                )}
              >
                <BoardAvatar member={m} size={30} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {displayNameOf(m)}
                </span>
                {current && <Check className="h-[15px] w-[15px] shrink-0 text-brand" />}
              </button>
            );
          })}
        </div>
        {assignee && (
          <button
            type="button"
            onClick={() => patch.mutate(null)}
            disabled={patch.isPending}
            className="flex w-full items-center gap-2.5 border-t px-3.5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            <span className="flex w-[30px] justify-center">
              <UserMinus className="h-[17px] w-[17px]" />
            </span>
            Zuweisung entfernen
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
