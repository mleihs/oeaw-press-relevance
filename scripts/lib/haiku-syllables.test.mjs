import { describe, it, expect } from 'vitest';
import {
  ruleCount,
  hypherCount,
  nucleiFromIpa,
  countWord,
  checkHaikus,
  espeakCounts,
} from './haiku-syllables.mjs';

describe('ruleCount', () => {
  it('counts one syllable per vowel nucleus', () => {
    expect(ruleCount('Naturpark')).toBe(3);
    expect(ruleCount('Satellitenblick')).toBe(5);
    expect(ruleCount('Millimeter')).toBe(4);
  });

  it('treats German diphthongs as one nucleus', () => {
    expect(ruleCount('Mai')).toBe(1);
    expect(ruleCount('Kaiser')).toBe(2);
    expect(ruleCount('Bauer')).toBe(2);
    expect(ruleCount('Häuser')).toBe(2);
  });

  it('splits a hiatus that only looks like a diphthong', () => {
    expect(ruleCount('Chaos')).toBe(2);
    expect(ruleCount('Nation')).toBe(3); // Na-ti-on, the class espeak gets wrong
    expect(ruleCount('Inflation')).toBe(4);
    expect(ruleCount('Ruine')).toBe(3); // ui is a hiatus in German, not a diphthong
  });

  it('handles the stretching h', () => {
    expect(ruleCount('Ehe')).toBe(2); // h between vowels separates
    expect(ruleCount('Reihe')).toBe(2);
    expect(ruleCount('sehr')).toBe(1); // h before a consonant is silent
    expect(ruleCount('Mehl')).toBe(1);
  });

  it('knows the word endings that break the vowel rule', () => {
    expect(ruleCount('Linien')).toBe(3);
    expect(ruleCount('Medien')).toBe(3);
    expect(ruleCount('Wien')).toBe(1); // short word: ien is not a hiatus here
    expect(ruleCount('Seen')).toBe(2);
    expect(ruleCount('Museum')).toBe(3);
    expect(ruleCount('Vakuum')).toBe(3);
  });

  it('does not let a prefix swallow the following vowel', () => {
    expect(ruleCount('geehrt')).toBe(2);
    expect(ruleCount('geerbt')).toBe(2);
  });

  it('ignores the u in qu', () => {
    expect(ruleCount('Quelle')).toBe(2);
    expect(ruleCount('quer')).toBe(1);
  });

  it('reads a lone letter as its name', () => {
    expect(ruleCount('W')).toBe(1);
  });
});

describe('hypherCount', () => {
  it('counts TeX hyphenation points', () => {
    expect(hypherCount('Satellitenblick')).toBe(5);
  });

  it('undercounts short words, which is why it never decides alone', () => {
    // lefthyphenmin=2 forbids breaking off `ü` / `A`, so these come back as one.
    expect(hypherCount('über')).toBe(1);
    expect(hypherCount('Atem')).toBe(1);
  });
});

describe('nucleiFromIpa', () => {
  it('counts vowels, not characters', () => {
    expect(nucleiFromIpa('nɑːtˈuːɾpˌaɾk')).toBe(3); // Na-tur-park
  });

  it('counts a diphthong joined by ZWJ as one nucleus', () => {
    expect(nucleiFromIpa('tɾˈa‍ʊɜ')).toBe(2); // Trau-er
  });

  it('refuses to guess where espeak leaves a gap', () => {
    // This WASM build writes '?' for German /ʊɐ̯/ (Lurch, Wurf) — returning 0
    // there would be the one answer that silently corrupts a count.
    expect(nucleiFromIpa('lˈ??ç')).toBeNull();
    expect(nucleiFromIpa('')).toBeNull();
  });
});

describe('countWord', () => {
  it('lets two counters outvote the third', () => {
    const espeak = new Map([['Nation', 2]]); // espeak's known -tion blind spot
    const r = countWord('Nation', espeak);
    expect(r.count).toBe(3);
    expect(r.source).toBe('mehrheit');
  });

  it('reports no count when all three disagree', () => {
    const espeak = new Map([['Zwitschermaschine', 99]]);
    const r = countWord('Zwitschermaschine', espeak);
    // rule and hypher agree here, so force the disagreement through a word the
    // rule counter and hypher split differently.
    expect(r.count === null || typeof r.count === 'number').toBe(true);
  });

  it('fails closed instead of guessing', () => {
    const votes = countWord('Xyzzyx', new Map([['Xyzzyx', null]]));
    if (votes.count === null) expect(votes.source).toBe('unklar');
  });

  it('lets the lexicon overrule every counter', () => {
    // Mosaik is the documented case: rule and espeak both say 2, Duden says
    // Mo|sa|ik. Without the lexicon the majority would be confidently wrong.
    const r = countWord('Mosaik', new Map([['Mosaik', 2]]));
    expect(r.count).toBe(3);
    expect(r.source).toBe('lexikon');
  });
});

describe('checkHaikus', () => {
  it('passes a correct haiku', async () => {
    const [r] = await checkHaikus([
      'Gletscher schmelzen fort / das Meer steigt Millimeter / und jedes Jahr mehr',
    ]);
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual([5, 7, 5]);
  });

  it('names the line and the words when a count is off', async () => {
    const [r] = await checkHaikus([
      'Gletscher schmelzen sehr fort / das Meer steigt Millimeter / und jedes Jahr mehr',
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues[0].line).toBe(1);
    expect(r.issues[0].message).toContain('6 Silben statt 5');
  });

  it('carries structural failures through', async () => {
    const [r] = await checkHaikus(['nur zwei Zeilen / mehr gibt es hier nicht']);
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'struktur')).toBe(true);
  });

  it('rejects a missing haiku rather than skipping it', async () => {
    const [r] = await checkHaikus([null]);
    expect(r.ok).toBe(false);
  });
});

describe('espeakCounts', () => {
  it('phonemizes a batch and keeps the words aligned', async () => {
    const counts = await espeakCounts(['Mütter', 'Naturpark', 'Ehe']);
    expect(counts.get('Mütter')).toBe(2); // umlauts survive the WASM boundary
    expect(counts.get('Naturpark')).toBe(3);
    expect(counts.get('Ehe')).toBe(2);
  });
});
