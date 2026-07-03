import { describe, it, expect } from 'vitest';
import { pubDatePrecision, formatPubDate, pubDateTitle } from './format-pub-date';

describe('pubDatePrecision', () => {
  it('treats a real day-of-month as day-precise', () => {
    expect(pubDatePrecision('2026-06-08')).toBe('day');
    expect(pubDatePrecision('2026-01-08')).toBe('day'); // real January day, not padding
  });

  it('treats the padding days (1 and 15) with a real month as month-precise', () => {
    expect(pubDatePrecision('2026-06-01')).toBe('month');
    expect(pubDatePrecision('2026-06-15')).toBe('month');
  });

  it('treats January padding (month 1 + padded day) as year-only', () => {
    expect(pubDatePrecision('2026-01-01')).toBe('year');
    expect(pubDatePrecision('2026-01-15')).toBe('year');
  });
});

describe('formatPubDate', () => {
  it('formats at the defensible precision (de locale)', () => {
    expect(formatPubDate('2026-06-08')).toBe('8. Juni 2026');
    expect(formatPubDate('2026-06-15')).toBe('Juni 2026');
    expect(formatPubDate('2026-01-01')).toBe('2026');
  });

  it('returns an en-dash for a missing date', () => {
    expect(formatPubDate(null)).toBe('–');
    expect(formatPubDate(undefined)).toBe('–');
  });
});

describe('pubDateTitle', () => {
  it('states the precision honestly', () => {
    expect(pubDateTitle('2026-06-08')).toBe('Erschienen am 8. Juni 2026');
    expect(pubDateTitle('2026-06-15')).toBe('Erschienen im Juni 2026 (Tag nicht überliefert)');
    expect(pubDateTitle('2026-01-01')).toBe('Erschienen 2026 (nur Jahr überliefert)');
    expect(pubDateTitle(null)).toBeUndefined();
  });
});
