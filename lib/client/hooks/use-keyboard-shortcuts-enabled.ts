'use client';

import { makeLocalStorageFlag } from './use-local-storage-flag';

const flag = makeLocalStorageFlag(
  'oeaw-keyboard-shortcuts-enabled',
  'oeaw-keyboard-shortcuts-change',
);

/**
 * WCAG 2.1.4 (Character Key Shortcuts, Level A): single-key and sequence
 * shortcuts ("?", "g d", …) MUST be switchable off. This is that switch —
 * own localStorage key, default ON, cross-tab + same-tab synced, SSR-safe
 * (see makeLocalStorageFlag).
 *
 * Note: the ⌘K palette chord is intentionally NOT gated by this — modifier
 * shortcuts are exempt from 2.1.4 and ⌘K is the primary, discoverable
 * affordance. Only the printable single-key / sequence layer respects it.
 */
export const useKeyboardShortcutsEnabled = flag.useFlag;

/**
 * Imperative read for non-React call sites (the keybinding matcher's
 * isEnabled() gate). Reads localStorage directly so it always reflects the
 * latest persisted value without needing a subscription.
 */
export const readKeyboardShortcutsEnabled = flag.read;
