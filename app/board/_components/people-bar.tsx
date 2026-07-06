'use client';

import { useState } from 'react';
import { ChevronUp, UserCircle2 } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import type { BoardMember, CardChip } from '@/lib/shared/board';
import type { BoardFilters } from '../_lib/filter';
import { personCounts } from '../_lib/filter';
import { BoardAvatar } from './board-avatar';
import { displayNameOf } from '../_lib/people';

/** Personen-Leiste (Design §3.5): „Nicht zugewiesen" zuerst, dann die Personen,
 *  die in DIESEM Board tatsächlich vorkommen (zugewiesen/beobachtend/im Text),
 *  mit Karten-Zählern; der Rest des Teams zusammengeklappt dahinter
 *  (MeisterTask zeigt rechts nur die Projekt-Mitglieder — unser Modell ist
 *  team-weit, also trennen wir stattdessen nach Vorkommen). Klick togglet den
 *  Personen-Filter. */
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
  // Im Board vertreten vs. restliches Team (eingeklappt). Der aktive
  // Personen-Filter bleibt immer sichtbar, sonst verschwände der gedrückte
  // Zustand beim Zuklappen.
  const present = activeMembers.filter(
    (m) => (counts.byUser[m.id] ?? 0) > 0 || filters.personId === m.id,
  );
  const others = activeMembers.filter((m) => !present.includes(m));
  const [showOthers, setShowOthers] = useState(false);

  return (
    <aside className="hidden w-[76px] shrink-0 flex-col items-center gap-1 border-l border-border pl-2 md:flex">
      <div className="pb-1 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
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
        <span className="font-mono text-2xs text-muted-foreground">{counts.unassigned}</span>
      </button>

      <div className="my-1 h-px w-8 bg-border" />

      <div className="flex w-full flex-col items-center gap-1 overflow-y-auto">
        {present.map((m) => (
          <PersonButton
            key={m.id}
            member={m}
            count={counts.byUser[m.id] ?? 0}
            active={filters.personId === m.id}
            onSelect={() => onSelectPerson(m.id)}
          />
        ))}

        {others.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              aria-expanded={showOthers}
              className="flex w-full flex-col items-center gap-0.5 rounded-lg py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={showOthers ? 'Weitere Personen einklappen' : `${others.length} weitere Personen zeigen`}
            >
              {showOthers ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-dashed border-muted-foreground/40 font-mono text-2xs font-semibold">
                  +{others.length}
                </span>
              )}
              {!showOthers && <span className="font-mono text-2xs">Team</span>}
            </button>
            {showOthers &&
              others.map((m) => (
                <PersonButton
                  key={m.id}
                  member={m}
                  count={0}
                  active={filters.personId === m.id}
                  onSelect={() => onSelectPerson(m.id)}
                />
              ))}
          </>
        )}
      </div>
    </aside>
  );
}

function PersonButton({
  member,
  count,
  active,
  onSelect,
}: {
  member: BoardMember;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full flex-col items-center gap-1 rounded-lg py-2 transition-colors',
        active ? 'bg-brand/10' : 'hover:bg-muted',
      )}
      title={displayNameOf(member)}
    >
      <BoardAvatar member={member} size={34} ring={active} />
      <span className={cn('font-mono text-2xs', active ? 'text-brand' : 'text-muted-foreground')}>
        {count}
      </span>
    </button>
  );
}
