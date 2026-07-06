'use client';

import { EmojiPicker } from 'frimousse';

// Frimousse-Panel (Deep-Research 2026-07-06: headless, dependency-frei,
// virtualisiert; Emoji-Daten kommen zur Laufzeit von emojibase und liegen
// nicht im Bundle). Headless heißt: das komplette Styling hier sind unsere
// Designsystem-Token (popover/muted/brand), Kategorie-Header im Mono-Caps-
// Muster der Picker-Popovers (assign-button, mention-textarea).
// Default-Export, weil der Button die Datei per next/dynamic lazy lädt.
export default function EmojiPickerPanel({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <EmojiPicker.Root
      locale="de"
      columns={8}
      onEmojiSelect={(e) => onPick(e.emoji)}
      className="flex h-[340px] w-fit flex-col bg-popover"
    >
      <div className="border-b p-2">
        <EmojiPicker.Search
          placeholder="Emoji suchen…"
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-brand"
        />
      </div>
      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-[13px] text-muted-foreground">
          Lädt…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-[13px] text-muted-foreground">
          Keine Treffer.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                className="bg-popover px-2.5 pb-1 pt-2.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
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
