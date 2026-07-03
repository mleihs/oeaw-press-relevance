import { describe, it, expect } from 'vitest';
import {
  computeCalendarWindow,
  isCalendarView,
} from './calendar-range';

describe('isCalendarView', () => {
  it('accepts the two calendar views', () => {
    expect(isCalendarView('week')).toBe(true);
    expect(isCalendarView('month')).toBe(true);
  });
  it('rejects everything else', () => {
    for (const v of ['list', 'day', '', undefined, null, 1]) {
      expect(isCalendarView(v)).toBe(false);
    }
  });
});

describe('computeCalendarWindow — month', () => {
  const w = computeCalendarWindow('month', '2026-07-15');

  it('pads the month to full Monday–Sunday weeks', () => {
    expect(w.gridStart).toBe('2026-06-29'); // Monday before Jul 1
    expect(w.gridEnd).toBe('2026-08-02'); // Sunday after Jul 31
  });

  it('derives a half-open instant window at Vienna midnight (UTC+2 in summer)', () => {
    expect(w.fromInstant).toBe('2026-06-28T22:00:00Z');
    expect(w.toInstant).toBe('2026-08-02T22:00:00Z'); // midnight after gridEnd
  });

  it('navigates by whole months from the 1st', () => {
    expect(w.prevAnchor).toBe('2026-06-01');
    expect(w.nextAnchor).toBe('2026-08-01');
  });

  it('normalises the anchor', () => {
    expect(w.anchor).toBe('2026-07-15');
    expect(w.view).toBe('month');
  });
});

describe('computeCalendarWindow — month across DST (winter = UTC+1)', () => {
  // Jan 1 2026 is a Thursday → grid starts Mon 2025-12-29 (spills into the prior
  // year); Vienna is UTC+1 in winter, so midnight maps to 23:00Z the previous
  // day (vs 22:00Z in summer) — the point of this test.
  const w = computeCalendarWindow('month', '2026-01-15');
  it('uses the winter offset for the instant bounds', () => {
    expect(w.gridStart).toBe('2025-12-29');
    expect(w.fromInstant).toBe('2025-12-28T23:00:00Z');
  });
});

describe('computeCalendarWindow — week', () => {
  const w = computeCalendarWindow('week', '2026-07-15'); // a Wednesday
  it('spans Monday–Sunday of the anchor week', () => {
    expect(w.gridStart).toBe('2026-07-13');
    expect(w.gridEnd).toBe('2026-07-19');
  });
  it('navigates by 7 days', () => {
    expect(w.prevAnchor).toBe('2026-07-08');
    expect(w.nextAnchor).toBe('2026-07-22');
  });
});

describe('computeCalendarWindow — robustness', () => {
  it('falls back to a valid window for a malformed ?date', () => {
    const w = computeCalendarWindow('month', 'not-a-date');
    expect(w.view).toBe('month');
    // gridStart <= gridEnd, both ISO civil dates
    expect(w.gridStart <= w.gridEnd).toBe(true);
    expect(w.gridStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('treats containsToday as a boolean', () => {
    const w = computeCalendarWindow('month', '2026-07-15');
    expect(typeof w.containsToday).toBe('boolean');
  });
});
