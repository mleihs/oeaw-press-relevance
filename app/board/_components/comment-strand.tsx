'use client';

import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Pencil, Trash2, Send } from '@/lib/icons';
import { toast } from 'sonner';
import type {
  BoardMember,
  CardActivityEntry,
  CardComment,
  CardDetail,
} from '@/lib/shared/board';
import { useCurrentUser } from '@/lib/client/hooks/use-current-user';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/shared/utils';
import { addCommentApi, editCommentApi, deleteCommentApi } from '../_lib/api';
import { displayNameOf } from '../_lib/people';
import { relativeDay } from '../_lib/due';
import { PROSE_CLASS } from '../_lib/prose';
import { BoardAvatar } from './board-avatar';
import { ActivityIcon, activityPhrase } from './activity-line';

// Ein Strang aus Kommentaren + Aktivität (MeisterTask-Stil). comment_added-
// Aktivitätszeilen werden ausgeblendet — dort steht der Kommentar selbst.
type StrandEntry =
  | { kind: 'comment'; at: number; comment: CardComment }
  | { kind: 'activity'; at: number; activity: CardActivityEntry };

export function CommentActivityStrand({
  card,
  members,
  onInvalidate,
}: {
  card: CardDetail;
  members: Map<string, BoardMember>;
  onInvalidate: () => void;
}) {
  const { user, isAdmin } = useCurrentUser();

  const entries = useMemo<StrandEntry[]>(() => {
    const list: StrandEntry[] = [
      ...card.comments.map((c) => ({
        kind: 'comment' as const,
        at: Date.parse(c.created_at),
        comment: c,
      })),
      ...card.activity
        .filter((a) => a.verb !== 'comment_added')
        .map((a) => ({
          kind: 'activity' as const,
          at: Date.parse(a.created_at),
          activity: a,
        })),
    ];
    // Neueste zuerst (konsistent mit der bisherigen Aktivitäts-Reihenfolge);
    // bei Gleichstand Kommentare vor Aktivität, gleiche Art bleibt stabil
    // (0 statt ±1 — ein inkonsistenter Comparator wäre engine-abhängig).
    return list.sort(
      (x, y) => y.at - x.at || (x.kind === y.kind ? 0 : x.kind === 'comment' ? -1 : 1),
    );
  }, [card.comments, card.activity]);

  return (
    <div className="border-t pt-4">
      <div className="mb-3 text-[13.5px] font-semibold text-foreground">Kommentare & Aktivität</div>

      <Composer cardId={card.id} onAdded={onInvalidate} />

      <ul className="mt-4 space-y-3">
        {entries.map((e) =>
          e.kind === 'comment' ? (
            <CommentRow
              key={`c-${e.comment.id}`}
              comment={e.comment}
              member={members.get(e.comment.author_id)}
              canModify={!!user && e.comment.author_id === user.id}
              canDelete={!!user && (e.comment.author_id === user.id || isAdmin)}
              onChanged={onInvalidate}
            />
          ) : (
            <li
              key={`a-${e.activity.id}`}
              className="flex items-start gap-2 text-[13px] text-muted-foreground"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted">
                <ActivityIcon verb={e.activity.verb} className="h-3.5 w-3.5" />
              </span>
              <span>
                <span className="font-medium text-foreground">
                  {displayNameOf(members.get(e.activity.actor_id))}
                </span>{' '}
                {activityPhrase(e.activity)} · {relativeDay(e.activity.created_at)}
              </span>
            </li>
          ),
        )}
        {entries.length === 0 && (
          <li className="text-[13px] text-muted-foreground">Noch keine Kommentare oder Aktivität.</li>
        )}
      </ul>
    </div>
  );
}

