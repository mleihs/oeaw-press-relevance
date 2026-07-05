'use client';

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'oeaw-board-appearance';
const EVT = 'oeaw-board-appearance-change';

export const BOARD_APPEARANCES = ['standard', 'atmosphere'] as const;
export type BoardAppearance = (typeof BOARD_APPEARANCES)[number];

function read(): BoardAppearance {
  if (typeof window === 'undefined') return 'standard';
  const v = window.localStorage.getItem(KEY);
  return v === 'atmosphere' ? 'atmosphere' : 'standard';
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVT, onChange);
  };
}

/**
 * Per-Nutzer-Erscheinungsbild des Boards (localStorage, jeder wählt für sich).
 * „standard" = Wertekontrast (weiße Karten auf neutraler Mulde), „atmosphere" =
 * warmes Redaktions-Feld. Nur eine CSS-Token-Umschaltung (data-board-appearance
 * am Board-Root) — kein Server-State.
 *
 * 1:1 nach useKeyboardShortcutsEnabled modelliert: eigener localStorage-Key,
 * Default für neue Nutzer, cross-tab über `storage`, same-tab über Custom-Event,
 * SSR-sicher via useSyncExternalStore (Server-Snapshot = 'standard' = initialer
 * Client-Default, kein setState-in-Effect-Zyklus).
 */
export function useBoardAppearance(): [BoardAppearance, (v: BoardAppearance) => void] {
  const appearance = useSyncExternalStore<BoardAppearance>(subscribe, read, () => 'standard');

  const setPersisted = useCallback((v: BoardAppearance) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, v);
    window.dispatchEvent(new Event(EVT));
  }, []);

  return [appearance, setPersisted];
}
