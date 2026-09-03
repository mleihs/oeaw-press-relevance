'use client';

// Checkliste/Unteraufgaben des Karten-Modals: Fortschritts-Ring, Item-Sektion
// und der „Als eigene Karte anlegen"-Dialog. Aus card-modal.tsx entlang der
// bestehenden Funktionsgrenzen herausgelöst (Verhalten/Markup 1:1);
// card/onInvalidate kommen aus dem CardModalContext statt per Props-Drilling.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, ListChecks, SquareArrowOutUpRight, Plus, Trash2 } from '@/lib/icons';
import { toast } from 'sonner';
import { cn } from '@/lib/shared/utils';
import type { BoardColumn, CardDetail, CardItem } from '@/lib/shared/board';
import { addItemApi, patchItemApi, deleteItemApi, convertItemApi } from '../_lib/api';
import { useCardModal } from './card-modal-context';
import { DueDatePicker } from './due-date-picker';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Kleiner Fortschritts-Ring für Checkliste/Unteraufgaben: der Blick erfasst den
 *  Stand sofort (statt nur „3/5"). Fährt in der Sektionsfarbe hoch, springt bei
 *  Vollständigkeit auf Grün. Track sitzt auf dem Board-Chip-Token (warm in
 *  „Atmosphäre"). r=15 → Umfang 2πr ≈ 94.25. */
function ProgressRing({ done, total, color }: { done: number; total: number; color: string }) {
  const circumference = 2 * Math.PI * 15;
  const pct = total > 0 ? done / total : 0;
  const complete = total > 0 && done >= total;
  return (
    <span className="ml-auto flex items-center gap-1.5 font-mono text-2xs text-muted-foreground">
      <svg viewBox="0 0 36 36" className="h-[22px] w-[22px] -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r="15" fill="none" stroke="var(--board-chip-bg)" strokeWidth="4" />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          stroke={complete ? '#059669' : color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
      {done} / {total}
    </span>
  );
}

export function ItemSection({
  kind,
  items,
  title,
  icon: Icon,
  accent,
  onOpenCard,
  columns,
}: {
  kind: 'checklist' | 'subtask';
  items: CardItem[];
  title: string;
  icon: typeof ListChecks;
  accent: string;
  onOpenCard: (id: string) => void;
  columns: BoardColumn[];
}) {
  const { card, onInvalidate } = useCardModal();
  const [text, setText] = useState('');
  const [convertItem, setConvertItem] = useState<CardItem | null>(null);
  const done = items.filter((i) => i.done_at).length;

  const add = useMutation({
    mutationFn: (value: string) => addItemApi(card.id, kind, value),
    onSuccess: () => {
      setText('');
      onInvalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) => patchItemApi(id, { done: next }),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteItemApi(id),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4" style={{ color: accent }} />
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {items.length > 0 && <ProgressRing done={done} total={items.length} color={accent} />}
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggle.mutate({ id: item.id, next: !item.done_at })}
              className={cn(
                'flex h-[19px] w-[19px] shrink-0 items-center justify-center border',
                kind === 'subtask' ? 'rounded-full' : 'rounded-md',
                item.done_at ? 'border-brand bg-brand text-white' : 'border-input',
              )}
              aria-label={item.done_at ? 'Als offen markieren' : 'Abhaken'}
            >
              {item.done_at && <Check className="h-3 w-3" />}
            </button>
            <span
              className={cn(
                'flex-1 text-sm leading-snug',
                item.done_at ? 'text-muted-foreground line-through' : 'text-foreground',
              )}
            >
              {item.text}
            </span>
            {kind === 'subtask' &&
              (item.converted_card_id ? (
                <button
                  type="button"
                  onClick={() => onOpenCard(item.converted_card_id!)}
                  className="rounded bg-brand/10 px-1.5 py-0.5 text-2xs font-medium text-brand"
                >
                  Karte öffnen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConvertItem(item)}
                  className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-brand group-hover:opacity-100"
                  title="Als eigene Karte anlegen"
                >
                  <SquareArrowOutUpRight className="h-3.5 w-3.5" />
                </button>
              ))}
            <button
              type="button"
              onClick={() => remove.mutate(item.id)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
              title="Löschen"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className={cn(
            'flex h-[19px] w-[19px] shrink-0 items-center justify-center border border-dashed border-input text-muted-foreground',
            kind === 'subtask' ? 'rounded-full' : 'rounded-md',
          )}
        >
          <Plus className="h-3 w-3" />
        </span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && text.trim() && !add.isPending) add.mutate(text.trim());
          }}
          placeholder={kind === 'subtask' ? 'Unteraufgabe hinzufügen…' : 'Eintrag hinzufügen, Enter zum Speichern…'}
          className="flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {convertItem && (
        <ConvertDialog
          item={convertItem}
          columns={columns}
          defaultColumnId={card.column_id}
          onClose={() => setConvertItem(null)}
          onConverted={(newCard) => {
            setConvertItem(null);
            onInvalidate();
            onOpenCard(newCard.id);
          }}
        />
      )}
    </div>
  );
}

function ConvertDialog({
  item,
  columns,
  defaultColumnId,
  onClose,
  onConverted,
}: {
  item: CardItem;
  columns: BoardColumn[];
  defaultColumnId: string;
  onClose: () => void;
  onConverted: (card: CardDetail) => void;
}) {
  const [columnId, setColumnId] = useState(defaultColumnId);
  const [dueAt, setDueAt] = useState('');
  const convert = useMutation({
    mutationFn: () => convertItemApi(item.id, columnId, dueAt || null),
    onSuccess: onConverted,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Als eigene Karte anlegen</DialogTitle>
          <DialogDescription>
            Aus der Unteraufgabe „{item.text}" wird eine geplante Karte.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-2xs uppercase tracking-wider text-muted-foreground">
              Ziel-Kanal
            </label>
            <Select value={columnId} onValueChange={setColumnId}>
              <SelectTrigger aria-label="Ziel-Kanal">
                <SelectValue />
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
          <div>
            <label className="mb-1 block font-mono text-2xs uppercase tracking-wider text-muted-foreground">
              Fälligkeit (optional)
            </label>
            <DueDatePicker value={dueAt} onChange={setDueAt} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            <Check className="mr-1 h-4 w-4" /> Umwandeln
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
