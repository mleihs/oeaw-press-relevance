'use client';

import { makeLocalStorageFlag } from './use-local-storage-flag';

const flag = makeLocalStorageFlag(
  'oeaw-info-bubbles-enabled',
  'oeaw-info-bubbles-change',
);

/**
 * Global preference: should InfoBubbles render at all?
 *
 * - Persisted in localStorage (default: on for new users).
 * - Cross-tab synced via the native `storage` event.
 * - Same-tab synced via a custom event so two components in the same tab stay
 *   in lockstep.
 * - SSR-safe (server snapshot = true matches the initial client default).
 *
 * See makeLocalStorageFlag for the shared mechanics.
 */
export const useInfoBubblesEnabled = flag.useFlag;
