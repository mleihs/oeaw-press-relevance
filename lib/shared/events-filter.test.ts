import { describe, it, expect } from 'vitest';
import {
  EVENTS_BAND_VALUES,
  EVENTS_BAND_LABELS,
  isEventsBand,
} from './events-filter';

describe('isEventsBand', () => {
  it('accepts every value in EVENTS_BAND_VALUES', () => {
    for (const v of EVENTS_BAND_VALUES) {
      expect(isEventsBand(v)).toBe(true);
    }
  });

  it('rejects unknown strings + non-strings (defensively typed as unknown)', () => {
    expect(isEventsBand('nope')).toBe(false);
    expect(isEventsBand('')).toBe(false);
    expect(isEventsBand(undefined)).toBe(false);
    expect(isEventsBand(null)).toBe(false);
    expect(isEventsBand(0.7)).toBe(false);
    expect(isEventsBand({})).toBe(false);
  });

  it('has a label for every band (no unlabeled select option)', () => {
    for (const v of EVENTS_BAND_VALUES) {
      expect(EVENTS_BAND_LABELS[v]).toBeTruthy();
    }
  });
});
