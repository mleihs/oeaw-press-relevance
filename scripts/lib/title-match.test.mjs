import { describe, it, expect } from 'vitest';
import {
  normTitle,
  isMatchableTitle,
  stripJats,
  openalexAbstract,
  pickExactTitleMatch,
} from './title-match.mjs';

describe('normTitle', () => {
  it('strips entities + tags, folds diacritics, collapses to a space key', () => {
    expect(normTitle('Müller &amp; Co. <b>Study</b>')).toBe('muller co study');
  });
  it('treats punctuation/case/whitespace differences as equal', () => {
    expect(normTitle('Climate-Change: Impacts!')).toBe(
      normTitle('  climate   change   impacts  '),
    );
  });
  it('is null/undefined safe', () => {
    expect(normTitle(null)).toBe('');
    expect(normTitle(undefined)).toBe('');
  });
});

describe('isMatchableTitle', () => {
  it('accepts a specific multi-word title', () => {
    expect(isMatchableTitle(normTitle('Climate change impacts on alpine flora'))).toBe(true);
  });
  it('rejects titles under three words', () => {
    expect(isMatchableTitle(normTitle('Short title'))).toBe(false);
  });
  it('rejects generic front-matter titles', () => {
    expect(isMatchableTitle('introduction')).toBe(false);
    expect(isMatchableTitle('buchbesprechung')).toBe(false);
  });
});

describe('stripJats', () => {
  it('removes tags and collapses whitespace', () => {
    expect(stripJats('<jats:p>Hello   world</jats:p>')).toBe('Hello world');
  });
  it('is null safe', () => {
    expect(stripJats(null)).toBe('');
  });
});

describe('openalexAbstract', () => {
  it('reconstructs text from an inverted index regardless of key order', () => {
    expect(openalexAbstract({ world: [1], Hello: [0] })).toBe('Hello world');
  });
  it('returns empty string for a missing/invalid index', () => {
    expect(openalexAbstract(null)).toBe('');
    expect(openalexAbstract('nope')).toBe('');
  });
});

describe('pickExactTitleMatch', () => {
  const norm = normTitle('Climate change impacts on alpine flora');

  it('returns null when no candidate title matches exactly', () => {
    const cands = [{ title: 'Something else entirely here', year: 2020, abstract: '', doi: '10.1/x' }];
    expect(pickExactTitleMatch(cands, norm, 2020)).toBeNull();
  });

  it('rejects an exact title whose known year is more than 1 off', () => {
    const cands = [
      { title: 'Climate change impacts on alpine flora', year: 2017, abstract: 'a', doi: '10.1/x' },
    ];
    expect(pickExactTitleMatch(cands, norm, 2020)).toBeNull();
  });

  it('keeps an exact title with an unknown year even when the pub year is known', () => {
    const cands = [
      { title: 'Climate change impacts on alpine flora', year: null, abstract: 'a', doi: '10.1/x' },
    ];
    expect(pickExactTitleMatch(cands, norm, 2020)?.doi).toBe('10.1/x');
  });

  it('prefers the longest abstract, then a candidate carrying a DOI', () => {
    const cands = [
      { src: 'a', title: 'Climate change impacts on alpine flora', year: 2020, abstract: 'short', doi: null },
      { src: 'b', title: 'Climate-change impacts on alpine flora!', year: 2021, abstract: 'a much longer abstract', doi: '10.1/y' },
      { src: 'c', title: 'climate change impacts on alpine flora', year: 2019, abstract: 'a much longer abstract', doi: null },
    ];
    // 'b' and 'c' tie on abstract length; 'b' wins on having a DOI.
    expect(pickExactTitleMatch(cands, norm, 2020)?.src).toBe('b');
  });
});
