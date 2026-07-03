'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Columns3,
  ChevronDown,
  GripVertical,
  Plus,
  Trash2,
  Archive,
  RotateCcw,
  AlertTriangle,
} from '@/lib/icons';
import { toast } from 'sonner';
import { cn } from '@/lib/shared/utils';
import { QK } from '@/lib/client/query-keys';
import { BOARD_COLUMN_SWATCHES } from '@/lib/shared/board';
import type { BoardColumn, BoardSummary, BoardWithColumns } from '@/lib/shared/board';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import {
  fetchBoards,
  fetchBoardView,
  createBoardApi,
  patchBoardApi,
  createColumnApi,
  patchColumnApi,
  deleteColumnApi,
} from '@/app/board/_lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function BoardManagementCard() {
  const { user, isAdmin, isLoading } = useCurrentUser();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');

  const { data: boards = [] } = useQuery({
    queryKey: QK.boards,
    queryFn: fetchBoards,
    enabled: !!user,
    staleTime: 30_000,
  });

  const create = useMutation({
    mutationFn: () => createBoardApi(newName.trim()),
    onSuccess: () => {
      setNewName('');
      qc.invalidateQueries({ queryKey: QK.boards });
      toast.success('Board angelegt.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !user) return null;

  const active = boards.filter((b) => !b.archived_at);
  const archived = boards.filter((b) => b.archived_at);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Columns3 className="h-4 w-4 text-muted-foreground/70" />
          Board-Verwaltung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Spalten (Kanäle) dürfen alle bearbeiten. Boards anlegen und archivieren ist Admins
          vorbehalten.
        </p>

        {isAdmin && (
          <div className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && newName.trim() && !create.isPending && create.mutate()}
              placeholder="Neues Board (Name)…"
              className="h-9"
            />
            <Button size="sm" onClick={() => create.mutate()} disabled={!newName.trim() || create.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Anlegen
            </Button>
          </div>
        )}

        <div className="divide-y rounded-lg border">
          {active.map((b) => (
            <BoardRow key={b.id} board={b} isAdmin={isAdmin} />
          ))}
          {active.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">Noch keine Boards.</div>
          )}
        </div>

        {archived.length > 0 && (
          <div className="rounded-lg border">
            <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Archiviert
            </div>
            <div className="divide-y">
              {archived.map((b) => (
                <BoardRow key={b.id} board={b} isAdmin={isAdmin} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BoardRow({ board, isAdmin }: { board: BoardSummary; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const archive = useMutation({
    mutationFn: () => patchBoardApi(board.id, { archived: !board.archived_at }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.boards });
      toast.success(board.archived_at ? 'Wiederhergestellt.' : 'Archiviert.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className={cn(board.archived_at && 'opacity-70')}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
          <span className="font-medium text-foreground">{board.name}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{board.card_count} Karten</span>
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => archive.mutate()}
            disabled={archive.isPending}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {board.archived_at ? (
              <>
                <RotateCcw className="h-3.5 w-3.5" /> Zurückholen
              </>
            ) : (
              <>
                <Archive className="h-3.5 w-3.5" /> Archivieren
              </>
            )}
          </button>
        )}
      </div>
      {open && <ColumnEditor board={board} />}
    </div>
  );
}

function ColumnEditor({ board }: { board: BoardSummary }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: QK.board(board.slug),
    queryFn: () => fetchBoardView(board.slug),
    staleTime: 15_000,
  });
  const [newCol, setNewCol] = useState('');
  const [warn, setWarn] = useState<{ name: string; count: number } | null>(null);

  const columns = data?.columns ?? [];
  const cardCountByColumn = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of data?.cards ?? []) map.set(c.column_id, (map.get(c.column_id) ?? 0) + 1);
    return map;
  }, [data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK.board(board.slug) });

  const addColumn = useMutation({
    mutationFn: () => createColumnApi(board.id, newCol.trim()),
    onSuccess: () => {
      setNewCol('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const reorder = useMutation({
    mutationFn: ({ id, beforeId, afterId }: { id: string; beforeId: string | null; afterId: string | null }) =>
      patchColumnApi(id, { before_id: beforeId, after_id: afterId }),
    onSuccess: invalidate,
    onError: (e: Error) => {
      toast.error(e.message);
      invalidate();
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteColumnApi(id),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = columns.map((c) => c.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(columns, from, to);
    const pos = next.findIndex((c) => c.id === active.id);
    const beforeId = next[pos - 1]?.id ?? null; // Nachbar oberhalb (kleinerer Rank)
    const afterId = next[pos + 1]?.id ?? null; // Nachbar unterhalb (größerer Rank)
    // Optimistisch die Reihenfolge im Cache spiegeln.
    qc.setQueryData<BoardWithColumns>(QK.board(board.slug), (old) =>
      old ? { ...old, columns: next } : old,
    );
    reorder.mutate({ id: String(active.id), beforeId, afterId });
  }

  function requestDelete(col: BoardColumn) {
    const count = cardCountByColumn.get(col.id) ?? 0;
    if (count > 0) {
      setWarn({ name: col.name, count });
      return;
    }
    del.mutate(col.id);
  }

  return (
    <div className="space-y-2 border-t bg-muted/30 px-3 py-3">
      {columns.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Dieses Board hat noch keine Spalten.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {columns.map((col) => (
                <ColumnRow
                  key={col.id}
                  column={col}
                  cardCount={cardCountByColumn.get(col.id) ?? 0}
                  onRename={(name) => patchColumnApi(col.id, { name }).then(invalidate).catch((e) => toast.error(e.message))}
                  onRecolor={(color) => patchColumnApi(col.id, { color }).then(invalidate).catch((e) => toast.error(e.message))}
                  onDelete={() => requestDelete(col)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex gap-2 pt-1">
        <Input
          value={newCol}
          onChange={(e) => setNewCol(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && newCol.trim() && !addColumn.isPending && addColumn.mutate()}
          placeholder="Spalte hinzufügen…"
          className="h-8"
        />
        <Button size="sm" variant="outline" onClick={() => addColumn.mutate()} disabled={!newCol.trim() || addColumn.isPending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {warn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(13,36,80,.42)' }}
          onClick={() => setWarn(null)}
        >
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <span className="font-semibold text-foreground">Spalte enthält Karten</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Die Spalte „{warn.name}" enthält noch {warn.count} Karte(n). Verschiebe die Karten zuerst
              in einen anderen Kanal, dann kann die Spalte gelöscht werden.
            </p>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={() => setWarn(null)}>
                Verstanden
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ColumnRow({
  column,
  cardCount,
  onRename,
  onRecolor,
  onDelete,
}: {
  column: BoardColumn;
  cardCount: number;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });
  const [name, setName] = useState(column.name);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground/60 hover:text-muted-foreground"
        aria-label="Spalte verschieben"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-[15px] w-[15px] shrink-0 rounded-[4px] ring-1 ring-black/10"
            style={{ backgroundColor: column.color }}
            aria-label="Farbe ändern"
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2">
          <div className="grid grid-cols-5 gap-1.5">
            {BOARD_COLUMN_SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onRecolor(c)}
                className={cn('h-6 w-6 rounded-md', column.color.toLowerCase() === c && 'ring-2 ring-foreground')}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name !== column.name && onRename(name.trim())}
        className="flex-1 rounded bg-transparent px-1 py-0.5 text-sm text-foreground outline-none hover:bg-muted focus:bg-muted"
      />
      <span className="font-mono text-[11px] text-muted-foreground">{cardCount}</span>
      <button
        type="button"
        onClick={onDelete}
        className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
        aria-label="Spalte löschen"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
