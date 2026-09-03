'use client';

// Header-Bausteine des Karten-Modals: Abschließen-Button, „von {Person}"-Zeile
// im Abgeschlossen-Kopf und das „…"-Überlaufmenü. Aus card-modal.tsx entlang
// der bestehenden Funktionsgrenzen herausgelöst (Verhalten/Markup 1:1).
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  Trash2,
  MoreHorizontal,
  Copy,
  Archive,
  RotateCcw,
} from '@/lib/icons';
import { toast } from 'sonner';
import type { BoardMember, CardDetail } from '@/lib/shared/board';
import { patchCardApi, deleteCardApi } from '../_lib/api';
import { cardDeepLink } from '@/lib/shared/board';
import { BoardAvatar } from './board-avatar';
import { displayNameOf } from '../_lib/people';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';

export function CompleteButton({
  card,
  onDone,
  onCompleted,
}: {
  card: CardDetail;
  onDone: (c: CardDetail) => void;
  /** Feuert nur beim Übergang offen → abgeschlossen (Celebration). */
  onCompleted: () => void;
}) {
  const completed = card.completed_at !== null;
  const m = useMutation({
    mutationFn: () => patchCardApi(card.id, { completed: !completed }),
    onSuccess: (updated) => {
      onDone(updated);
      if (!completed) onCompleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (completed) {
    return (
      <button
        type="button"
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-500/40 bg-white px-3 text-sm font-semibold text-emerald-600 transition-colors hover:bg-emerald-50 dark:bg-card dark:text-emerald-400 dark:hover:bg-emerald-500/10"
      >
        <RotateCcw className="h-4 w-4" />
        <span className="max-md:hidden">Wieder öffnen</span>
        <span className="md:hidden">Öffnen</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => m.mutate()}
      disabled={m.isPending}
      className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:border-emerald-800 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
    >
      <CheckCircle2 className="h-4 w-4" />
      Abschließen
    </button>
  );
}

/** „von {Avatar} {Name}" im Abgeschlossen-Kopf. Die abschließende Person kommt
 *  aus dem Aktivitätslog (letzter 'completed'-Eintrag); Fallback: Zuständige*r,
 *  dann Ersteller*in. */
export function CompleterLine({ card, byId }: { card: CardDetail; byId: Map<string, BoardMember> }) {
  const completedEntry = [...card.activity]
    .reverse()
    .find((a) => a.verb === 'completed');
  // Gibt es einen Log-Eintrag, zählt NUR dessen Akteur — der Fallback auf
  // Zuständige:n/Ersteller:in würde sonst die falsche Person als
  // abschließend ausweisen (z. B. gelöschtes Konto). Fallback nur für
  // Alt-Karten, die vor dem Aktivitätslog abgeschlossen wurden.
  const completer = completedEntry
    ? byId.get(completedEntry.actor_id)
    : (byId.get(card.assignee_id ?? '') ?? byId.get(card.created_by));
  if (!completer) return null;
  return (
    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-emerald-600">
      von <BoardAvatar member={completer} size={18} />
      <span className="truncate font-semibold">{displayNameOf(completer)}</span>
    </div>
  );
}

/** „…"-Überlaufmenü im Modal-Header (MeisterTask-Pendant: Verschieben/
 *  Duplizieren/Abschließen/Löschen …). Verschieben + Abschließen stehen bei uns
 *  als eigene Header-Buttons; hier die Aktionen ohne primären Platz: Deep-Link
 *  kopieren und die Karte löschen (bisher gab es dafür gar keinen UI-Pfad). */
export function CardActionsMenu({
  card,
  boardSlug,
  onDeleted,
  onInvalidate,
}: {
  card: CardDetail;
  boardSlug: string;
  onDeleted: () => void;
  onInvalidate: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const copyLink = async () => {
    const url = `${window.location.origin}${cardDeepLink({ board_slug: boardSlug, id: card.id })}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link kopiert');
    } catch {
      toast.error('Link konnte nicht kopiert werden');
    }
  };

  const del = useMutation({
    mutationFn: () => deleteCardApi(card.id),
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success('Karte gelöscht');
      onInvalidate();
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Archivieren/Wiederherstellen (Feature 4): archivieren nimmt die Karte aus
  // dem Board (Modal schließt); wiederherstellen holt sie in ihren Kanal zurück.
  const isArchived = card.archived_at !== null;
  const archive = useMutation({
    mutationFn: () => patchCardApi(card.id, { archived: !isArchived }),
    onSuccess: () => {
      onInvalidate();
      if (isArchived) {
        toast.success('Wiederhergestellt.');
      } else {
        toast.success('Archiviert.');
        onDeleted();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Weitere Aktionen"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => void copyLink()}>
            <Copy className="h-4 w-4" />
            Link kopieren
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => archive.mutate()}>
            {isArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
            {isArchived ? 'Wiederherstellen' : 'Archivieren'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={(e) => {
              e.preventDefault();
              setConfirmOpen(true);
            }}
          >
            <Trash2 className="h-4 w-4" />
            Karte löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Karte löschen?</DialogTitle>
            <DialogDescription>
              „{card.title}" wird endgültig gelöscht, inklusive Checkliste,
              Kommentaren und Anhängen. Das lässt sich nicht rückgängig machen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={del.isPending}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
