import { describe, it, expect } from 'vitest';
import { reconstructAbstract } from './openalex';

describe('reconstructAbstract', () => {
  it('reassembles words by their position', () => {
    // "the quick brown fox"
    const inverted = {
      the: [0],
      quick: [1],
      brown: [2],
      fox: [3],
    };
    expect(reconstructAbstract(inverted)).toBe('the quick brown fox');
  });

  it('handles repeated words at multiple positions', () => {
    // "the cat sat on the mat" — `the` at pos 0 and 4
    const inverted = {
      the: [0, 4],
      cat: [1],
      sat: [2],
      on: [3],
      mat: [5],
    };
    expect(reconstructAbstract(inverted)).toBe('the cat sat on the mat');
  });

  it('returns empty string for empty index', () => {
    expect(reconstructAbstract({})).toBe('');
  });

  it('preserves arbitrary insertion order — only positions matter', () => {
    // Same content as test 1, but iterated in a non-natural order
    const inverted = {
      fox: [3],
      the: [0],
      brown: [2],
      quick: [1],
    };
    expect(reconstructAbstract(inverted)).toBe('the quick brown fox');
  });
});
