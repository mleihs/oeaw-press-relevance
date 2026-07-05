'use client';

import { useMemo, useState } from 'react';
import { useQueryState } from 'nuqs';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@/lib/icons';
import { toast } from 'sonner';
import { QK } from '@/lib/client/query-keys';
import { rankBetween, compareRank } from '@/lib/shared/rank';
import type { BoardMember, BoardWithColumns, CardChip } from '@/lib/shared/board';
import { fetchBoardView, fetchMembers, moveCardApi, patchColumnApi, deleteColumnApi } from '../_lib/api';
import { useBoardRealtime } from '../_lib/use-board-realtime';
import { EMPTY_FILTERS, matchCard, type BoardFilters } from '../_lib/filter';
import { firstNameOf, membersById } from '../_lib/people';
import { Button } from '@/components/ui/button';
import { BoardSwitcher } from './board-switcher';
import { BoardColumn } from './board-column';
import { BoardFilterBar } from './board-filter-bar';
import { PeopleBar } from './people-bar';
import { CardModal } from './card-modal';
import { QuickCreateDialog } from './quick-create-dialog';

export function BoardView({
  slug,
  initialData,
  members: initialMembers,
  isAdmin,
}: {
  slug: string;
  initialData: BoardWithColumns;
  members: BoardMember[];
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: QK.board(slug),
    queryFn: () => fetchBoardView(slug),
    initialData,
    staleTime: 15_000,
  });
  const { data: members = initialMembers } = useQuery({
    queryKey: QK.boardMembers,
    queryFn: fetchMembers,
    initialData: initialMembers,
    staleTime: 60_000,
  });

  const board = data ?? initialData;
  useBoardRealtime(board.board.id, slug);
  const byId = useMemo(() => membersById(members), [members]);
  const labelsById = useMemo(
    () => new Map((board.labels ?? []).map((l) => [l.id, l])),
    [board.labels],
  );
  const resolveFirstName = useMemo(
    () => (userId: string) => firstNameOf(byId.get(userId)),
    [byId],
  );

  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  // Karte im URL-Query (`?card=<id>`) statt lokalem State: erlaubt Deep-Links
  // aus Dashboard-Kachel, ⌘K-Suche und der „Im Board"-Anzeige an Event/Pub.
  const [openCardId, setOpenCardId] = useQueryState('card');
  const [quickCreateColumn, setQuickCreateColumn] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const move = useMutation({
    mutationFn: ({ cardId, columnId }: { cardId: string; columnId: string }) =>
      moveCardApi(cardId, columnId),
    onMutate: async ({ cardId, columnId }) => {
      await qc.cancelQueries({ queryKey: QK.board(slug) });
      const prev = qc.getQueryData<BoardWithColumns>(QK.board(slug));
      qc.setQueryData<BoardWithColumns>(QK.board(slug), (old) => {
        if (!old) return old;
        const targetRanks = old.cards
          .filter((c) => c.column_id === columnId)
          .map((c) => c.rank)
          .sort(compareRank);
        const last = targetRanks[targetRanks.length - 1] ?? null;
        let optimisticRank: string;
        try {
          optimisticRank = rankBetween(last, null);
        } catch {
          optimisticRank = last ?? 'm';
        }
        return {
          ...old,
          cards: old.cards.map((c) =>
            c.id === cardId ? { ...c, column_id: columnId, rank: optimisticRank } : c,
          ),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(QK.board(slug), ctx.prev);
      toast.error('Verschieben fehlgeschlagen.');
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK.board(slug) });
      qc.invalidateQueries({ queryKey: QK.boards });
    },
  });

  function onDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }
  function onDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const cardId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const card = board.cards.find((c) => c.id === cardId);
    if (!card || card.column_id === overId) return;
    move.mutate({ cardId, columnId: overId });
  }

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, CardChip[]>();
    for (const col of board.columns) map.set(col.id, []);
    for (const card of board.cards) {
      if (!matchCard(card, filters, resolveFirstName)) continue;
      const arr = map.get(card.column_id);
      if (arr) arr.push(card);
    }
    for (const arr of map.values()) arr.sort((a, b) => compareRank(a.rank, b.rank));
    return map;
  }, [board, filters, resolveFirstName]);

  const firstColumnId = board.columns[0]?.id ?? null;

  // Inline-Spaltenverwaltung (Umbenennen/Farbe/Löschen) direkt am Kanalkopf —
  // dieselben Endpunkte wie die Board-Verwaltung in den Einstellungen. Alle
  // Member dürfen Spalten bearbeiten (BOARD_PLAN §3.1). Danach Board + Zähler
  // neu laden.
  const invalidateBoard = () => {
    qc.invalidateQueries({ queryKey: QK.board(slug) });
    qc.invalidateQueries({ queryKey: QK.boards });
  };
  const renameColumn = (id: string, name: string) =>
    patchColumnApi(id, { name }).then(invalidateBoard).catch((e: Error) => toast.error(e.message));
  const recolorColumn = (id: string, color: string) =>
    patchColumnApi(id, { color }).then(invalidateBoard).catch((e: Error) => toast.error(e.message));
  const deleteColumn = (id: string) =>
    deleteColumnApi(id).then(invalidateBoard).catch((e: Error) => toast.error(e.message));

  // Kanal um eine Position verschieben (Menüpunkte am Kanalkopf). board.columns
  // kommt rank-sortiert vom Server; wir setzen den Kanal zwischen die beiden
  // Nachbarn seiner Zielposition (dieselbe before_id/after_id-Mechanik wie das
  // Drag-Reorder in der Board-Verwaltung) und laden dann neu.
  const moveColumn = (id: string, dir: 'left' | 'right') => {
    const cols = board.columns;
    const i = cols.findIndex((c) => c.id === id);
    if (i < 0) return;
    let beforeId: string | null;
    let afterId: string | null;
    if (dir === 'left') {
      if (i === 0) return;
      beforeId = cols[i - 2]?.id ?? null; // linker Nachbar der Zielposition (kleinerer Rank)
      afterId = cols[i - 1].id; // die Spalte, über die wir springen
    } else {
      if (i === cols.length - 1) return;
      beforeId = cols[i + 1].id;
      afterId = cols[i + 2]?.id ?? null;
    }
    patchColumnApi(id, { before_id: beforeId, after_id: afterId })
      .then(invalidateBoard)
      .catch((e: Error) => toast.error(e.message));
  };

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <BoardSwitcher
          currentSlug={slug}
          currentBoardId={board.board.id}
          currentName={board.board.name}
          cardCount={board.board.card_count}
          columnCount={board.columns.length}
        />
        <Button
          size="sm"
          disabled={!firstColumnId}
          onClick={() => setQuickCreateColumn(firstColumnId)}
        >
          <Plus className="mr-1 h-4 w-4" /> Karte anlegen
        </Button>
      </div>

      <BoardFilterBar
        filters={filters}
        onChange={setFilters}
        columns={board.columns}
        members={members}
        labels={board.labels ?? []}
      />

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="mt-3 flex gap-3">
          <div className="board-texture flex flex-1 gap-3.5 overflow-x-auto rounded-lg pb-2">
            {board.columns.length === 0 ? (
              <EmptyBoardHint isAdmin={isAdmin} />
            ) : (
              board.columns.map((col, i) => (
                <BoardColumn
                  key={col.id}
                  column={col}
                  cards={cardsByColumn.get(col.id) ?? []}
                  members={byId}
                  labels={labelsById}
                  isDragging={draggingId !== null}
                  isFirst={i === 0}
                  isLast={i === board.columns.length - 1}
                  onOpenCard={setOpenCardId}
                  onAddCard={() => setQuickCreateColumn(col.id)}
                  onRename={renameColumn}
                  onRecolor={recolorColumn}
                  onMove={moveColumn}
                  onDelete={deleteColumn}
                />
              ))
            )}
          </div>
          <PeopleBar
            members={members}
            cards={board.cards}
            filters={filters}
            resolveFirstName={resolveFirstName}
            onSelectPerson={(personId) =>
              setFilters((f) => ({ ...f, personId: f.personId === personId ? null : personId }))
            }
          />
        </div>
      </DndContext>

      {openCardId && (
        <CardModal
          cardId={openCardId}
          boardSlug={slug}
          boardId={board.board.id}
          columns={board.columns}
          members={members}
          labels={board.labels ?? []}
          onClose={() => setOpenCardId(null)}
          onOpenCard={setOpenCardId}
        />
      )}
      {quickCreateColumn && (
        <QuickCreateDialog
          columnId={quickCreateColumn}
          columns={board.columns}
          boardSlug={slug}
          onClose={() => setQuickCreateColumn(null)}
        />
      )}
    </div>
  );
}

function EmptyBoardHint({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="flex h-40 w-full items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
      Dieses Board hat noch keine Spalten.
      {isAdmin ? ' Lege sie in den Einstellungen › Verwaltung an.' : ''}
    </div>
  );
}
