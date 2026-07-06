'use client';

import { useMemo, useRef, useState } from 'react';
import type { BoardMember } from '@/lib/shared/board';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/shared/utils';
import { displayNameOf } from '../_lib/people';
import { BoardAvatar } from './board-avatar';

// Textarea mit @-Mention-Autocomplete (MeisterTask-Pendant): `@` öffnet ein
// Panel mit den aktiven Board-Membern (Filter wie assign-button: Name oder
// E-Mail), Auswahl fügt das Token `@[Anzeigename]` an der Cursor-Position ein
// (Server-Rendering: lib/server/board/markdown.ts). Panel-Styling folgt dem
// assign-button-Popover (bg-popover, Brand-Hover, BoardAvatar-Zeilen).

/** Aktiver Mention-Kontext vor dem Caret: `@`-Position + bisher Getipptes.
 *  Das `@` muss am Zeilen-/Textanfang oder nach Whitespace/Klammer stehen,
 *  damit E-Mail-Adressen im Fließtext kein Panel aufreißen. */
function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|[\s([{>„"'])@([^\n@\]]{0,60})$/.exec(before);
  if (!m) return null;
  return { start: caret - m[2].length - 1, query: m[2] };
}

export function MentionTextarea({
  value,
  onValueChange,
  members,
  textareaRef,
  className,
  onKeyDown,
  ...props
}: Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
  members: BoardMember[];
  /** Optionales Ref auf das rohe <textarea> (z. B. für Emoji-Insert). */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const [caret, setCaret] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [highlight, setHighlight] = useState(0);

  const ctx = mentionQueryAt(value, caret);
  const options = useMemo(() => {
    if (!ctx) return [];
    const q = ctx.query.trim().toLowerCase();
    return members
      .filter((m) => !m.disabled_at)
      .filter(
        (m) =>
          !q ||
          displayNameOf(m).toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      );
  }, [ctx, members]);

  // Escape unterdrückt das Panel für GENAU diese @-Position, bis der Kontext
  // wechselt — sonst poppte es beim nächsten Tastendruck sofort wieder auf.
  const open = !!ctx && options.length > 0 && dismissedAt !== ctx.start;
  const clampedHighlight = Math.min(highlight, Math.max(0, options.length - 1));

  const syncCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart ?? 0);

  const insertMention = (member: BoardMember) => {
    if (!ctx) return;
    const el = innerRef.current;
    const token = `@[${displayNameOf(member)}] `;
    const next = value.slice(0, ctx.start) + token + value.slice(caret);
    onValueChange(next);
    const newCaret = ctx.start + token.length;
    setCaret(newCaret);
    setHighlight(0);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        el.setSelectionRange(newCaret, newCaret);
      }
    });
  };

  return (
    <div className="relative">
      <Textarea
        {...props}
        ref={(el) => {
          innerRef.current = el;
          if (textareaRef) textareaRef.current = el;
        }}
        value={value}
        onChange={(e) => {
          onValueChange(e.target.value);
          syncCaret(e.target);
          setDismissedAt(null);
          setHighlight(0);
        }}
        onSelect={(e) => syncCaret(e.currentTarget)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) => (h + 1) % options.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => (h - 1 + options.length) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              insertMention(options[clampedHighlight]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setDismissedAt(ctx!.start);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        className={className}
      />
      {open && (
        <div
          role="listbox"
          aria-label="Mitglied erwähnen"
          className="absolute left-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded-lg border bg-popover shadow-md"
        >
          <div className="px-3 pb-0.5 pt-2 font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Erwähnen
          </div>
          <div className="max-h-[204px] overflow-y-auto p-1.5">
            {options.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={i === clampedHighlight}
                // mousedown statt click: der Klick darf den Textarea-Fokus
                // nicht erst rauben (blur würde das Panel schließen, bevor
                // click feuert).
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                  i === clampedHighlight && 'bg-brand-50/70',
                )}
              >
                <BoardAvatar member={m} size={24} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {displayNameOf(m)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