function Composer({ cardId, onAdded }: { cardId: string; onAdded: () => void }) {
  const [body, setBody] = useState('');
  const add = useMutation({
    mutationFn: (value: string) => addCommentApi(cardId, value),
    onSuccess: () => {
      setBody('');
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    const value = body.trim();
    if (value && !add.isPending) add.mutate(value);
  };

  return (
    <div className="rounded-lg border bg-card p-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Enter sendet, Shift+Enter = Zeilenumbruch. IME-Komposition (z. B.
          // Umlaut-Deadkeys) nicht abfangen.
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape' && body.trim()) {
            // Feld verlassen ohne einen halb getippten Kommentar zu verlieren.
            // Dass das Modal offen bleibt, sichert onEscapeKeyDown am
            // DialogContent (card-modal.tsx) — nicht dieser Handler.
            e.currentTarget.blur();
          }
        }}
        placeholder="Kommentar schreiben… (Markdown, Enter sendet, ⇧↵ neue Zeile)"
        className="min-h-[64px] resize-y border-none bg-transparent p-1 text-[13.5px] leading-relaxed shadow-none focus-visible:ring-0"
      />
      <div className="mt-1 flex justify-end">
        <Button size="sm" onClick={submit} disabled={!body.trim() || add.isPending}>
          <Send className="mr-1 h-3.5 w-3.5" /> Kommentar
        </Button>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  member,
  canModify,
  canDelete,
  onChanged,
}: {
  comment: CardComment;
  member: BoardMember | undefined;
  canModify: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body_md);

  const edit = useMutation({
    mutationFn: (value: string) => editCommentApi(comment.id, value),
    onSuccess: () => {
      setEditing(false);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: () => deleteCommentApi(comment.id),
    onSuccess: onChanged,
    onError: (e: Error) => toast.error(e.message),
  });

  const commitEdit = () => {
    const value = draft.trim();
    if (!value) return;
    if (value === comment.body_md) {
      setEditing(false);
      return;
    }
    edit.mutate(value);
  };

  return (
    <li className="group flex items-start gap-2.5">
      <BoardAvatar member={member} size={26} />
      {/* Warme Sprechblase (MeisterTask-Stil): der Kommentar sitzt in einer
          getönten Blase mit Notch zum Avatar (rounded-tl-sm) — hebt den Austausch
          von den flachen Aktivitätszeilen ab. Fläche = Board-Chip-Token (warm in
          „Atmosphäre"). */}
      <div
        className="min-w-0 flex-1 rounded-xl rounded-tl-sm border px-3 py-2"
        style={{ backgroundColor: 'var(--board-chip-bg)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-foreground">{displayNameOf(member)}</span>
          <span className="text-[11.5px] text-muted-foreground">
            {relativeDay(comment.created_at)}
            {comment.edited_at ? ' · bearbeitet' : ''}
          </span>
          {(canModify || canDelete) && !editing && (
            <span className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {canModify && (
                <button
                  type="button"
                  onClick={() => {
                    setDraft(comment.body_md);
                    setEditing(true);
                  }}
                  className="rounded p-1 text-muted-foreground hover:text-brand"
                  aria-label="Kommentar bearbeiten"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => del.mutate()}
                  disabled={del.isPending}
                  className="rounded p-1 text-muted-foreground hover:text-red-600"
                  aria-label="Kommentar löschen"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          )}
        </div>

        {editing ? (
          <div className="mt-1">
            <Textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  // Modal-Offen-Guard: onEscapeKeyDown in card-modal.tsx.
                  setDraft(comment.body_md);
                  setEditing(false);
                } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  commitEdit();
                }
              }}
              className="min-h-[64px] resize-y text-[13.5px] leading-relaxed"
            />
            <div className="mt-1.5 flex items-center gap-2">
              <Button size="sm" onClick={commitEdit} disabled={!draft.trim() || edit.isPending}>
                Speichern
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(comment.body_md);
                  setEditing(false);
                }}
              >
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn('mt-0.5', PROSE_CLASS)}
            dangerouslySetInnerHTML={{ __html: comment.body_html }}
          />
        )}
      </div>
    </li>
  );
}
