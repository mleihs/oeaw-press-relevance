'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Kanban, Star, Plus, ChevronDown, RotateCcw } from '@/lib/icons';
import { toast } from 'sonner';
import { cn } from '@/lib/shared/utils';
import { QK } from '@/lib/client/query-keys';
import { compareRank } from '@/lib/shared/rank';
import type { BoardSummary } from '@/lib/shared/board';
import { boardAccent } from '../_lib/people';
import { relativeDay } from '../_lib/due';
import { fetchBoards, createBoardApi, setFavoriteApi } from '../_lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function BoardsOverview({
  initialBoards,
  isAdmin,
}: {
  initialBoards: BoardSummary[];
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const { data: boards = [] } = useQuery({
    queryKey: QK.boards,
    queryFn: fetchBoards,
    initialData: initialBoards,
    staleTime: 30_000,
  });

  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const favorite = useMutation({
    mutationFn: ({ id, fav }: { id: string; fav: boolean }) => setFavoriteApi(id, fav),
    onMutate: async ({ id, fav }) => {
      await qc.cancelQueries({ queryKey: QK.boards });
      const prev = qc.getQueryData<BoardSummary[]>(QK.boards);
      qc.setQueryData<BoardSummary[]>(QK.boards, (old) =>
        (old ?? []).map((b) => (b.id === id ? { ...b, is_favorite: fav } : b)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK.boards, ctx.prev);
      toast.error('Favorit konnte nicht gespeichert werden.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QK.boards }),
  });

  const active = boards
    .filter((b) => !b.archived_at)
    .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || compareRank(a.rank, b.rank));
  const archived = boards.filter((b) => b.archived_at);

  return (
    <div className="mx-auto max-w-[1160px] px-4 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[27px] font-bold tracking-tight text-foreground">Redaktionsboards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {active.length} aktive Boards
            {archived.length > 0 && ` · ${archived.length} archiviert`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((b) => (
          <BoardCard
            key={b.id}
            board={b}
            onToggleFavorite={(fav) => favorite.mutate({ id: b.id, fav })}
          />
        ))}
        {isAdmin && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border text-muted-foreground transition-colors hover:border-brand hover:text-brand"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Plus className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium">Neues Board</span>
          </button>
        )}
      </div>

      {archived.length > 0 && (
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setShowArchived((s) => !s)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', showArchived && 'rotate-180')} />
            Archiviert
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs">{archived.length}</span>
          </button>
          {showArchived && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {archived.map((b) => (
                <BoardCard
                  key={b.id}
                  board={b}
                  archived
                  onToggleFavorite={(fav) => favorite.mutate({ id: b.id, fav })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <CreateBoardDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: QK.boards })}
      />
    </div>
  );
}

function BoardCard({
  board,
  archived,
  onToggleFavorite,
}: {
  board: BoardSummary;
  archived?: boolean;
  onToggleFavorite: (fav: boolean) => void;
}) {
  const accent = archived ? '#64748b' : boardAccent(board.id);
  return (
    <div
      className={cn(
        'group relative rounded-[14px] border border-border bg-card p-[18px] shadow-sm transition-all hover:-translate-y-0.5 hover:border-muted-foreground/40 hover:shadow-md',
        archived && 'opacity-70',
      )}
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="mb-3 flex items-start justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}18`, color: accent }}
        >
          <Kanban className="h-5 w-5" />
        </span>
        <button
          type="button"
          aria-label={board.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
          onClick={() => onToggleFavorite(!board.is_favorite)}
          className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-amber-500"
        >
          <Star
            className="h-[18px] w-[18px]"
            style={board.is_favorite ? { fill: '#f59e0b', color: '#f59e0b' } : undefined}
          />
        </button>
      </div>
      <Link href={`/board/${board.slug}`} className="block">
        <div className="font-semibold text-foreground">{board.name}</div>
        <div className="mt-1.5 flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <span className={cn(board.card_count === 0 && 'text-muted-foreground/50')}>
            {board.card_count} Karten
          </span>
          {archived ? (
            <span className="text-muted-foreground/60">· archiviert</span>
          ) : (
            board.last_activity_at && <span>· aktiv {relativeDay(board.last_activity_at)}</span>
          )}
        </div>
      </Link>
      {archived && <ArchivedRestore board={board} accentClassName="mt-3" />}
    </div>
  );
}

function ArchivedRestore({ board, accentClassName }: { board: BoardSummary; accentClassName?: string }) {
  const qc = useQueryClient();
  const restore = useMutation({
    mutationFn: async () => {
      const { patchBoardApi } = await import('../_lib/api');
      return patchBoardApi(board.id, { archived: false });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QK.boards }),
    onError: () => toast.error('Konnte nicht wiederhergestellt werden.'),
  });
  return (
    <button
      type="button"
      onClick={() => restore.mutate()}
      disabled={restore.isPending}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground',
        accentClassName,
      )}
    >
      <RotateCcw className="h-3.5 w-3.5" /> Zurückholen
    </button>
  );
}

function CreateBoardDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => createBoardApi(name.trim()),
    onSuccess: () => {
      onCreated();
      setName('');
      onOpenChange(false);
      toast.success('Board angelegt.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const submit = () => {
    if (name.trim() && !create.isPending) create.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Neues Board</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            autoFocus
            placeholder="Board-Name (z. B. Lange Nacht der Forschung)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
