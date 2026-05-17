'use client';

/**
 * Tiny typed module-level pub/sub so any component (the nav button, the mobile
 * sheet, a footer link) can open the command palette or cheat-sheet without
 * prop drilling or a React context. Chosen over the repo's window-CustomEvent
 * idiom (use-info-bubbles.ts) deliberately: a 2-signal UI control benefits
 * from a typed union over stringly-typed DOM events, and it never touches
 * `window`. SSR-safe: only ever called from client components / effects.
 */

export type CommandSignal = 'open-menu' | 'open-cheatsheet';

const listeners = new Set<(signal: CommandSignal) => void>();

function emit(signal: CommandSignal): void {
  for (const listener of listeners) listener(signal);
}

export function onCommandSignal(
  listener: (signal: CommandSignal) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const openCommandMenu = (): void => emit('open-menu');
export const openCheatSheet = (): void => emit('open-cheatsheet');
