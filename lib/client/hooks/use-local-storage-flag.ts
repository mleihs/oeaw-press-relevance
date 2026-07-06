'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Factory for a boolean localStorage preference that is:
 *  - persisted under `key` (default ON — a missing value or `'1'` reads true,
 *    `'0'` reads false),
 *  - cross-tab synced via the native `storage` event,
 *  - same-tab synced via a custom `eventName` dispatched on every write,
 *  - SSR-safe through useSyncExternalStore (server snapshot = true matches the
 *    initial client-render default, so the store reconciles to the persisted
 *    value without a setState-in-effect cycle).
 *
 * Returns the `[enabled, setEnabled]` hook plus an imperative `read()` for
 * non-React call sites (e.g. an event-handler gate).
 */
export function makeLocalStorageFlag(key: string, eventName: string) {
  function read(): boolean {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(key);
    return v === null ? true : v === '1';
  }

  function subscribe(onChange: () => void): () => void {
    window.addEventListener('storage', onChange);
    window.addEventListener(eventName, onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(eventName, onChange);
    };
  }

  function useFlag(): [boolean, (v: boolean) => void] {
    const enabled = useSyncExternalStore<boolean>(subscribe, read, () => true);

    const setPersisted = useCallback((v: boolean) => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(key, v ? '1' : '0');
      window.dispatchEvent(new Event(eventName));
    }, []);

    return [enabled, setPersisted];
  }

  return { useFlag, read };
}
