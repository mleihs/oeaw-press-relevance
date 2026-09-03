'use client';

// Hauptspalte des Karten-Modals: Titel, Quell-Chip, Beschreibung, Checkliste/
// Unteraufgaben, Referenzen, Anhänge, Kommentar-Strand. Aus card-modal.tsx
// entlang der bestehenden Funktionsgrenzen herausgelöst (Verhalten/Markup 1:1);
// die stabilen Werte kommen aus dem CardModalContext statt per Props-Drilling.
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ListChecks,
  ListTree,
  Link as LinkIcon,
  CalendarDays,
  Newspaper,
  Pencil,
} from '@/lib/icons';
import NextLink from 'next/link';
import { toast } from 'sonner';
import type { BoardColumn, CardDetail, CardReference } from '@/lib/shared/board';
import { patchCardApi } from '../_lib/api';
import { PROSE_CLASS } from '../_lib/prose';
import { useCardModal } from './card-modal-context';
import { ItemSection } from './card-modal-items';
import { CommentActivityStrand } from './comment-strand';
import { AttachmentsSection } from './attachments-section';
import { ReferencesSection } from './references-section';
import { Textarea } from '@/components/ui/textarea';

export function MainColumn({
  onReferences,
  onOpenCard,
  columns,
}: {
  onReferences: (references: CardReference[]) => void;
  onOpenCard: (id: string) => void;
  columns: BoardColumn[];
}) {
  const { card, byId, onPatch, onInvalidate } = useCardModal();
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

      {(card.link_url || card.source_event_id || card.source_publication_id) && (
        <div className="flex flex-wrap items-center gap-2">
          {card.link_url && (
            <a
              href={card.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-brand/10 px-2 py-1 text-sm font-medium text-brand hover:underline"
            >
              <LinkIcon className="h-3.5 w-3.5" />
              {card.link_url.replace(/^https?:\/\//, '').slice(0, 60)}
            </a>
          )}
          <SourceChip card={card} />
        </div>
      )}

      <DescriptionField card={card} onSave={(v) => saveField.mutate({ description_md: v })} />

      <ItemSection
        kind="checklist"
        items={checklist}
        title="Checkliste"
        icon={ListChecks}
        accent="#0047bb"
        onOpenCard={onOpenCard}
        columns={columns}
      />
      <ItemSection
        kind="subtask"
        items={subtasks}
        title="Unteraufgaben"
        icon={ListTree}
        accent="#7c3aed"
        onOpenCard={onOpenCard}
        columns={columns}
      />

      <ReferencesSection card={card} onReferences={onReferences} />

      <AttachmentsSection card={card} onInvalidate={onInvalidate} />

      <CommentActivityStrand card={card} members={byId} onInvalidate={onInvalidate} />
    </div>
  );
}

/** Rücklink zur Triage-Quelle (Event/Publikation), aus der die Karte angelegt
 *  wurde. Interner Deep-Link; null wenn keine Quelle gesetzt ist. */
function SourceChip({ card }: { card: CardDetail }) {
  const source = card.source_event_id
    ? { href: `/events/${card.source_event_id}`, label: 'Aus Event', Icon: CalendarDays }
    : card.source_publication_id
      ? {
          href: `/publications/${card.source_publication_id}`,
          label: 'Aus Publikation',
          Icon: Newspaper,
        }
      : null;
  if (!source) return null;
  const { href, label, Icon } = source;
  return (
    <NextLink
      href={href}
      className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </NextLink>
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
        className="min-h-[96px] resize-y text-sm leading-relaxed"
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
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      Beschreibung hinzufügen…
    </button>
  );
}
