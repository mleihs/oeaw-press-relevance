import { describe, it, expect } from 'vitest';
import { setDifference, partitionForPush } from './prod-sync.mjs';

describe('setDifference', () => {
  it('returns ids absent from the present set', () => {
    expect(setDifference(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });
  it('returns [] when all ids are present', () => {
    expect(setDifference(['a', 'b'], new Set(['a', 'b', 'x']))).toEqual([]);
  });
  it('returns all ids against an empty present set', () => {
    expect(setDifference(['a', 'b'], new Set())).toEqual(['a', 'b']);
  });
});

describe('partitionForPush', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  // a: present, unscored (null) · b: present, scored · c: present, score 0
  // (counts as scored — only null is unscored) · d: absent from prod.
  const prodScoreById = new Map([
    ['a', null],
    ['b', 0.73],
    ['c', 0],
  ]);

  it('splits present/missing and present-null/present-scored', () => {
    const p = partitionForPush(rows, prodScoreById, false);
    expect(p.present.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(p.missing.map((r) => r.id)).toEqual(['d']);
    expect(p.presentNull.map((r) => r.id)).toEqual(['a']);
    // 0 is a real score, so c is "scored", not null.
    expect(p.presentScored.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('without overwrite, toWrite is the present-null rows only (never clobber a score)', () => {
    const p = partitionForPush(rows, prodScoreById, false);
    expect(p.toWrite.map((r) => r.id)).toEqual(['a']);
  });

  it('with overwrite, toWrite is every present row', () => {
    const p = partitionForPush(rows, prodScoreById, true);
    expect(p.toWrite.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
