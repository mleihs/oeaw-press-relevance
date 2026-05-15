'use client';

import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'oeaw-info-bubbles-enabled';
const EVT = 'oeaw-info-bubbles-change';

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
 * Global preference: should InfoBubbles render at all?
 *
 * - Persisted in localStorage (default: on for new users).
 * - Cross-tab synced via the native `storage` event.
 * - Same-tab synced via a custom event so two components in the same tab stay in lockstep.
 *
 * SSR-safe via useSyncExternalStore: getServerSnapshot returns `true` so the
 * server HTML matches the initial client-render default; the store subscription
 * then reconciles to the persisted value without a setState-in-effect cycle.
 */
export function useInfoBubblesEnabled(): [boolean, (v: boolean) => void] {
  const enabled = useSyncExternalStore<boolean>(
    subscribe,
    read,
    () => true,
  );

  const setPersisted = useCallback((v: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, v ? '1' : '0');
    window.dispatchEvent(new Event(EVT));
  }, []);

  return [enabled, setPersisted];
}
