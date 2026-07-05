'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Plus, MoreHorizontal, Pencil, Trash2, ArrowLeft, ArrowRight, ArrowUpDown, CalendarDays, List, Clock, EyeOff, Archive } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import type { BoardColumn as BoardColumnT, BoardLabel, BoardMember, CardChip as CardChipT } from '@/lib/shared/board';
import { BOARD_COLUMN_SWATCHES } from '@/lib/shared/board';
import { ChannelIcon } from '../_lib/channels';
import { CardChip } from './card-chip';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

export function BoardColumn({
  column,
  cards,
  members,
  labels,
  isDragging,
  isFirst,
  isLast,
  onOpenCard,
  onAddCard,
  onRename,
  onRecolor,
  onMove,
  onSort,
  onHide,
  onArchiveCompleted,
  onDelete,
}: {
  column: BoardColumnT;
  cards: CardChipT[];
  members: Map<string, BoardMember>;
  labels: Map<string, BoardLabel>;
  isDragging: boolean;
  isFirst: boolean;
  isLast: boolean;
  onOpenCard: (id: string) => void;
  onAddCard: () => void;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onMove: (id: string, dir: 'left' | 'right') => void;
  onSort: (id: string, by: 'due' | 'title' | 'created') => void;
  onHide: (id: string) => void;
  onArchiveCompleted: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.name);

  const nameColor = `color-mix(in srgb, ${column.color} 60%, var(--foreground))`;
  const iconColor = `color-mix(in srgb, ${column.color} 72%, var(--foreground))`;
  const actionColor = `color-mix(in srgb, ${column.color} 55%, var(--foreground))`;

  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== column.name) onRename(column.id, next);
    else setDraft(column.name);
    setEditing(false);
  };

  return (
    <section className="flex w-[296px] shrink-0 flex-col">
      {/* Header — getönter Kanal-Balken. Hintergrund = Kanalfarbe dezent
          (color-mix über den Canvas → theme-aware); Name/Icon/Count mischen die
          Kanalfarbe mit dem Vordergrund, damit auch helle Farben lesbar sind.
          Rechts: „…"-Menü (Umbenennen/Farbe/Löschen) + „+" (Karte). */}
      <div
        className="mb-2 flex items-center gap-2 rounded-[10px] px-2.5 py-2"
        style={{ backgroundColor: `color-mix(in srgb, ${column.color} 20%, transparent)` }}
      >
        <ChannelIcon name={column.name} className="h-[15px] w-[15px] shrink-0" style={{ color: iconColor }} />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              else if (e.key === 'Escape') { setDraft(column.name); setEditing(false); }
            }}
            aria-label="Kanalname"
            className="min-w-0 flex-1 rounded bg-white/60 px-1 py-0.5 text-[13px] font-bold tracking-tight outline-none dark:bg-black/25"
            style={{ color: nameColor }}
          />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight"
            style={{ color: nameColor }}
          >
            {column.name}
          </span>
        )}
        <span
          className="rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold"
          style={{
            backgroundColor: `color-mix(in srgb, ${column.color} 30%, transparent)`,
            color: `color-mix(in srgb, ${column.color} 68%, var(--foreground))`,
          }}
        >
          {cards.length}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Kanaloptionen"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: actionColor }}
            >
              <MoreHorizontal className="h-[15px] w-[15px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => { setDraft(column.name); setEditing(true); }}>
              <Pencil className="h-4 w-4" />
              Umbenennen
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ArrowUpDown className="h-4 w-4" />
                Aufgaben anordnen
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => onSort(column.id, 'due')}>
                  <CalendarDays className="h-4 w-4" />
                  Nach Fälligkeit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSort(column.id, 'title')}>
                  <List className="h-4 w-4" />
                  Alphabetisch
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => onSort(column.id, 'created')}>
                  <Clock className="h-4 w-4" />
                  Nach Erstelldatum
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <span className="h-3.5 w-3.5 rounded-[3px] ring-1 ring-black/10" style={{ backgroundColor: column.color }} />
                Farbe ändern
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="p-2">
                <div className="grid grid-cols-5 gap-1.5">
                  {BOARD_COLUMN_SWATCHES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onRecolor(column.id, c)}
                      className={cn('h-6 w-6 rounded-md', column.color.toLowerCase() === c && 'ring-2 ring-foreground')}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem disabled={isFirst} onSelect={() => onMove(column.id, 'left')}>
              <ArrowLeft className="h-4 w-4" />
              Nach links verschieben
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isLast} onSelect={() => onMove(column.id, 'right')}>
              <ArrowRight className="h-4 w-4" />
              Nach rechts verschieben
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onHide(column.id)}>
              <EyeOff className="h-4 w-4" />
              Für mich ausblenden
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onArchiveCompleted(column.id)}>
              <Archive className="h-4 w-4" />
              Abgeschlossene archivieren
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(column.id)}>
              <Trash2 className="h-4 w-4" />
              Kanal löschen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={onAddCard}
          aria-label="Karte in diesem Kanal"
          title="Karte in diesem Kanal"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          style={{ color: actionColor }}
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
