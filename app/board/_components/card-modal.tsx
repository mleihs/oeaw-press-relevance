'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Check,
  CheckCircle2,
  ListChecks,
  ListTree,
  Link as LinkIcon,
  SquareArrowOutUpRight,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/shared/utils';
import { QK } from '@/lib/client/query-keys';
import type { BoardColumn, BoardMember, CardDetail, CardItem } from '@/lib/shared/board';
import {
  fetchCard,
  patchCardApi,
  addItemApi,
  patchItemApi,
  deleteItemApi,
  convertItemApi,
  moveCardApi,
  addWatcherApi,
  removeWatcherApi,
} from '../_lib/api';
import { ChannelIcon } from '../_lib/channels';
import { formatDateTimeMeta, relativeDay } from '../_lib/due';
import { BoardAvatar } from './board-avatar';
import { displayNameOf, membersById } from '../_lib/people';
import { activityPhrase, ActivityIcon } from './activity-line';
import { CardMovePopover } from './card-move-popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NONE = '__none__';

export function CardModal({
  cardId,
  boardSlug,
  columns,
  members,
  onClose,
  onOpenCard,
}: {
  cardId: string;
  boardSlug: string;
  columns: BoardColumn[];
  members: BoardMember[];
  onClose: () => void;
  onOpenCard: (id: string) => void;
}) {
  const qc = useQueryClient();
  const byId = useMemo(() => membersById(members), [members]);
  const { data: card, isPending } = useQuery({
    queryKey: QK.card(cardId),
    queryFn: () => fetchCard(cardId),
    staleTime: 5_000,
  });

  // ['board'] als Prefix invalidiert JEDES ['board', slug] — nötig, weil ein
  // Move die Karte in ein anderes Board schieben kann (dessen Cache sonst bis
  // zur staleTime alt bliebe); QK.boards deckt die Zähler in Übersicht/Switcher.
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK.card(cardId) });
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: QK.boards });
  };
  const applyCard = (updated: CardDetail) => {
    qc.setQueryData(QK.card(cardId), updated);
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: QK.boards });
  };

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ein offenes Radix-Select/-Popover ruft bei Escape preventDefault auf —
      // dann NICHT das ganze Modal schließen (sonst gehen ungesicherte Edits
      // verloren); nur das genestete Layer soll sich schließen.
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Backdrop schließt nur, wenn mousedown UND mouseup direkt auf dem Overlay
  // liegen — sonst schließt ein Text-Auswahl-Drag, der über dem Backdrop endet,
  // versehentlich das Modal (der Klick-Target ist dann der gemeinsame Vorfahr).
  const downOnOverlay = useRef(false);

  const column = card ? columns.find((c) => c.id === card.column_id) : undefined;
  const accent = column?.color ?? '#64748b';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-11"
      style={{ backgroundColor: 'rgba(13,36,80,.42)' }}
      onMouseDown={(e) => {
        downOnOverlay.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnOverlay.current) onClose();
      }}
    >
      <div
        className="w-full max-w-[840px] overflow-hidden rounded-2xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {isPending || !card ? (
          <div className="p-10 text-center text-sm text-muted-foreground">Lädt…</div>
        ) : (
          <>
            {/* Header */}
            <div
              className="flex items-center gap-2 border-b px-5 py-4"
              style={{ backgroundColor: `${accent}14` }}
            >
              {column && (
                <ChannelIcon name={column.name} className="h-[18px] w-[18px]" style={{ color: accent }} />
              )}
              <span
                className="rounded-md border bg-card px-2 py-0.5 text-[12.5px] font-semibold"
                style={{ borderColor: `${accent}33`, color: accent }}
              >
                {column?.name ?? 'Kanal'}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <CardMovePopover
                  card={card}
                  currentSlug={boardSlug}
                  columns={columns}
                  onMove={async (columnId) => {
                    const updated = await moveCardApi(cardId, columnId);
                    applyCard(updated);
                  }}
                />
                <CompleteButton card={card} onDone={applyCard} />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Schließen"
                  className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex max-h-[calc(100vh-180px)] flex-col md:flex-row">
              <div className="flex-1 overflow-y-auto p-6">
                <MainColumn
                  key={card.id}
                  card={card}
                  members={byId}
                  onPatch={applyCard}
                  onInvalidate={invalidate}
                  onOpenCard={onOpenCard}
                  columns={columns}
                />
              </div>
              <div className="w-full shrink-0 overflow-y-auto border-t bg-muted/30 p-5 md:w-[248px] md:border-l md:border-t-0">
                <Sidebar
                  key={card.id}
                  card={card}
                  members={members}
                  byId={byId}
                  onPatch={applyCard}
                  onInvalidate={invalidate}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CompleteButton({ card, onDone }: { card: CardDetail; onDone: (c: CardDetail) => void }) {
  const completed = card.completed_at !== null;
  const m = useMutation({
    mutationFn: () => patchCardApi(card.id, { completed: !completed }),
    onSuccess: onDone,
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      onClick={() => m.mutate()}
      disabled={m.isPending}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium transition-colors',
        completed
          ? 'border-transparent bg-emerald-50 text-emerald-700'
          : 'border-input bg-card text-foreground hover:bg-muted',
      )}
    >
      <CheckCircle2 className="h-4 w-4" />
      {completed ? 'Abgeschlossen' : 'Abschließen'}
    </button>
  );
}

