import { describe, it, expect } from 'vitest';
import { EVENTS_TAB_VALUES, isEventsTab } from './list';

describe('isEventsTab', () => {
  it('accepts every value in EVENTS_TAB_VALUES', () => {
    for (const v of EVENTS_TAB_VALUES) {
      expect(isEventsTab(v)).toBe(true);
    }
  });

  it('rejects unknown strings + non-strings (defensively typed as unknown)', () => {
    expect(isEventsTab('nope')).toBe(false);
    expect(isEventsTab('')).toBe(false);
    expect(isEventsTab(undefined)).toBe(false);
    expect(isEventsTab(null)).toBe(false);
    expect(isEventsTab(42)).toBe(false);
    expect(isEventsTab({})).toBe(false);
  });

  it('keeps `upcoming` as the first/default tab so the page-level fallback stays correct', () => {
    expect(EVENTS_TAB_VALUES[0]).toBe('upcoming');
  });
});
