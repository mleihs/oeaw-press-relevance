'use client';

import { useRef, useState } from 'react';
import { EmojiPicker } from 'frimousse';
import { cn } from '@/lib/shared/utils';

// Frimousse-Panel (Deep-Research 2026-07-06: headless, dependency-frei,
// virtualisiert; Emoji-Daten kommen zur Laufzeit von emojibase und liegen
// nicht im Bundle). Headless heißt: das komplette Styling hier sind unsere
// Designsystem-Token (popover/muted/brand), Kategorie-Header im Mono-Caps-
// Muster der Picker-Popovers (assign-button, mention-textarea).
// Default-Export, weil der Button die Datei per next/dynamic lazy lädt.

// Kategorie-Sprungleiste: frimousse bringt keine eigene Kategorie-Navigation
// mit (headless), also bauen wir sie selbst. emojibase liefert die Gruppen in
// fester Reihenfolge (»component« ist herausgefiltert) — ein repräsentatives
// Emoji pro Gruppe dient als Tab. Der Sprung geht über die immer gerenderten
// [frimousse-category]-Wrapper im Viewport (nur die Zeilen sind virtualisiert).
// Während einer Suche filtert frimousse Kategorien weg und die Index-Zuordnung
// bräche — die Leiste wird dann ausgeblendet.
const CATEGORY_TABS = [
  { emoji: '🙂', label: 'Smileys & Emotionen' },
  { emoji: '👋', label: 'Personen & Körper' },
  { emoji: '🐻', label: 'Tiere & Natur' },
  { emoji: '🍎', label: 'Essen & Trinken' },
  { emoji: '🚗', label: 'Reisen & Orte' },
  { emoji: '⚽', label: 'Aktivitäten' },
  { emoji: '💡', label: 'Objekte' },
  { emoji: '🔣', label: 'Symbole' },
  { emoji: '🚩', label: 'Flaggen' },
] as const;

export default function EmojiPickerPanel({ onPick }: { onPick: (emoji: string) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState(0);

  const categoryEls = () =>
    viewportRef.current
      ? Array.from(viewportRef.current.querySelectorAll<HTMLElement>('[frimousse-category]'))
      : [];

  const jumpTo = (index: number) => {
    const el = categoryEls()[index];
    if (!el || !viewportRef.current) return;
    viewportRef.current.scrollTo({ top: el.offsetTop, behavior: 'instant' });
    setActiveTab(index);
  };

  // Aktiven Tab am Scrollstand nachführen: letzte Kategorie, deren Wrapper
  // die Oberkante erreicht hat (10 Elemente — die Abfrage ist billig).
  const trackActive = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    const top = vp.scrollTop + 1;
    let index = 0;
    categoryEls().forEach((el, i) => {
      if (el.offsetTop <= top) index = i;
    });
    setActiveTab(index);
  };

  return (
    <EmojiPicker.Root
      locale="de"
      columns={8}
      onEmojiSelect={(e) => onPick(e.emoji)}
      className="flex h-[340px] w-fit flex-col bg-popover"
    >
      <div className="border-b p-2">
        <EmojiPicker.Search
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Emoji suchen…"
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-brand"
        />
      </div>
      {search === '' && (
        <div className="flex items-center justify-between border-b px-1.5 py-1">
          {CATEGORY_TABS.map((tab, i) => (
            <button
              key={tab.label}
              type="button"
              title={tab.label}
              aria-label={`Kategorie ${tab.label}`}
              onClick={() => jumpTo(i)}
              className={cn(
                'flex size-7 items-center justify-center rounded-md text-[15px] transition-colors',
                i === activeTab
                  ? 'bg-brand-50/70'
                  : 'opacity-55 grayscale hover:bg-muted hover:opacity-100 hover:grayscale-0',
              )}
            >
              {tab.emoji}
            </button>
          ))}
        </div>
      )}
      <EmojiPicker.Viewport
        ref={viewportRef}
        onScroll={trackActive}
        className="relative flex-1 outline-none"
      >
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Lädt…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Keine Treffer.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                className="bg-popover px-2.5 pb-1 pt-2.5 font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground/70"
                {...props}
              >
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                className="flex size-8 items-center justify-center rounded-md text-[18px] transition-colors data-[active]:bg-brand-50/70"
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>
    </EmojiPicker.Root>
  );
}