function MainColumn({
  card,
  members,
  onPatch,
  onInvalidate,
  onOpenCard,
  columns,
}: {
  card: CardDetail;
  members: Map<string, BoardMember>;
  onPatch: (c: CardDetail) => void;
  onInvalidate: () => void;
  onOpenCard: (id: string) => void;
  columns: BoardColumn[];
}) {
  // Lokaler Editier-Zustand. MainColumn wird per key={card.id} remountet, wenn
  // eine andere Karte geöffnet wird — daher kein Prop-Sync-Effekt nötig.
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState(card.description_md ?? '');

  const saveField = useMutation({
    mutationFn: (patch: { title?: string; description_md?: string | null }) =>
      patchCardApi(card.id, patch),
    onSuccess: onPatch,
    onError: (e: Error) => toast.error(e.message),
  });

  const checklist = card.items.filter((i) => i.kind === 'checklist');
  const subtasks = card.items.filter((i) => i.kind === 'subtask');

  return (
    <div className="space-y-5">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== card.title && saveField.mutate({ title: title.trim() })}
        className="w-full border-none bg-transparent text-[21px] font-bold tracking-tight text-foreground outline-none"
      />

      {card.link_url && (
        <a
          href={card.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-1 text-[13px] font-medium text-brand hover:underline"
        >
          <LinkIcon className="h-3.5 w-3.5" />
          {card.link_url.replace(/^https?:\/\//, '').slice(0, 60)}
        </a>
      )}

      <Textarea
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        onBlur={() => desc !== (card.description_md ?? '') && saveField.mutate({ description_md: desc || null })}
        placeholder="Beschreibung (Markdown)…"
        className="min-h-[80px] resize-y text-[13.5px] leading-relaxed"
      />

      <ItemSection
        card={card}
        kind="checklist"
        items={checklist}
        title="Checkliste"
        icon={ListChecks}
        accent="#0047bb"
        onInvalidate={onInvalidate}
        onOpenCard={onOpenCard}
        columns={columns}
      />
      <ItemSection
        card={card}
        kind="subtask"
        items={subtasks}
        title="Unteraufgaben"
        icon={ListTree}
        accent="#7c3aed"
        onInvalidate={onInvalidate}
        onOpenCard={onOpenCard}
        columns={columns}
      />

      {/* Aktivität (Phase 3 ergänzt Kommentare) */}
      <div className="border-t pt-4">
        <div className="mb-3 text-[13.5px] font-semibold text-foreground">Aktivität</div>
        <ul className="space-y-2.5">
          {[...card.activity].reverse().map((a) => {
            return (
              <li key={a.id} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                  <ActivityIcon verb={a.verb} className="h-3.5 w-3.5" />
                </span>
                <span>
                  <span className="font-medium text-foreground">
                    {displayNameOf(members.get(a.actor_id))}
                  </span>{' '}
                  {activityPhrase(a)} · {relativeDay(a.created_at)}
                </span>
              </li>
            );
          })}
          {card.activity.length === 0 && (
            <li className="text-[13px] text-muted-foreground">Noch keine Aktivität.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function ItemSection({
  card,
  kind,
  items,
  title,
  icon: Icon,
  accent,
  onInvalidate,
  onOpenCard,
  columns,
}: {
  card: CardDetail;
  kind: 'checklist' | 'subtask';
  items: CardItem[];
  title: string;
  icon: typeof ListChecks;
  accent: string;
  onInvalidate: () => void;
  onOpenCard: (id: string) => void;
  columns: BoardColumn[];
}) {
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
        <span className="text-[13.5px] font-semibold text-foreground">{title}</span>
        {items.length > 0 && (
          <span className="font-mono text-[11px] text-muted-foreground">
            {done} / {items.length}
          </span>
        )}
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
                'flex-1 text-[13.5px] leading-snug',
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
                  className="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand"
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
          className="flex-1 border-none bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(13,36,80,.42)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-base font-semibold text-foreground">Als eigene Karte anlegen</div>
        <p className="mb-4 text-sm text-muted-foreground">
          Aus der Unteraufgabe „{item.text}" wird eine geplante Karte.
        </p>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Ziel-Kanal
            </label>
            <Select value={columnId} onValueChange={setColumnId}>
              <SelectTrigger>
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
            <label className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Fälligkeit (optional)
            </label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => convert.mutate()}
            disabled={convert.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90"
          >
            <Check className="h-4 w-4" /> Umwandeln
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  card,
  members,
  byId,
  onPatch,
  onInvalidate,
}: {
  card: CardDetail;
  members: BoardMember[];
  byId: Map<string, BoardMember>;
  onPatch: (c: CardDetail) => void;
  onInvalidate: () => void;
}) {
  const activeMembers = members.filter((m) => !m.disabled_at);
  // UTC-Datumsteil (das Datum wird als UTC-Mitternacht gespeichert). Lokaler
  // Editier-Zustand + Commit erst onBlur — ein `type=date` feuert onChange
  // während der Tastatureingabe mit leeren Zwischenwerten (Sidebar wird per
  // key={card.id} remountet, daher initialisiert `due` frisch pro Karte).
  const dueValue = card.due_at ? new Date(card.due_at).toISOString().slice(0, 10) : '';
  const [due, setDue] = useState(dueValue);

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
        <Input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          onBlur={() => {
            if (due !== dueValue) patchDue.mutate(due);
          }}
          className="h-9"
        />
      </SidebarField>

      <SidebarField label="Zuständig">
        <Select value={card.assignee_id ?? NONE} onValueChange={(v) => patchAssignee.mutate(v)}>
          <SelectTrigger className="h-9">
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

      <SidebarField label="Beobachter">
        <div className="space-y-1.5">
          {card.watcher_ids.map((id) => (
            <div key={id} className="flex items-center gap-2">
              <BoardAvatar member={byId.get(id)} size={24} />
              <span className="flex-1 truncate text-[13px] text-foreground">
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
              <SelectTrigger className="h-8 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Beobachter
                </span>
              </SelectTrigger>
              <SelectContent>
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

      <div className="space-y-0.5 border-t pt-4 font-mono text-[11px] text-muted-foreground">
        <div>Erstellt · {formatDateTimeMeta(card.created_at)}</div>
        <div>Geändert · {relativeDay(card.updated_at)}</div>
      </div>
    </div>
  );
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
