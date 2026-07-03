'use client';

import { UserCircle2 } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import type { BoardMember, CardChip } from '@/lib/shared/board';
import type { BoardFilters } from '../_lib/filter';
import { personCounts } from '../_lib/filter';
import { BoardAvatar } from './board-avatar';
import { displayNameOf } from '../_lib/people';

/** Personen-Leiste (Design §3.5): „Nicht zugewiesen" zuerst, dann Team mit
 *  Karten-Zählern. Klick togglet den Personen-Filter. */
export function PeopleBar({
  members,
  cards,
  filters,
  resolveFirstName,
  onSelectPerson,
}: {
  members: BoardMember[];
  cards: CardChip[];
  filters: BoardFilters;
  resolveFirstName: (userId: string) => string | null;
  onSelectPerson: (personId: string | 'unassigned') => void;
}) {
  const counts = personCounts(cards, resolveFirstName);
  const activeMembers = members
    .filter((m) => !m.disabled_at)
    .sort((a, b) => (counts.byUser[b.id] ?? 0) - (counts.byUser[a.id] ?? 0));

  return (
    <aside className="hidden w-[76px] shrink-0 flex-col items-center gap-1 border-l border-border pl-2 md:flex">
      <div className="pb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Team
      </div>

      <button
        type="button"
        onClick={() => onSelectPerson('unassigned')}
        className={cn(
          'flex w-full flex-col items-center gap-1 rounded-lg py-2 transition-colors',
          filters.personId === 'unassigned' ? 'bg-brand/10' : 'hover:bg-muted',
        )}
        title="Nicht zugewiesen"
      >
        <span
          className={cn(
            'flex h-[34px] w-[34px] items-center justify-center rounded-full border border-dashed',
            filters.personId === 'unassigned'
              ? 'border-brand text-brand'
              : 'border-muted-foreground/40 text-muted-foreground',
          )}
        >
          <UserCircle2 className="h-[19px] w-[19px]" />
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{counts.unassigned}</span>
      </button>

      <div className="my-1 h-px w-8 bg-border" />

      <div className="flex w-full flex-col items-center gap-1 overflow-y-auto">
        {activeMembers.map((m) => {
          const active = filters.personId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectPerson(m.id)}
              className={cn(
                'flex w-full flex-col items-center gap-1 rounded-lg py-2 transition-colors',
                active ? 'bg-brand/10' : 'hover:bg-muted',
              )}
              title={displayNameOf(m)}
            >
              <BoardAvatar member={m} size={34} ring={active} />
              <span
                className={cn(
                  'font-mono text-[11px]',
                  active ? 'text-brand' : 'text-muted-foreground',
                )}
              >
                {counts.byUser[m.id] ?? 0}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
