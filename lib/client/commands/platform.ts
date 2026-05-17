'use client';

import { useSyncExternalStore } from 'react';

/**
 * Platform + input-guard helpers shared by the command palette and the global
 * keyboard layer.
 *
 * Rule of thumb from the research (W3C APG / MDN): read the platform off the
 * *event* (metaKey || ctrlKey) so a binding works on macOS and Windows/Linux
 * alike, and only branch the *visible label* on isMac(). Never match on
 * event.code / keyCode for mnemonics: that breaks QWERTZ and other layouts.
 */

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  // navigator.platform is deprecated but still the most reliable signal;
  // userAgent is the documented fallback.
  const probe = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/.test(probe);
}

const subscribeNoop = (): (() => void) => () => {};

/**
 * SSR-safe isMac for anything rendered into the DOM (kbd chips). The platform
 * never changes at runtime, so this is a read-only external store: the server
 * snapshot is false (server can't know the platform) and React swaps to the
 * real value right after hydration without a mismatch and without the
 * setState-in-effect cascade. Use isMac() directly for event logic.
 */
export function useIsMac(): boolean {
  return useSyncExternalStore(subscribeNoop, isMac, () => false);
}

/**
 * Should a global single-key / sequence shortcut be suppressed because the
 * user is typing? Covers form controls, contentEditable, and IME composition
 * (Dead keys like the German accent keys, and the legacy keyCode 229).
 *
 * Chord shortcuts that carry a modifier (⌘K) deliberately do NOT consult this:
 * GitHub/Linear let ⌘K open the palette even from inside a text field.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest?.('[contenteditable=""],[contenteditable="true"]');
}

export function isComposingEvent(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229 || e.key === 'Dead';
}
