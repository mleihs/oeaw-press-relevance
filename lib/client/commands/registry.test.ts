import { describe, it, expect } from 'vitest';
import { NAV_SPECS, ACTION_SPECS } from './registry';

// Invariants the palette / keybindings / cheat-sheet all silently depend on.
describe('registry specs', () => {
  it('every nav binding is a "g <key>" sequence with a unique key', () => {
    const combos = NAV_SPECS.filter((s) => s.binding).map((s) => {
      const b = s.binding!;
      expect(b.kind).toBe('sequence');
      return b.kind === 'sequence' ? `${b.lead}${b.key}` : '';
    });
    expect(new Set(combos).size).toBe(combos.length);
  });

  it('exposes exactly one bound action: the cheat-sheet on "?"', () => {
    const bound = ACTION_SPECS.filter((s) => s.binding);
    expect(bound).toHaveLength(1);
    expect(bound[0].action).toBe('cheatsheet.open');
    expect(bound[0].binding).toEqual({ kind: 'single', key: '?' });
  });
});
