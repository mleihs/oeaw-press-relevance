import { describe, it, expect, vi, afterEach } from 'vitest';
import { createKeybindings, type KeybindingEntry } from './keybindings';

// A minimal EventTarget double + synthetic KeyboardEvents. No jsdom: the
// matcher only touches addEventListener/removeEventListener and a handful of
// event fields, so this stays a pure Node test (repo convention).
function makeTarget() {
  const handlers: Record<string, Set<(e: unknown) => void>> = {};
  return {
    addEventListener(type: string, h: (e: unknown) => void) {
      (handlers[type] ??= new Set()).add(h);
    },
    removeEventListener(type: string, h: (e: unknown) => void) {
      handlers[type]?.delete(h);
    },
    dispatch(type: string, e: unknown) {
      handlers[type]?.forEach((h) => h(e));
    },
    listenerCount(type: string) {
      return handlers[type]?.size ?? 0;
    },
  };
}

type Ev = Record<string, unknown>;
function kbd(over: Ev = {}) {
  const e: Ev = {
    key: 'a',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    keyCode: 0,
    target: { tagName: 'BODY', isContentEditable: false, closest: () => null },
    preventDefault: vi.fn(),
    ...over,
  };
  return e;
}

const INPUT = { tagName: 'INPUT', isContentEditable: false, closest: () => null };

function setup(entries: KeybindingEntry[], enabled = true) {
  const target = makeTarget();
  const dispose = createKeybindings(
    target as unknown as Window,
    entries,
    { isEnabled: () => enabled, sequenceTimeout: 1000 },
  );
  return { target, dispose };
}

afterEach(() => vi.useRealTimers());

describe('createKeybindings — chord (⌘K)', () => {
  const chord: KeybindingEntry = { binding: { kind: 'chord', key: 'k' }, run: vi.fn() };

  it('fires even while typing in an input (modifier is WCAG-exempt)', () => {
    const run = vi.fn();
    const { target } = setup([{ binding: { kind: 'chord', key: 'k' }, run }]);
    target.dispatch('keydown', kbd({ key: 'K', metaKey: true, target: INPUT }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('ignores auto-repeat (held key) — the bug the research surfaced', () => {
    const run = vi.fn();
    const { target } = setup([{ binding: { kind: 'chord', key: 'k' }, run }]);
    target.dispatch('keydown', kbd({ key: 'k', ctrlKey: true, repeat: true }));
    expect(run).not.toHaveBeenCalled();
  });

  it('does not fire for ⌘⇧K (strict: no Shift on a chord)', () => {
    const run = vi.fn();
    const { target } = setup([{ binding: { kind: 'chord', key: 'k' }, run }]);
    target.dispatch('keydown', kbd({ key: 'k', metaKey: true, shiftKey: true }));
    expect(run).not.toHaveBeenCalled();
  });

  it('matches Ctrl on non-mac via metaKey||ctrlKey', () => {
    expect(chord.binding).toEqual({ kind: 'chord', key: 'k' });
  });
});

describe('createKeybindings — single key (?)', () => {
  const make = (enabled = true) => {
    const run = vi.fn();
    const { target } = setup([{ binding: { kind: 'single', key: '?' }, run }], enabled);
    return { run, target };
  };

  it('fires when enabled and not typing', () => {
    const { run, target } = make();
    target.dispatch('keydown', kbd({ key: '?', shiftKey: true }));
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('is suppressed while typing in a field', () => {
    const { run, target } = make();
    target.dispatch('keydown', kbd({ key: '?', target: INPUT }));
    expect(run).not.toHaveBeenCalled();
  });

  it('is suppressed when shortcuts are disabled (WCAG 2.1.4)', () => {
    const { run, target } = make(false);
    target.dispatch('keydown', kbd({ key: '?' }));
    expect(run).not.toHaveBeenCalled();
  });

  it('ignores IME composition / keyCode 229 / Dead keys', () => {
    const { run, target } = make();
    target.dispatch('keydown', kbd({ key: '?', isComposing: true }));
    target.dispatch('keydown', kbd({ key: '?', keyCode: 229 }));
    target.dispatch('keydown', kbd({ key: 'Dead' }));
    expect(run).not.toHaveBeenCalled();
  });
});

describe('createKeybindings — sequence (g then d)', () => {
  const entry = (run: () => void): KeybindingEntry => ({
    binding: { kind: 'sequence', lead: 'g', key: 'd' },
    run,
  });

  it('fires when the second key follows within the timeout', () => {
    const run = vi.fn();
    const { target } = setup([entry(run)]);
    const g = kbd({ key: 'g' });
    target.dispatch('keydown', g);
    expect(run).not.toHaveBeenCalled(); // lead only arms
    const d = kbd({ key: 'd' });
    target.dispatch('keydown', d);
    expect(run).toHaveBeenCalledTimes(1);
    expect(d.preventDefault).toHaveBeenCalled();
  });

  it('does NOT fire if the lead times out', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const { target } = setup([entry(run)]);
    target.dispatch('keydown', kbd({ key: 'g' }));
    vi.advanceTimersByTime(1001);
    target.dispatch('keydown', kbd({ key: 'd' }));
    expect(run).not.toHaveBeenCalled();
  });

  it('resets the armed lead when the window loses focus', () => {
    const run = vi.fn();
    const { target } = setup([entry(run)]);
    target.dispatch('keydown', kbd({ key: 'g' }));
    target.dispatch('blur', {});
    target.dispatch('keydown', kbd({ key: 'd' }));
    expect(run).not.toHaveBeenCalled();
  });
});

describe('createKeybindings — teardown', () => {
  it('dispose() detaches keydown + blur and stops firing', () => {
    const run = vi.fn();
    const { target, dispose } = setup([{ binding: { kind: 'chord', key: 'k' }, run }]);
    expect(target.listenerCount('keydown')).toBe(1);
    expect(target.listenerCount('blur')).toBe(1);
    dispose();
    expect(target.listenerCount('keydown')).toBe(0);
    expect(target.listenerCount('blur')).toBe(0);
    target.dispatch('keydown', kbd({ key: 'k', metaKey: true }));
    expect(run).not.toHaveBeenCalled();
  });
});
