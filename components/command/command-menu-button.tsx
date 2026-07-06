'use client';

import { Search } from '@/lib/icons';
import { useIsMac } from '@/lib/client/commands/platform';
import { openCommandMenu } from '@/lib/client/commands/controller';

/**
 * The visible affordance for the command palette in the brand nav. Keeping a
 * clickable entry point (not only ⌘K) is both a UX and an accessibility
 * requirement: not every user knows or can press the chord.
 *
 * The kbd hint is rendered via useIsMac (mounted-gated) so SSR and the first
 * client render agree — the server cannot know the platform.
 */
export function CommandMenuButton() {
  const mac = useIsMac();

  return (
    <button
      type="button"
      onClick={() => openCommandMenu()}
      aria-label="Befehlsmenü öffnen"
      className="hidden sm:inline-flex h-9 items-center gap-2 rounded-md border border-white/20 bg-white/5 px-2.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Search className="h-4 w-4" />
      <span className="hidden lg:inline">Suchen</span>
      <kbd className="hidden lg:inline-flex items-center rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-2xs font-medium text-white/80">
        {mac ? '⌘' : 'Strg'} K
      </kbd>
    </button>
  );
}
