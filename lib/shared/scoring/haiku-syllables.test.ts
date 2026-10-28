import { describe, it, expect } from 'vitest';
import { ruleCount, countWord, checkHaiku, wordsOf, lexiconSize, type Vote } from './haiku-syllables';
import { HAIKU_PATTERN, splitHaiku } from '../haiku';
import FIXTURE from './__fixtures__/haikus-147.json';

// Die Beispiele aus docs/HAIKU_GATE.md. Hier läuft die Regel ALLEIN (wie im
// Bewertungskern der App); die Mehrheit aus drei Zählern testet
// scripts/lib/haiku-syllables.test.mjs.
describe('countWord without extra votes (rule + lexicon)', () => {
  it.each([
    ['über', 2],
    ['Atem', 2],
    ['oder', 2],
    ['Ecke', 2],
    ['Medien', 3],
    ['Museum', 3],
    ['Vakuum', 3],
    ['Quelle', 2],
    ['geehrt', 2],
    ['Nation', 3],
    ['Mai', 1],
  ] as const)('%s = %i', (word, n) => {
    expect(countWord(word)).toMatchObject({ count: n, source: 'regel' });
  });

  it('lets the lexicon overrule the rule (Mosaik)', () => {
    expect(ruleCount('Mosaik')).toBe(2);
    expect(countWord('Mosaik')).toMatchObject({ count: 3, source: 'lexikon', votes: {} });
  });

  it('fails closed on the loanwords the rule is known to miscount', () => {
    expect(countWord('Code')).toMatchObject({ count: null, source: 'unklar', votes: { regel: 2 } });
    expect(countWord('Team')).toMatchObject({ count: null, source: 'unklar' });
  });

  it('fails closed on letters outside the German alphabet', () => {
    expect(countWord('Café')).toMatchObject({ count: null, source: 'unklar' });
  });

  it('keeps the diphthong after be-/ge- and the prefix boundary where it is real', () => {
    // Gefunden beim Bau der Fixture: `bei` kam ohne die beiden anderen Zähler auf 2.
    for (const [w, n] of [
      ['bei', 1], ['beim', 1], ['beide', 2], ['Beile', 2], ['Geist', 1], ['Beute', 2],
      ['geimpft', 2], ['beirren', 3], ['beinhalten', 4], ['beurteilen', 4], ['beunruhigen', 5],
      ['beachten', 3], ['geändert', 3], ['beeilen', 3],
    ] as const) {
      expect(ruleCount(w), w).toBe(n);
    }
  });
});

describe('countWord with extra votes (CLI majority)', () => {
  it('lets two votes outvote the third', () => {
    expect(countWord('Nation', { hypher: 3, espeak: 2 })).toMatchObject({ count: 3, source: 'mehrheit' });
  });

  it('lets the extra votes rescue a loanword the rule alone refuses', () => {
    expect(countWord('Code', { hypher: 1, espeak: 1 })).toMatchObject({ count: 1, source: 'mehrheit' });
  });

  it('reports no count when no two votes agree', () => {
    const votes: Record<string, Vote> = { hypher: 7, espeak: null };
    expect(countWord('Atem', votes)).toMatchObject({ count: null, source: 'unklar', votes: { regel: 2, hypher: 7, espeak: null } });
  });

  it('still lets the lexicon win', () => {
    expect(countWord('Mosaik', { hypher: 2, espeak: 2 })).toMatchObject({ count: 3, source: 'lexikon' });
  });
});

describe('checkHaiku', () => {
  it('passes a correct haiku with the rule alone', () => {
    const r = checkHaiku('Gletscher schmelzen fort / das Meer steigt Millimeter / und jedes Jahr mehr');
    expect(r.ok).toBe(true);
    expect(r.counts).toEqual([5, 7, 5]);
  });

  it('names the line and the words when a count is off', () => {
    const r = checkHaiku('Gletscher schmelzen sehr fort / das Meer steigt Millimeter / und jedes Jahr mehr');
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatchObject({ kind: 'silben', code: 'silbenzahl', line: 1 });
    expect(r.issues[0].message).toContain('6 Silben statt 5');
  });

  it('marks an unclear word and blocks the haiku', () => {
    const r = checkHaiku('Ein neuer Code läuft / das Meer steigt Millimeter / und jedes Jahr mehr');
    expect(r.ok).toBe(false);
    expect(r.counts[0]).toBeNull();
    expect(r.unclear.map((u) => u.word)).toEqual(['Code']);
    expect(r.issues[0].message).toContain('Code (Regel 2)');
  });

  it('uses extra votes per word where the caller supplies them', () => {
    const votes = new Map([['Code', { hypher: 1, espeak: 1 }]]);
    const r = checkHaiku('Ein neuer Code läuft / das Meer steigt Millimeter / und jedes Jahr mehr', votes);
    expect(r.counts[0]).toBe(5);
  });

  it('carries structural failures through', () => {
    const r = checkHaiku('nur zwei Zeilen / mehr gibt es hier nicht');
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.kind === 'struktur')).toBe(true);
    expect(checkHaiku(null).ok).toBe(false);
  });
});

describe('fixture: 147 hand-checked lines from the session cohorts', () => {
  const lines = FIXTURE.lines;

  it('is what it claims to be', () => {
    expect(lines).toHaveLength(147);
    for (const l of lines) {
      expect(wordsOf(l.line)).toEqual(l.words.map(([w]) => w));
      expect(l.words.reduce((s, [, n]) => s + Number(n), 0)).toBe(l.expected);
    }
  });

  it('is counted correctly by rule + lexicon alone in at least 99 % of lines', () => {
    const correct = lines.filter((l) => {
      const counts = wordsOf(l.line).map((w) => countWord(w).count);
      return counts.every((c) => c !== null) && counts.reduce((s, c) => s + (c ?? 0), 0) === l.expected;
    });
    expect(correct.length / lines.length).toBeGreaterThanOrEqual(0.99);
  });

  it('passes every fixture haiku through the app-side gate', () => {
    const haikus = new Map<string, string[]>();
    for (const l of lines) haikus.set(l.publication_id, [...(haikus.get(l.publication_id) ?? []), l.line]);
    for (const parts of haikus.values()) {
      const text = parts.join(' / ');
      expect(splitHaiku(text)).not.toBeNull();
      expect(checkHaiku(text).counts, text).toEqual([...HAIKU_PATTERN]);
    }
  });
});

describe('lexiconSize', () => {
  it('counts the lexicon entries, not the meta keys', () => {
    expect(lexiconSize()).toBeGreaterThanOrEqual(7);
  });
});
