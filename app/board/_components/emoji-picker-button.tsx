'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Smile } from '@/lib/icons';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

// Panel lazy laden: frimousse gehört nicht ins Board-Bundle, solange niemand
// den Emoji-Button drückt (Kommentarfeld sitzt im Karten-Modal).
const EmojiPickerPanel = dynamic(() => import('./emoji-picker-panel'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[340px] w-[276px] items-center justify-center text-[13px] text-muted-foreground">
      Lädt…
    </div>
  ),
});

/** Emoticon-Button am Kommentarfeld (MeisterTask-Pendant): öffnet das
 *  frimousse-Panel, Auswahl landet an der Cursor-Position des Composers. */
export function EmojiPickerButton({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Emoji einfügen"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-brand-50/70 hover:text-brand data-[state=open]:bg-brand-50/70 data-[state=open]:text-brand"
        >
          <Smile className="h-[18px] w-[18px]" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
        <EmojiPickerPanel
          onPick={(emoji) => {
            onPick(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
