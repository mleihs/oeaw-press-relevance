'use client';

import { useDroppable } from '@dnd-kit/core';
import { Plus } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import type { BoardColumn as BoardColumnT, BoardLabel, BoardMember, CardChip as CardChipT } from '@/lib/shared/board';
import { ChannelIcon } from '../_lib/channels';
import { CardChip } from './card-chip';

export function BoardColumn({
  column,
  cards,
  members,
  labels,
  isDragging,
  onOpenCard,
  onAddCard,
}: {
  column: BoardColumnT;
  cards: CardChipT[];
  members: Map<string, BoardMember>;
  labels: Map<string, BoardLabel>;
  isDragging: boolean;
  onOpenCard: (id: string) => void;
  onAddCard: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section className="flex w-[296px] shrink-0 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-1 pb-2.5 pt-0.5">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: column.color }} />
        <ChannelIcon name={column.name} className="h-[15px] w-[15px]" style={{ color: column.color }} />
        <span className="text-[13.5px] font-semibold text-foreground">{column.name}</span>
        <span
          className="rounded-full px-1.5 py-0.5 font-mono text-[11.5px] font-medium"
          style={{ backgroundColor: `${column.color}1f`, color: column.color }}
        >
          {cards.length}
        </span>
        <button
          type="button"
          onClick={onAddCard}
          aria-label="Karte in diesem Kanal"
          title="Karte in diesem Kanal"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* Body */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-xl p-1.5 transition-colors',
        )}
        style={{
          // Body dezent in der Kanalfarbe getönt (Alpha über den Canvas →
          // theme-aware in beiden Modi) statt flachem Hardcoded-Grau. Gibt
          // jedem Kanal eine ruhige Farbzone (MeisterTask-Idee, dezenter).
          backgroundColor: isOver ? `${column.color}26` : `${column.color}12`,
          outline: isOver ? `2px dashed ${column.color}` : undefined,
          outlineOffset: isOver ? -2 : undefined,
        }}
      >
        {cards.map((card) => (
          <CardChip
            key={card.id}
            card={card}
            accent={column.color}
            members={members}
            labels={labels}
            onOpen={() => onOpenCard(card.id)}
          />
        ))}
        {cards.length === 0 && !isDragging && (
          <div className="flex h-20 items-center justify-center rounded-[10px] border border-dashed border-border text-xs text-muted-foreground">
            Keine Karten
          </div>
        )}
      </div>
    </section>
  );
}
