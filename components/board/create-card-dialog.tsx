'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ExternalLink, ListChecks, Loader2 } from '@/lib/icons';
import { QK } from '@/lib/client/query-keys';
import { cardDeepLink } from '@/lib/shared/board';
import { createCardApi, fetchBoards, fetchBoardView } from '@/lib/client/board-api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Quelle für eine vorbefüllte Triage-Karte (Event-Cockpit / Publikations-
 *  Detail). Der Aufrufer baut sie aus dem jeweiligen Objekt; der Dialog bleibt
 *  quell-agnostisch. */
export interface CardSource {
  kind: 'event' | 'publication';
  /** Genau eines gesetzt — landet als source_event_id / source_publication_id. */
  sourceEventId?: string;
  sourcePublicationId?: string;
  /** Vorbefüllter, editierbarer Titel. */
  title: string;
  /** Externer Link (ÖAW-Seite / DOI) -> card.link_url. */
  linkUrl: string | null;
  /** Vorbefüllte Beschreibung (Markdown). */
  descriptionMd: string | null;
  /** Initiale Checklisten-Texte (Format-Template). */
  checklist: string[];
}

const KIND_LABEL: Record<CardSource['kind'], string> = {
  event: 'Event',
  publication: 'Publikation',
};

export function CreateCardDialog({
  source,
  onClose,
  onCreated,
}: {
  source: CardSource;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const [title, setTitle] = useState(source.title);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [columnId, setColumnId] = useState<string | null>(null);

  const boardsQ = useQuery({ queryKey: QK.boards, queryFn: fetchBoards });
  // Nicht-archivierte Boards, Favoriten zuerst.
  const boards = useMemo(
    () =>
      (boardsQ.data ?? [])
        .filter((b) => b.archived_at === null)
        .sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite)),
    [boardsQ.data],
  );
  const activeBoardId = boardId ?? boards[0]?.id ?? null;
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

  const viewQ = useQuery({
    queryKey: activeBoard ? QK.board(activeBoard.slug) : ['board', '__none__'],
    queryFn: () => fetchBoardView(activeBoard!.slug),
    enabled: !!activeBoard,
  });
  const columns = viewQ.data?.columns ?? [];
  const activeColumnId = columnId ?? columns[0]?.id ?? null;

  const create = useMutation({
    mutationFn: () => {
      if (!activeColumnId) throw new Error('Kein Kanal gewählt.');
      return createCardApi({
        column_id: activeColumnId,
        title: title.trim(),
        link_url: source.linkUrl,
        description_md: source.descriptionMd,
        source_event_id: source.sourceEventId ?? null,
        source_publication_id: source.sourcePublicationId ?? null,
        items: source.checklist.map((text) => ({ kind: 'checklist', text })),
      });
    },
    onSuccess: (card) => {
      const slug = activeBoard!.slug;
      qc.invalidateQueries({ queryKey: QK.boards });
      qc.invalidateQueries({ queryKey: QK.board(slug) });
      qc.invalidateQueries({
        queryKey: QK.cardsForSource(
          source.kind,
          (source.sourceEventId ?? source.sourcePublicationId)!,
        ),
      });
      toast.success('Karte im Board angelegt.', {
        action: {
          label: 'Öffnen',
          onClick: () => router.push(cardDeepLink({ board_slug: slug, id: card.id })),
        },
      });
      onCreated?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    !!activeColumnId && title.trim().length > 0 && !create.isPending && !viewQ.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Karte aus {KIND_LABEL[source.kind]} anlegen</DialogTitle>
          <DialogDescription>
            Die Karte wird mit den Daten der {KIND_LABEL[source.kind]} vorbefüllt und
            bleibt mit ihr verknüpft.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="triage-card-title">Titel</Label>
            <Input
              id="triage-card-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Titel der Karte"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Board</Label>
              <Select
                value={activeBoardId ?? undefined}
                onValueChange={(v) => {
                  setBoardId(v);
                  setColumnId(null); // Spaltenwahl beim Boardwechsel zurücksetzen
                }}
                disabled={boardsQ.isPending || boards.length === 0}
              >
                <SelectTrigger aria-label="Board">
                  <SelectValue placeholder="Board wählen" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Kanal</Label>
              <Select
                value={activeColumnId ?? undefined}
                onValueChange={setColumnId}
                disabled={viewQ.isPending || columns.length === 0}
              >
                <SelectTrigger aria-label="Kanal">
                  <SelectValue placeholder="Kanal wählen" />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vorschau der Vorbefüllung */}
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
            {source.linkUrl && (
              <a
                href={source.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {KIND_LABEL[source.kind]}-Link
              </a>
            )}
            {source.checklist.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-muted-foreground">
                  <ListChecks className="h-3.5 w-3.5" />
                  Checkliste ({source.checklist.length})
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {source.checklist.map((t) => (
                    <li
                      key={t}
                      className="rounded-md bg-background px-2 py-0.5 text-xs text-foreground ring-1 ring-border"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!source.linkUrl && source.checklist.length === 0 && (
              <span className="text-muted-foreground">Beschreibung wird vorbefüllt.</span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => create.mutate()} disabled={!canSubmit}>
            {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Karte anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
