'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'oeaw-info-bubbles-enabled';
const EVT = 'oeaw-info-bubbles-change';

function read(): boolean {
  if (typeof window === 'undefined') return true;
  const v = window.localStorage.getItem(KEY);
  return v === null ? true : v === '1';
}

/**
 * Global preference: should InfoBubbles render at all?
 *
 * - Persisted in localStorage (default: on for new users).
 * - Cross-tab synced via the native `storage` event.
 * - Same-tab synced via a custom event so two components in the same tab stay in lockstep.
 *
 * SSR-safe: returns `true` during server render to avoid hydration mismatches; the client
 * effect then reconciles to the persisted value.
 */
export function useInfoBubblesEnabled(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    setEnabled(read());
    const sync = () => setEnabled(read());
    window.addEventListener('storage', sync);
    window.addEventListener(EVT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVT, sync);
    };
  }, []);

  const setPersisted = useCallback((v: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(KEY, v ? '1' : '0');
    window.dispatchEvent(new Event(EVT));
  }, []);

  return [enabled, setPersisted];
}
