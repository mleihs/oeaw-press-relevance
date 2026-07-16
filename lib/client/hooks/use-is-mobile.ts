'use client';

import { useSyncExternalStore } from 'react';

/**
 * SSR-sicherer Mobile-Breakpoint (< sm, 640px): entscheidet z. B. Dialog vs.
 * Bottom-Sheet in den Refresh-/Scoring-Modals. Server-Snapshot = false → Dialog,
 * korrigiert sich nach der Hydration. Geteilt von refresh-button.tsx und
 * scoring-modal.tsx (vormals dupliziert), damit der Breakpoint eine Wahrheit ist.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia('(max-width: 639px)');
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(max-width: 639px)').matches,
    () => false,
  );
}
