import { describe, it, expect } from 'vitest';
import { evaluationProblems, isUnitScore } from './evaluation';

const spec = { dimensions: ['a', 'b'], texts: ['pitch'] };

describe('evaluationProblems', () => {
  it('lässt eine vollständige Bewertung durch', () => {
    expect(evaluationProblems({ a: 0, b: 1, pitch: 'Text' }, spec)).toEqual([]);
  });

  it('meldet fehlende, nicht numerische und außerhalb liegende Dimensionen einzeln', () => {
    expect(evaluationProblems({ a: '0.5', b: 1.2, pitch: 'Text' }, spec)).toEqual([
      'a="0.5" (erwartet Zahl 0..1)',
      'b=1.2 (erwartet Zahl 0..1)',
    ]);
    expect(evaluationProblems({ b: 0.3, pitch: 'Text' }, spec)).toEqual(['a=undefined (erwartet Zahl 0..1)']);
  });

  it('verlangt Pflichttexte nicht leer, prüft ohne `texts` aber keine', () => {
    expect(evaluationProblems({ a: 0.1, b: 0.2, pitch: '  ' }, spec)).toEqual(['pitch fehlt']);
    expect(evaluationProblems({ a: 0.1, b: 0.2 }, { dimensions: ['a', 'b'] })).toEqual([]);
  });

  it('übersteht Nicht-Objekte', () => {
    expect(evaluationProblems(null, { dimensions: ['a'] })).toEqual(['a=undefined (erwartet Zahl 0..1)']);
  });
});

describe('isUnitScore', () => {
  it.each([
    [0, true],
    [1, true],
    [0.42, true],
    [-0.01, false],
    [1.01, false],
    [Number.NaN, false],
    [Number.POSITIVE_INFINITY, false],
    ['0.5', false],
  ])('%s → %s', (v, ok) => {
    expect(isUnitScore(v)).toBe(ok);
  });
});
