'use client';

import { isComposingEvent, isTypingTarget } from './platform';

/**
 * A purpose-built keybinding matcher. ~90 lines, zero dependencies, exactly
 * the surface this app needs:
 *
 *   - chord    : a modifier + key, e.g. ⌘K / Ctrl+K  (fires even while typing)
 *   - single   : one printable key, e.g. ?           (suppressed while typing)
 *   - sequence : a lead key then a key within a timeout, GitHub-style "g d"
 *
 * Why hand-rolled (decision-grade, see ADR 0016): cmdk's own README says to
 * wire ⌘K yourself ("do it yourself to have full control over keybind
 * context"); shadcn/ui and dub.co hand-roll the same layer. tinykeys is
 * dormant (no commits since 2024-08, open sequence/`?`/TS-resolution bugs)
 * and does NOT provide the parts that actually cost work here (typing-target
 * guard, IME/Dead-key guard, WCAG 2.1.4 toggle) — those stay the caller's job
 * with any library. So the library would not shrink this file; it would add a
 * dependency next to it. The honest cost of "build" is getting a finite,
 * testable checklist right (see keybindings.test.ts).
 *
 * Correctness checklist this implements (sources in ADR 0016):
 *   - ignore auto-repeat (`event.repeat`) so a held key fires once
 *   - ignore IME composition / Dead keys (German ´ ` ^) and keyCode 229
 *   - match on `event.key` (layout-correct for letters + `?`), lower-cased
 *   - keydown-only (sidesteps the macOS ⌘ swallows-keyup quirk)
 *   - `preventDefault` only on a confirmed match
 *   - single source of truth: one app-level listener + a registry
 *   - reset the sequence buffer on context loss (target blur)
 *   - clean teardown via the returned dispose() (React-19/StrictMode-safe)
 *
 * WCAG 2.1.4: single/sequence bindings only fire when isEnabled() is true (a
 * user-facing toggle). Chords use a modifier and are exempt, so they ignore
 * the gate and stay available as the primary affordance.
 */

export type Binding =
  | { kind: 'chord'; key: string }
  | { kind: 'single'; key: string }
  | { kind: 'sequence'; lead: string; key: string };

export interface KeybindingEntry {
  binding: Binding;
  run: (e: KeyboardEvent) => void;
}

interface Options {
  /** Single/sequence bindings only fire when this returns true (WCAG 2.1.4). */
  isEnabled: () => boolean;
  /** Milliseconds the sequence lead key stays armed. */
  sequenceTimeout?: number;
}

export function createKeybindings(
  target: Window | HTMLElement,
  entries: KeybindingEntry[],
  opts: Options,
): () => void {
  const timeout = opts.sequenceTimeout ?? 1200;
  let pendingLead: string | null = null;
  let leadTimer: ReturnType<typeof setTimeout> | null = null;

  const clearLead = () => {
    pendingLead = null;
    if (leadTimer) {
      clearTimeout(leadTimer);
      leadTimer = null;
    }
  };

  const handler = (ev: Event) => {
    const e = ev as KeyboardEvent;
    // Auto-repeat (held key) and IME/Dead composition are never a shortcut.
    if (e.repeat || isComposingEvent(e)) return;

    const key = e.key.toLowerCase();
    const hasMod = e.metaKey || e.ctrlKey;
    const typing = isTypingTarget(e.target);

    // 1. Chords: modifier + key, no Alt, no Shift. Allowed while typing
    //    (⌘K is WCAG-exempt and is the global primary affordance).
    for (const { binding, run } of entries) {
      if (
        binding.kind === 'chord' &&
        hasMod &&
        !e.altKey &&
        !e.shiftKey &&
        key === binding.key
      ) {
        e.preventDefault();
        clearLead();
        run(e);
        return;
      }
    }

    // Below is single-key territory: never with Ctrl/Meta/Alt, never while
    // typing, only when the user has shortcuts enabled. (Shift is allowed:
    // "?" is Shift+/ on US and Shift+ß on German layouts.)
    if (hasMod || e.altKey || typing || !opts.isEnabled()) {
      if (!hasMod && !e.altKey) clearLead();
      return;
    }

    // 2. Sequence completion: an armed lead followed by the matching key.
    if (pendingLead) {
      const lead = pendingLead;
      clearLead();
      for (const { binding, run } of entries) {
        if (binding.kind === 'sequence' && binding.lead === lead && binding.key === key) {
          e.preventDefault();
          run(e);
          return;
        }
      }
      // fall through: this key may itself be a single binding or a new lead
    }

    // 3. Arm a sequence lead if any sequence uses this key as its lead.
    if (entries.some((x) => x.binding.kind === 'sequence' && x.binding.lead === key)) {
      pendingLead = key;
      leadTimer = setTimeout(clearLead, timeout);
      return;
    }

    // 4. Single keys.
    for (const { binding, run } of entries) {
      if (binding.kind === 'single' && key === binding.key) {
        e.preventDefault();
        run(e);
        return;
      }
    }
  };

  // A half-typed sequence must not survive the window losing focus.
  const onContextLoss = () => clearLead();

  target.addEventListener('keydown', handler);
  target.addEventListener('blur', onContextLoss);
  return () => {
    clearLead();
    target.removeEventListener('keydown', handler);
    target.removeEventListener('blur', onContextLoss);
  };
}
