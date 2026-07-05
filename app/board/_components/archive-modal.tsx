'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Archive, RotateCcw, CheckCircle2, Search } from '@/lib/icons';
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
 * Archiv-Ansicht eines Boards (Feature 4, MeisterTask „Archivierte Aufgaben").
 * Borgt sich die Board-Sprache: Karten mit Kanal-Akzentkante, nach Kanal
 * gruppiert, Suche + Zähler im Kopf, relatives Datum. „Zurückholen" holt eine
 * Karte in ihren ursprünglichen Kanal zurück (column_id bleibt beim Archivieren
 * erhalten).
 */

/** „archiviert am 5. Jul 2026" ist präzise, aber sperrig — im Fluss lieber
 *  relativ; der exakte Zeitpunkt hängt im title-Tooltip. */
function relativeArchived(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'heute';
  if (days === 1) return 'gestern';
  if (days < 7) return `vor ${days} Tagen`;
  if (days < 14) return 'vor 1 Woche';
  if (days < 56) return `vor ${Math.floor(days / 7)} Wochen`;
  const months = Math.floor(days / 30);
  return months <= 1 ? 'vor 1 Monat' : `vor ${months} Monaten`;
}

interface ChannelGroup {
  columnId: string;
  name: string;
  color: string;
  cards: ArchivedCard[];
}

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
  const [query, setQuery] = useState('');

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

  // Nach Titel filtern (client-seitig über die schon geladene Liste), dann nach
  // Kanal gruppieren. cards kommt archived_at DESC → Gruppen erscheinen in der
  // Reihenfolge ihrer jeweils jüngsten Archivierung.
  const groups = useMemo<ChannelGroup[]>(() => {
    const q = query.trim().toLowerCase();
    const list = q ? cards.filter((c) => c.title.toLowerCase().includes(q)) : cards;
    const byCol = new Map<string, ChannelGroup>();
    const out: ChannelGroup[] = [];
    for (const c of list) {
      let g = byCol.get(c.column_id);
      if (!g) {
        g = { columnId: c.column_id, name: c.column_name, color: c.column_color, cards: [] };
        byCol.set(c.column_id, g);
        out.push(g);
      }
      g.cards.push(c);
    }
    return out;
  }, [cards, query]);

  const hasCards = cards.length > 0;
  const noResults = hasCards && groups.length === 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-brand" />
            Archiv
            {hasCards && (
              <span className="ml-0.5 rounded-full bg-brand/10 px-2 py-0.5 font-mono text-[11px] font-bold text-brand">
                {cards.length}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            Archivierte Karten sind aus dem Board raus, aber erhalten.
            „Zurückholen" bringt sie in ihren Kanal zurück.
          </DialogDescription>
        </DialogHeader>

        {hasCards && (
          <div className="flex items-center gap-2 rounded-lg bg-fill px-2.5 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Im Archiv suchen…"
              aria-label="Im Archiv suchen"
              className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
        )}

        <div className="-mr-1 max-h-[60vh] overflow-y-auto pr-1">
          {isPending ? (
            <div className="py-8 text-center text-sm text-ink-subtle">Lädt…</div>
          ) : !hasCards ? (
            <EmptyArchive />
          ) : noResults ? (
            <div className="py-8 text-center text-sm text-ink-subtle">
              Keine archivierte Karte passt zu „{query.trim()}".
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.columnId}>
                <div
                  className="flex items-center gap-2 px-1 pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-wider"
                  style={{ color: `color-mix(in srgb, ${g.color} 62%, var(--foreground))` }}
                >
                  <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: g.color }} />
                  {g.name}
                  <span className="ml-auto font-mono text-ink-muted">{g.cards.length}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {g.cards.map((c) => (
                    <ArchivedRow
                      key={c.id}
                      card={c}
                      onRestore={() => restore.mutate(c.id)}
                      pending={restore.isPending}
                    />
                  ))}
                </ul>
              </div>
            ))
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
    <li
      className="relative flex items-center gap-3 rounded-[10px] border border-line bg-surface py-2.5 pl-3.5 pr-3 shadow-card transition-[box-shadow,transform,border-color] hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover"
    >
      {/* Kanal-Akzentkante wie auf den Board-Karten (CardChip). */}
      <span
        className="absolute inset-y-2 left-0 w-[3px] rounded-full"
        style={{ backgroundColor: card.column_color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink-heading">{card.title}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-subtle">
          {card.completed_at && (
            <span className="inline-flex items-center gap-1 font-medium text-success">
              <CheckCircle2 className="h-3 w-3" />
              erledigt
            </span>
          )}
          {card.completed_at && <span className="text-ink-muted">·</span>}
          <span className="font-mono" title={`archiviert am ${formatDateTimeMeta(card.archived_at)}`}>
            {relativeArchived(card.archived_at)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={onRestore}
        disabled={pending}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand/10 px-2.5 py-1.5 text-[11.5px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Zurückholen
      </button>
    </li>
  );
}

function EmptyArchive() {
  return (
    <div className="flex flex-col items-center gap-2.5 py-9 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-fill text-ink-muted">
        <Archive className="h-5 w-5" />
      </span>
      <b className="text-[13.5px] font-semibold text-ink-strong">Noch nichts archiviert</b>
      <span className="max-w-[32ch] text-xs text-ink-subtle">
        Erledigte Karten wandern per „Abgeschlossene archivieren" hierher und
        halten so die Kanäle aufgeräumt, ohne dass etwas gelöscht wird.
      </span>
    </div>
  );
}
