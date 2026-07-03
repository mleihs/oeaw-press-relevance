import { describe, it, expect } from 'vitest';
import { initialRanks, isValidRank, rankBetween, RANK_PATTERN } from './rank';

/** Every rank this module hands out must satisfy the stored-rank invariant. */
function expectValid(rank: string) {
  expect(rank).toMatch(RANK_PATTERN);
}

describe('isValidRank', () => {
  it('accepts lowercase ranks that do not end in the minimal character', () => {
    expect(isValidRank('n')).toBe(true);
    expect(isValidRank('ab')).toBe(true);
    expect(isValidRank('zzb')).toBe(true);
  });

  it('rejects the empty string, trailing "a" and foreign characters', () => {
    expect(isValidRank('')).toBe(false);
    expect(isValidRank('a')).toBe(false);
    expect(isValidRank('ba')).toBe(false);
    expect(isValidRank('N')).toBe(false);
    expect(isValidRank('a1')).toBe(false);
    expect(isValidRank('a b')).toBe(false);
  });
});

describe('rankBetween', () => {
  it('seeds an empty list from two open ends', () => {
    expect(rankBetween(null, null)).toBe('n');
  });

  it('inserts before and after everything', () => {
    const first = rankBetween(null, 'n');
    const last = rankBetween('n', null);
    expect(first < 'n').toBe(true);
    expect(last > 'n').toBe(true);
    expectValid(first);
    expectValid(last);
  });

  it('returns a rank strictly between its bounds', () => {
    const cases: [string, string][] = [
      ['b', 'd'],
      ['b', 'c'], // adjacent characters
      ['bz', 'c'], // prev runs into 'z'
      ['ab', 'ac'],
      ['n', 'nb'], // prev is a prefix of next
      ['n', 'naab'], // next descends through minimal chars
      ['abc', 'abd'],
      ['zzzb', 'zzzc'],
    ];
    for (const [prev, next] of cases) {
      const mid = rankBetween(prev, next);
      expect(prev < mid, `${prev} < ${mid}`).toBe(true);
      expect(mid < next, `${mid} < ${next}`).toBe(true);
      expectValid(mid);
    }
  });

  it('keeps working when one side gets repeatedly subdivided', () => {
    // Worst case for fractional ranks: always insert at the same end.
    let hi = 'n';
    for (let i = 0; i < 100; i++) {
      const mid = rankBetween(null, hi);
      expect(mid < hi).toBe(true);
      expectValid(mid);
      hi = mid;
    }
    let lo = 'n';
    for (let i = 0; i < 100; i++) {
      const mid = rankBetween(lo, null);
      expect(mid > lo).toBe(true);
      expectValid(mid);
      lo = mid;
    }
  });

  it('survives randomized insertions without breaking the order', () => {
    // Deterministic LCG so failures reproduce.
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };
    const ranks: string[] = [];
    for (let i = 0; i < 500; i++) {
      const at = rand(ranks.length + 1);
      const prev = at > 0 ? ranks[at - 1] : null;
      const next = at < ranks.length ? ranks[at] : null;
      const mid = rankBetween(prev, next);
      expectValid(mid);
      ranks.splice(at, 0, mid);
    }
    const sorted = [...ranks].sort();
    expect(ranks).toEqual(sorted);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('rejects out-of-order or equal bounds', () => {
    expect(() => rankBetween('c', 'b')).toThrow(RangeError);
    expect(() => rankBetween('n', 'n')).toThrow(RangeError);
  });

  it('rejects bounds that violate the stored-rank invariant', () => {
    expect(() => rankBetween('a', 'b')).toThrow(RangeError);
    expect(() => rankBetween('b', 'ca')).toThrow(RangeError);
    expect(() => rankBetween('', 'b')).toThrow(RangeError);
    expect(() => rankBetween('A', null)).toThrow(RangeError);
  });
});

describe('initialRanks', () => {
  it('returns an empty list for zero items', () => {
    expect(initialRanks(0)).toEqual([]);
  });

  it('rejects negative or fractional counts', () => {
    expect(() => initialRanks(-1)).toThrow(RangeError);
    expect(() => initialRanks(1.5)).toThrow(RangeError);
  });

  it.each([1, 2, 8, 24, 25, 26, 200])('produces %i valid, sorted, unique ranks', (count) => {
    const ranks = initialRanks(count);
    expect(ranks).toHaveLength(count);
    for (const rank of ranks) expectValid(rank);
    expect(ranks).toEqual([...ranks].sort());
    expect(new Set(ranks).size).toBe(count);
  });

  it('stays short for typical seeds (8 board columns)', () => {
    for (const rank of initialRanks(8)) expect(rank).toHaveLength(1);
  });

  it('leaves room to insert at every position, including both ends', () => {
    const ranks = initialRanks(30);
    expect(rankBetween(null, ranks[0]) < ranks[0]).toBe(true);
    expect(rankBetween(ranks[ranks.length - 1], null) > ranks[ranks.length - 1]).toBe(true);
    for (let i = 0; i + 1 < ranks.length; i++) {
      const mid = rankBetween(ranks[i], ranks[i + 1]);
      expect(ranks[i] < mid && mid < ranks[i + 1]).toBe(true);
    }
  });
});
