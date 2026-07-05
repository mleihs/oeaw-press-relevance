'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, RotateCcw, CheckCircle2 } from '@/lib/icons';
import { QK } from '@/lib/client/query-keys';
import type { ArchivedCard } from '@/lib/shared/board';
import { fetchArchivedCards, patchCardApi } from '../_lib/api';
import { formatDateTimeMeta } from '../_lib/due';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

/**
 * Archiv-Ansicht eines Boards (Feature 4, MeisterTask „Archivierte Aufgaben"):
 * listet archivierte Karten mit Herkunfts-Kanal + Archivdatum; „Wiederherstellen"
 * holt die Karte in ihren ursprünglichen Kanal zurück (column_id bleibt beim
 * Archivieren erhalten).
 */
export function ArchiveModal({
  boardId,
  boardSlug,
  onClose,
}: {
  boardId: string;
  boardSlug: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const archiveKey = ['board-archive', boardId] as const;

  const { data: cards = [], isPending } = useQuery({
    queryKey: archiveKey,
    queryFn: () => fetchArchivedCards(boardId),
  });

  const restore = useMutation({
    mutationFn: (cardId: string) => patchCardApi(cardId, { archived: false }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: archiveKey });
      qc.invalidateQueries({ queryKey: QK.board(boardSlug) });
      qc.invalidateQueries({ queryKey: QK.boards });
      toast.success('Wiederhergestellt.');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground/70" />
            Archiv
          </DialogTitle>
          <DialogDescription>
            Archivierte Karten sind aus dem Board raus, aber erhalten.
            „Wiederherstellen" holt sie in ihren Kanal zurück.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isPending ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Lädt…</div>
          ) : cards.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Keine archivierten Karten.
            </div>
          ) : (
            <ul className="divide-y">
              {cards.map((c) => (
                <ArchivedRow key={c.id} card={c} onRestore={() => restore.mutate(c.id)} pending={restore.isPending} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ArchivedRow({
  card,
  onRestore,
  pending,
}: {
  card: ArchivedCard;
  onRestore: () => void;
  pending: boolean;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {card.completed_at && (
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label="erledigt" />
          )}
          <span className="truncate text-sm font-medium text-foreground">{card.title}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className="inline-flex items-center rounded-full px-1.5 py-0.5 font-medium"
            style={{
              backgroundColor: `color-mix(in srgb, ${card.column_color} 18%, transparent)`,
              color: `color-mix(in srgb, ${card.column_color} 62%, var(--foreground))`,
            }}
          >
            {card.column_name}
          </span>
          <span>archiviert am {formatDateTimeMeta(card.archived_at)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={pending}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground disabled:opacity-50 dark:hover:bg-white/10"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Wiederherstellen
      </button>
    </li>
  );
}
