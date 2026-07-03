'use client';

import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog as DialogPrimitive } from 'radix-ui';
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
  Pencil,
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
import { PROSE_CLASS } from '../_lib/prose';
import { formatDateTimeMeta, relativeDay } from '../_lib/due';
import { BoardAvatar } from './board-avatar';
import { displayNameOf, membersById } from '../_lib/people';
import { CommentActivityStrand } from './comment-strand';
import { AttachmentsSection } from './attachments-section';
import { CardMovePopover } from './card-move-popover';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

  const column = card ? columns.find((c) => c.id === card.column_id) : undefined;
  const accent = column?.color ?? '#64748b';

  // Radix Dialog liefert Focus-Trap, aria-modal, Scroll-Lock, Escape und
  // Klick-außerhalb selbst — die früheren Handrollungen (keydown-defaultPrevented,
  // onMouseDown-Target-Guard) entfallen. Genestete Radix-Layer (Move-Popover,
  // Selects) koordinieren über den DismissableLayer-Stack: Escape schließt erst
  // das innere Layer, ein Klick darin gilt nicht als „außerhalb". Der
  // Text-Auswahl-Drag-Fehlschluss entfällt, weil Radix nur bei pointerdown
  // *außerhalb* des Contents schließt.
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          style={{ backgroundColor: 'rgba(13,36,80,.42)' }}
        />
        <DialogPrimitive.Content
          // Ohne gerenderte Description sonst eine Radix-Warnung; wir haben keine.
          aria-describedby={undefined}
          // Escape in einem Textarea (Beschreibung, Kommentar) bricht nur das
          // Editieren ab, nicht das Modal. Der Guard MUSS hier stehen: Radix
          // lauscht capture-phase auf document und prüft nur defaultPrevented —
          // ein stopPropagation im Feld-Handler käme zu spät. Gleiches gilt fürs
          // Titel-Input, aber nur bei ungespeicherter Umbenennung (data-dirty) —
          // sonst soll Escape das Modal normal schließen.
          onEscapeKeyDown={(e) => {
            const t = e.target;
            if (t instanceof HTMLTextAreaElement) e.preventDefault();
            else if (t instanceof HTMLInputElement && t.dataset.dirty === 'true') e.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-2rem)] w-[calc(100%-2rem)] max-w-[840px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-card shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Zugänglicher Dialogtitel (der sichtbare Titel ist ein editierbares
              Input-Feld, kein Heading) — Radix verdrahtet aria-labelledby. */}
          <DialogPrimitive.Title className="sr-only">
            {card?.title || 'Karte'}
          </DialogPrimitive.Title>
          {isPending || !card ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Lädt…</div>
          ) : (
            <>
              {/* Header */}
              <div
                className="flex shrink-0 items-center gap-2 border-b px-5 py-4"
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
                  <DialogPrimitive.Close asChild>
                    <button
                      type="button"
                      aria-label="Schließen"
                      className="flex h-[34px] w-[34px] items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </DialogPrimitive.Close>
                </div>
              </div>

              {/* Body */}
              <div className="flex min-h-0 flex-1 flex-col md:flex-row">
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
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
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Umbenennung verwerfen. Der reverted Titel == card.title, also
            // committet das nachfolgende Blur nicht. Modal bleibt bei dirty
            // offen (onEscapeKeyDown am DialogContent liest data-dirty).
            setTitle(card.title);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        // Signalisiert dem DialogContent-Escape-Guard, dass eine ungespeicherte
        // Umbenennung anliegt (Escape hält dann das Modal offen).
        data-dirty={title !== card.title ? 'true' : undefined}
        aria-label="Kartentitel"
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

      <DescriptionField card={card} onSave={(v) => saveField.mutate({ description_md: v })} />

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

      <AttachmentsSection card={card} onInvalidate={onInvalidate} />

      <CommentActivityStrand card={card} members={members} onInvalidate={onInvalidate} />
    </div>
  );
}

/** Beschreibung: Ansicht (gesäubertes Markdown-HTML) mit Bearbeiten-Stift, oder
 *  Textarea im Editiermodus. Speichert onBlur / ⌘↵; Escape verwirft. Kein
 *  Prop-Sync-Effekt nötig — MainColumn wird per key={card.id} remountet. */
function DescriptionField({
  card,
  onSave,
}: {
  card: CardDetail;
  onSave: (value: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.description_md ?? '');
  // Escape verwirft; das dabei ausgelöste Blur darf dann NICHT committen.
  const cancelled = useRef(false);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draft.trim() ? draft : '';
    if (next !== (card.description_md ?? '')) onSave(next || null);
    setEditing(false);
  };

  const startEditing = () => {
    cancelled.current = false;
    setDraft(card.description_md ?? '');
    setEditing(true);
  };

  if (editing) {
    return (
      <Textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            // Nur das Editieren abbrechen — dass das Modal offen bleibt,
            // sichert onEscapeKeyDown am DialogContent (nicht dieser Handler).
            cancelled.current = true;
            setDraft(card.description_md ?? '');
            setEditing(false);
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="Beschreibung als Markdown… ⌘↵ speichert, Esc verwirft"
        className="min-h-[96px] resize-y text-[13.5px] leading-relaxed"
      />
    );
  }

  if (card.description_html) {
    return (
      <div className="group relative">
        <div className={PROSE_CLASS} dangerouslySetInnerHTML={{ __html: card.description_html }} />
        <button
          type="button"
          onClick={startEditing}
          aria-label="Beschreibung bearbeiten"
          className="absolute -right-1 -top-1 rounded bg-card/80 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-brand focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="text-[13.5px] text-muted-foreground transition-colors hover:text-foreground"
    >
      Beschreibung hinzufügen…
    </button>
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
            <label className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
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
            <label className="mb-1 block font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Fälligkeit (optional)
            </label>
            <Input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              aria-label="Fälligkeitsdatum"
            />
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
          aria-label="Fälligkeitsdatum"
          className="h-9"
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
              <SelectTrigger className="h-8 text-[13px] text-muted-foreground" aria-label="Beobachter hinzufügen">
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
