'use client';

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'oeaw-keyboard-shortcuts-enabled';
const EVT = 'oeaw-keyboard-shortcuts-change';

function read(): boolean {
  if (typeof window === 'undefined') return true;
  const v = window.localStorage.getItem(KEY);
  return v === null ? true : v === '1';
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
 * WCAG 2.1.4 (Character Key Shortcuts, Level A): single-key and sequence
 * shortcuts ("?", "g d", …) MUST be switchable off. This is that switch.
 *
 * Deliberately modelled 1:1 on useInfoBubblesEnabled: own localStorage key,
 * default ON for new users, cross-tab synced via the native `storage` event,
 * same-tab synced via a custom event, SSR-safe through useSyncExternalStore
 * (server snapshot = true matches the initial client default, no
 * setState-in-effect cycle).
 *
 * Note: the ⌘K palette chord is intentionally NOT gated by this — modifier
 * shortcuts are exempt from 2.1.4 and ⌘K is the primary, discoverable
 * affordance. Only the printable single-key / sequence layer respects it.
 */
export function useKeyboardShortcutsEnabled(): [boolean, (v: boolean) => void] {
  const enabled = useSyncExternalStore<boolean>(subscribe, read, () => true);

  const setPersisted = useCallback((v: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, v ? '1' : '0');
    window.dispatchEvent(new Event(EVT));
  }, []);

  return [enabled, setPersisted];
}

/**
 * Imperative read for non-React call sites (the keybinding matcher's
 * isEnabled() gate). Reads localStorage directly so it always reflects the
 * latest persisted value without needing a subscription.
 */
export function readKeyboardShortcutsEnabled(): boolean {
  return read();
}
