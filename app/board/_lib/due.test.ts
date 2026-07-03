import { describe, it, expect } from 'vitest';
import { dueState, formatDueLabel, relativeDay } from './due';

const NOW = new Date('2026-07-03T12:00:00Z');

describe('dueState', () => {
  it('none ohne Datum', () => {
    expect(dueState(null, null, NOW)).toBe('none');
  });
  it('overdue = offen und vor heute', () => {
    expect(dueState('2026-07-01T00:00:00Z', null, NOW)).toBe('overdue');
  });
  it('erledigte Karten sind nie overdue/soon', () => {
    expect(dueState('2026-07-01T00:00:00Z', '2026-07-02T00:00:00Z', NOW)).toBe('normal');
  });
  it('soon = 0..3 Tage', () => {
    expect(dueState('2026-07-03T20:00:00Z', null, NOW)).toBe('soon'); // heute
    expect(dueState('2026-07-06T00:00:00Z', null, NOW)).toBe('soon'); // +3
  });
  it('normal = weiter als 3 Tage', () => {
    expect(dueState('2026-07-10T00:00:00Z', null, NOW)).toBe('normal');
  });
});

describe('formatDueLabel', () => {
  it('D. Mon ohne Jahr im laufenden Jahr', () => {
    expect(formatDueLabel('2026-07-08T00:00:00Z', NOW)).toBe('8. Jul');
  });
  it('mit Jahr wenn abweichend', () => {
    expect(formatDueLabel('2027-01-05T00:00:00Z', NOW)).toBe('5. Jan 2027');
  });
});

describe('relativeDay', () => {
  it('heute/gestern/vor N Tagen', () => {
    expect(relativeDay('2026-07-03T08:00:00Z', NOW)).toBe('heute');
    expect(relativeDay('2026-07-02T08:00:00Z', NOW)).toBe('gestern');
    expect(relativeDay('2026-06-28T08:00:00Z', NOW)).toBe('vor 5 Tagen');
  });
});
