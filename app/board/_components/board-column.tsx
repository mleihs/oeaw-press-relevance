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

  // Board-Tiefe (A+B): gesättigter Kanalkopf = solide, leicht vertiefte
  // Kanalfarbe (Richtung Schwarz gemischt, damit weiße Schrift auch auf hellen
  // Kanalfarben wie Amber trägt) mit weißen Labels/Icons. Farbe konzentriert
  // sich im Kopf (~20%-Regel); der Spaltenkörper bleibt neutral.
  const headBg = `color-mix(in srgb, ${column.color} 82%, #06121f)`;
  const nameColor = '#ffffff';
  const iconColor = 'rgba(255,255,255,.95)';
  const actionColor = 'rgba(255,255,255,.82)';

  const commitRename = () => {
    const next = draft.trim();
    if (next && next !== column.name) onRename(column.id, next);
    else setDraft(column.name);
    setEditing(false);
  };

  return (
    <section className="flex w-[296px] shrink-0 flex-col">
      {/* Header — gesättigter Kanal-Balken (Board-Tiefe B): solide Kanalfarbe,
          weiße Schrift/Icons, dezenter Schlagschatten. Kräftige Farbe genau
          hier, während der Spaltenkörper neutral bleibt. Rechts: „…"-Menü + „+". */}
      <div
        className="mb-2 flex items-center gap-2 rounded-[10px] px-2.5 py-2 shadow-[0_1px_2px_rgba(16,32,46,.16)]"
        style={{ backgroundColor: headBg }}
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
            className="min-w-0 flex-1 rounded bg-white/25 px-1 py-0.5 text-[13px] font-bold tracking-tight outline-none placeholder:text-white/60"
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
          className="rounded-full bg-white/22 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white"
          style={{ backgroundColor: 'rgba(255,255,255,.22)' }}
        >
          {cards.length}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Kanaloptionen"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/15"
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
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/15"
          style={{ color: actionColor }}
        >
          <Plus className="h-[15px] w-[15px]" />
        </button>
      </div>

      {/* Body — neutrale, leicht eingesenkte Mulde (Board-Tiefe A). Der
          Wertekontrast (weiße Karte > neutrale Mulde) erzeugt die Tiefe; die
          Kanalfarbe sitzt jetzt im Kopf, nicht in der Zone. Farbe/Schatten der
          Mulde kommen aus den Erscheinungsbild-Tokens; beim Drüberziehen ein
          Hauch Kanalfarbe zur Rückmeldung. */}
      <div
        ref={setNodeRef}
        className={cn('flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-xl p-2 transition-colors')}
        style={{
          background: isOver
            ? `color-mix(in srgb, ${column.color} 15%, var(--board-trough))`
            : 'var(--board-trough)',
          boxShadow: 'var(--board-trough-shadow)',
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
