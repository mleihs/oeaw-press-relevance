'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Kanban, ChevronDown, Check, Star, Search } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import { QK } from '@/lib/client/query-keys';
import { fetchBoards } from '../_lib/api';
import { boardAccent } from '../_lib/people';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

export function BoardSwitcher({
  currentSlug,
  currentBoardId,
  currentName,
  cardCount,
  columnCount,
}: {
  currentSlug: string;
  currentBoardId: string;
  currentName: string;
  cardCount: number;
  columnCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const { data: boards = [] } = useQuery({
    queryKey: QK.boards,
    queryFn: fetchBoards,
    staleTime: 30_000,
    enabled: open,
  });

  const visible = boards
    .filter((b) => !b.archived_at)
    .filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()));
  const favorites = visible.filter((b) => b.is_favorite);
  const others = visible.filter((b) => !b.is_favorite);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${boardAccent(currentBoardId)}18`, color: boardAccent(currentBoardId) }}
          >
            <Kanban className="h-[18px] w-[18px]" />
          </span>
          <span>
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              {currentName}
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {cardCount} Karten · {columnCount} Kanäle
            </span>
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Board suchen…"
              className="h-9 pl-8"
            />
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto p-1.5">
          {favorites.length > 0 && (
            <>
              <div className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Favoriten
              </div>
              {favorites.map((b) => (
                <SwitcherRow key={b.id} b={b} currentSlug={currentSlug} onNavigate={() => setOpen(false)} />
              ))}
            </>
          )}
          <div className="px-2 pb-1 pt-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Alle Boards
          </div>
          {others.map((b) => (
            <SwitcherRow key={b.id} b={b} currentSlug={currentSlug} onNavigate={() => setOpen(false)} />
          ))}
          {visible.length === 0 && (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">Keine Treffer</div>
          )}
        </div>
        <div className="border-t p-1.5">
          <Link
            href="/board"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-2 text-sm font-medium text-brand hover:bg-muted"
          >
            Alle Boards ansehen
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SwitcherRow({
  b,
  currentSlug,
  onNavigate,
}: {
  b: { id: string; name: string; slug: string; card_count: number; is_favorite: boolean };
  currentSlug: string;
  onNavigate: () => void;
}) {
  const isCurrent = b.slug === currentSlug;
  return (
    <Link
      href={`/board/${b.slug}`}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted',
        isCurrent && 'bg-muted',
      )}
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: boardAccent(b.id) }} />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{b.name}</span>
      <span className="font-mono text-[11px] text-muted-foreground">{b.card_count}</span>
      {b.is_favorite && <Star className="h-3.5 w-3.5" style={{ fill: '#f59e0b', color: '#f59e0b' }} />}
      {isCurrent && <Check className="h-4 w-4 text-brand" />}
    </Link>
  );
}
