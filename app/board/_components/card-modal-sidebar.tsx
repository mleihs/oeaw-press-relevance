'use client';

// Sidebar des Karten-Modals: Fälligkeit, Zuständigkeit, Labels, Beobachter,
// Meta-Zeitstempel. Aus card-modal.tsx entlang der bestehenden Funktions-
// grenzen herausgelöst (Verhalten/Markup 1:1); die stabilen Werte kommen aus
// dem CardModalContext statt per Props-Drilling.
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Plus, Tag } from '@/lib/icons';
import { toast } from 'sonner';
import type { BoardLabel } from '@/lib/shared/board';
import {
  patchCardApi,
  addWatcherApi,
  removeWatcherApi,
  addCardLabelApi,
  removeCardLabelApi,
  createLabelApi,
} from '../_lib/api';
import { useCardModal } from './card-modal-context';
import { LabelPill } from './label-pill';
import { formatDateTimeMeta, relativeDay } from '../_lib/due';
import { BoardAvatar } from './board-avatar';
import { displayNameOf } from '../_lib/people';
import { DueDatePicker } from './due-date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

const NONE = '__none__';

export function Sidebar({ boardId, labels }: { boardId: string; labels: BoardLabel[] }) {
  const { card, members, byId, onPatch, onInvalidate } = useCardModal();
  const activeMembers = members.filter((m) => !m.disabled_at);
  // UTC-Datumsteil (das Datum wird als UTC-Mitternacht gespeichert). Der
  // Picker committet direkt bei Auswahl — kein lokaler Editier-Zustand nötig.
  const dueValue = card.due_at ? new Date(card.due_at).toISOString().slice(0, 10) : '';

  const patchDue = useMutation({
    mutationFn: (v: string) => patchCardApi(card.id, { due_at: v || null }),
    onSuccess: onPatch,
    onError: (e: Error) => toast.error(e.message),
  });
  const patchAssignee = useMutation({
    mutationFn: (v: string) => patchCardApi(card.id, { assignee_id: v === NONE ? null : v }),
    onSuccess: onPatch,
    onError: (e: Error) => toast.error(e.message),
  });
  const addW = useMutation({
    mutationFn: (userId: string) => addWatcherApi(card.id, userId),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const removeW = useMutation({
    mutationFn: (userId: string) => removeWatcherApi(card.id, userId),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const notWatching = activeMembers.filter((m) => !card.watcher_ids.includes(m.id));

  return (
    <div className="space-y-5">
      <SidebarField label="Fälligkeit">
        <DueDatePicker
          value={dueValue}
          onChange={(v) => {
            if (v !== dueValue) patchDue.mutate(v);
          }}
        />
      </SidebarField>

      <SidebarField label="Zuständig">
        <Select value={card.assignee_id ?? NONE} onValueChange={(v) => patchAssignee.mutate(v)}>
          <SelectTrigger className="h-9" aria-label="Zuständige Person">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Niemand · optional</SelectItem>
            {activeMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {displayNameOf(m)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SidebarField>

      <LabelsField boardId={boardId} labels={labels} />

      <SidebarField label="Beobachter">
        <div className="space-y-1.5">
          {card.watcher_ids.map((id) => (
            <div key={id} className="flex items-center gap-2">
              <BoardAvatar member={byId.get(id)} size={24} />
              <span className="flex-1 truncate text-sm text-foreground">
                {displayNameOf(byId.get(id))}
              </span>
              <button
                type="button"
                onClick={() => removeW.mutate(id)}
                className="text-muted-foreground hover:text-red-600"
                aria-label="Beobachter entfernen"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {notWatching.length > 0 && (
            <Select value="" onValueChange={(v) => v && addW.mutate(v)}>
              <SelectTrigger className="h-8 text-sm text-muted-foreground" aria-label="Beobachter hinzufügen">
                <span className="inline-flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Beobachter
                </span>
              </SelectTrigger>
              {/* position="popper" zwingend: der item-aligned-Default braucht
                  einen AUSGEWÄHLTEN Wert für die Positionierung — mit value=""
                  landete die Liste unpositioniert oben links (User-Report). */}
              <SelectContent position="popper">
                {notWatching.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {displayNameOf(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </SidebarField>

      <div className="space-y-0.5 border-t pt-4 font-mono text-2xs text-muted-foreground">
        <div>Erstellt · {formatDateTimeMeta(card.created_at)}</div>
        <div>Geändert · {relativeDay(card.updated_at)}</div>
      </div>
    </div>
  );
}

/** Labels/Tags an der Karte: aktuelle als entfernbare Pills + Popover zum
 *  Hinzufügen vorhandener Board-Labels oder Anlegen eines neuen. Nach jeder
 *  Mutation `onInvalidate` (Karte + Board neu laden → Chip-Pills + Palette). */
function LabelsField({ boardId, labels }: { boardId: string; labels: BoardLabel[] }) {
  const { card, onInvalidate } = useCardModal();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const assigned = labels.filter((l) => card.label_ids.includes(l.id));
  const available = labels.filter((l) => !card.label_ids.includes(l.id));

  const add = useMutation({
    mutationFn: (labelId: string) => addCardLabelApi(card.id, labelId),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (labelId: string) => removeCardLabelApi(card.id, labelId),
    onSuccess: onInvalidate,
    onError: (e: Error) => toast.error(e.message),
  });
  const create = useMutation({
    mutationFn: async (name: string) => {
      const label = await createLabelApi(boardId, name);
      await addCardLabelApi(card.id, label.id);
    },
    onSuccess: () => {
      setDraft('');
      onInvalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <SidebarField label="Labels">
      <div className="flex flex-wrap items-center gap-1.5">
        {assigned.map((l) => (
          <LabelPill key={l.id} label={l} onRemove={() => remove.mutate(l.id)} />
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-input px-1.5 py-0.5 text-2xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Tag className="h-3 w-3" /> Label
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 space-y-2 p-2">
            {available.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {available.map((l) => (
                  <button key={l.id} type="button" onClick={() => add.mutate(l.id)} disabled={add.isPending}>
                    <LabelPill label={l} />
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1.5 border-t pt-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && draft.trim() && !create.isPending) create.mutate(draft.trim());
                }}
                placeholder="Neues Label…"
                maxLength={60}
                className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => draft.trim() && create.mutate(draft.trim())}
                disabled={!draft.trim() || create.isPending}
                aria-label="Label anlegen"
                className="rounded p-1 text-brand hover:bg-brand/10 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </SidebarField>
  );
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
