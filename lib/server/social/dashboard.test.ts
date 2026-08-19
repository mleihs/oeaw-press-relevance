import { describe, expect, it } from 'vitest';
import { momentumPct } from './dashboard';
import type { SocialPost } from '@/lib/shared/types';

// Fenster: 14 Tage, Anker = windowStart + windowMs. Die Hälfte trennt bei Tag 7.
const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const WINDOW_START = new Date('2026-08-05T11:00:00Z').getTime();
const DAY = 24 * 60 * 60 * 1000;

/** Post mit Alter in Tagen ab Fensterbeginn und Like-Zahl. */
function post(dayOffset: number, likes: number): SocialPost {
  return {
    id: `p${dayOffset}-${likes}`,
    posted_at: new Date(WINDOW_START + dayOffset * DAY).toISOString(),
    like_count: likes,
  } as SocialPost;
}

describe('momentumPct', () => {
  it('rechnet den Zuwachs gegen die ältere Fensterhälfte', () => {
    // ältere Hälfte 400, neuere 500 → +25 %
    expect(momentumPct([post(2, 400), post(10, 500)], WINDOW_START, WINDOW_MS)).toBe(25);
  });

  it('gibt Rückgänge negativ zurück', () => {
    expect(momentumPct([post(2, 1000), post(10, 500)], WINDOW_START, WINDOW_MS)).toBe(-50);
  });

  it('liefert null, wenn die ältere Hälfte leer ist', () => {
    expect(momentumPct([post(10, 500)], WINDOW_START, WINDOW_MS)).toBeNull();
  });

  it('liefert null, wenn die Basis zu dünn für eine Prozentzahl ist', () => {
    // der reale Fall vom 2026-08-19: 84 gegen 96.547 Likes ergäbe +114837 %
    expect(momentumPct([post(2, 84), post(10, 96_547)], WINDOW_START, WINDOW_MS)).toBeNull();
  });

  it('behält kleine Themen, solange die Basis anteilig trägt', () => {
    // 10 gegen 90 Likes = 10 % Basisanteil, über der Schwelle → +800 %
    expect(momentumPct([post(2, 10), post(10, 90)], WINDOW_START, WINDOW_MS)).toBe(800);
  });

  it('ignoriert Posts ohne Datum', () => {
    const undated = { id: 'x', posted_at: null, like_count: 9999 } as unknown as SocialPost;
    expect(momentumPct([post(2, 400), post(10, 500), undated], WINDOW_START, WINDOW_MS)).toBe(25);
  });
});
