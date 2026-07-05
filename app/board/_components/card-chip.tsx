'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { CheckCircle2, ListChecks, ListTree, MessageCircle, Paperclip } from '@/lib/icons';
import { cn } from '@/lib/shared/utils';
import type { BoardLabel, BoardMember, CardChip as CardChipT } from '@/lib/shared/board';
import { dueState } from '../_lib/due';
import { displayNameOf } from '../_lib/people';
import { BoardAvatar } from './board-avatar';
import { DueBadge } from './due-badge';
import { LabelPill } from './label-pill';

function MetaBadge({
  icon: Icon,
  label,
}: {
  icon: typeof ListChecks;
  label: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-medium"
      // Chip-Farben aus den Erscheinungsbild-Tokens: kühles Grau im Standard,
      // warmes Beige in „Atmosphäre" (sonst kühle Chips auf warmen Karten).
      style={{ backgroundColor: 'var(--board-chip-bg)', color: 'var(--board-chip-ink)' }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export function CardChip({
  card,
  accent,
  members,
  labels,
  onOpen,
}: {
  card: CardChipT;
  accent: string;
  members: Map<string, BoardMember>;
  labels: Map<string, BoardLabel>;
  onOpen: () => void;
}) {
  const cardLabels = card.label_ids.map((id) => labels.get(id)).filter((l): l is BoardLabel => !!l);
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  const completed = card.completed_at !== null;
  // Offen & vor heute → rote Hervorhebung der ganzen Karte (MeisterTask-Stil:
  // rosa Karte + rotes Datum). Erledigte gelten nie als überfällig.
  const overdue = dueState(card.due_at, card.completed_at) === 'overdue';
  const hasMeta =
    card.due_at ||
    card.checklist_total > 0 ||
    card.subtask_total > 0 ||
    card.comment_count > 0 ||
    card.attachment_count > 0 ||
    card.assignee_id !== null ||
    card.watcher_ids.length > 0;

  // Zuständige:n am Chip zeigen (MeisterTask zeigt das Assignee-Avatar auf der
  // Karte). Beobachter bleiben als kleiner Stack davor, sind hier aber leer.
  const assignee = card.assignee_id ? members.get(card.assignee_id) : undefined;
  const watchersOnly = card.watcher_ids.filter((id) => id !== card.assignee_id);
  const shownWatchers = watchersOnly.slice(0, 3);
  const extraWatchers = watchersOnly.length - shownWatchers.length;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        transform: CSS.Translate.toString(transform),
        // Board-Tiefe: Karte schwebt über der Mulde (Schatten/Rand/Radius via
        // .board-card + Erscheinungsbild-Tokens). Kein 3px-Streifen mehr — die
        // Kanalfarbe sitzt im Spaltenkopf; Identität an der Karte trägt der
        // Assignee-Ring. Überfällig bleibt rot getönt.
        background: overdue ? 'var(--danger-tint)' : 'var(--board-card)',
        borderColor: overdue ? 'var(--danger-line)' : undefined,
        opacity: isDragging ? 0.4 : completed ? 0.62 : 1,
      }}
      className={cn('board-card cursor-pointer px-[13px] py-3')}
    >
      {cardLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {cardLabels.map((l) => (
            <LabelPill key={l.id} label={l} />
          ))}
        </div>
      )}

      <div className="flex items-start gap-1.5">
        {completed && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
        <div
          className={cn(
            // min-w-0 + break-words: lange, ungebrochene Tokens (URLs als Titel)
            // brechen um statt über den Kartenrand zu laufen.
            'min-w-0 flex-1 break-words text-[13.5px] font-semibold leading-snug',
            completed && 'text-ink-muted line-through',
          )}
          // Ink aus dem Erscheinungsbild-Token (Slate im Standard, warm in
          // „Atmosphäre"); erledigte Karten bleiben gedämpft/durchgestrichen.
          style={completed ? undefined : { color: 'var(--board-card-ink)' }}
        >
          {card.title}
        </div>
      </div>

      {hasMeta && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <DueBadge dueAt={card.due_at} completedAt={card.completed_at} />
          {card.checklist_total > 0 && (
            <MetaBadge icon={ListChecks} label={`${card.checklist_done}/${card.checklist_total}`} />
          )}
          {card.subtask_total > 0 && (
            <MetaBadge icon={ListTree} label={`${card.subtask_done}/${card.subtask_total}`} />
          )}
          {card.comment_count > 0 && (
            <MetaBadge icon={MessageCircle} label={String(card.comment_count)} />
          )}
          {card.attachment_count > 0 && (
            <MetaBadge icon={Paperclip} label={String(card.attachment_count)} />
          )}
          {(assignee || watchersOnly.length > 0) && (
            <span className="ml-auto flex items-center pl-2">
              {shownWatchers.map((id, i) => (
                <span key={id} style={{ marginLeft: i === 0 ? 0 : -7 }} className="rounded-full opacity-70 ring-2 ring-surface">
                  <BoardAvatar member={members.get(id)} size={22} />
                </span>
              ))}
              {extraWatchers > 0 && (
                <span className="ml-[-7px] inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-fill text-ink-subtle ring-2 ring-surface font-mono text-[9.5px] font-semibold">
                  +{extraWatchers}
                </span>
              )}
              {/* Assignee als primäres, betontes Avatar rechts (Ring in
                  Kanalfarbe hebt ihn von Beobachtern ab). */}
              {assignee && (
                <span
                  title={displayNameOf(assignee)}
                  style={{ marginLeft: shownWatchers.length || extraWatchers > 0 ? -7 : 0, boxShadow: `0 0 0 2px ${accent}` }}
                  className="rounded-full ring-2 ring-surface"
                >
                  <BoardAvatar member={assignee} size={22} />
                </span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
