'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightToLine, Check } from 'lucide-react';
import { cn } from '@/lib/shared/utils';
import { QK } from '@/lib/client/query-keys';
import type { BoardColumn, CardDetail } from '@/lib/shared/board';
import { fetchBoards, fetchBoardView } from '../_lib/api';
import { ChannelIcon } from '../_lib/channels';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** „Aufgabe verschieben" (Design §4.1): Board wählen + Kanal wählen. Für das
 *  aktuelle Board nutzt es die schon geladenen Spalten; für ein anderes Board
 *  lädt es dessen Spalten nach. */
export function CardMovePopover({
  card,
  currentSlug,
  columns,
  onMove,
}: {
  card: CardDetail;
  currentSlug: string;
  columns: BoardColumn[];
  onMove: (columnId: string) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [boardSlug, setBoardSlug] = useState(currentSlug);

  const { data: boards = [] } = useQuery({
    queryKey: QK.boards,
    queryFn: fetchBoards,
    enabled: open,
    staleTime: 30_000,
  });

  const isCurrent = boardSlug === currentSlug;
  const { data: otherBoard } = useQuery({
    queryKey: QK.board(boardSlug),
    queryFn: () => fetchBoardView(boardSlug),
    enabled: open && !isCurrent,
    staleTime: 15_000,
  });
  const targetColumns = isCurrent ? columns : (otherBoard?.columns ?? []);

  const activeBoards = boards.filter((b) => !b.archived_at);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-[13px] font-medium text-foreground hover:bg-muted"
        >
          <ArrowRightToLine className="h-4 w-4" /> Verschieben
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <div className="mb-1 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Board
        </div>
        <Select value={boardSlug} onValueChange={setBoardSlug}>
          <SelectTrigger className="mb-2 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {activeBoards.map((b) => (
              <SelectItem key={b.id} value={b.slug}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mb-1 px-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Kanal
        </div>
        <div className="flex max-h-56 flex-col overflow-y-auto">
          {targetColumns.map((col) => {
            const isHere = isCurrent && col.id === card.column_id;
            return (
              <button
                key={col.id}
                type="button"
                disabled={isHere}
                onClick={async () => {
                  await onMove(col.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                  isHere ? 'text-muted-foreground' : 'hover:bg-muted',
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: col.color }} />
                <ChannelIcon name={col.name} className="h-4 w-4" style={{ color: col.color }} />
                <span className="flex-1 truncate text-foreground">{col.name}</span>
                {isHere && <Check className="h-4 w-4 text-brand" />}
              </button>
            );
          })}
          {targetColumns.length === 0 && (
            <div className="px-2 py-3 text-center text-[13px] text-muted-foreground">
              Keine Kanäle
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
