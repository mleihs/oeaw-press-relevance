import { describe, it, expect } from 'vitest';
import { oneOfEachGroup, pairResults, partitionKeepingGroups, twinPositions } from './batching';

const items = (...ids: string[]) => ids.map((id) => ({ id }));
const ids = (batches: Array<Array<{ id: string }>>) => batches.map((b) => b.map((x) => x.id).join(''));

describe('oneOfEachGroup', () => {
  it('behält je Gruppe das erste vorhandene Mitglied und alle Einzelnen, in Reihenfolge', () => {
    const out = oneOfEachGroup(items('a', 'b', 'c', 'd', 'e'), [['b', 'd'], ['e', 'x']]);
    expect(out.map((x) => x.id).join('')).toBe('abce');
  });

  it('lässt ohne Gruppen alles stehen', () => {
    expect(oneOfEachGroup(items('a', 'b'), []).map((x) => x.id).join('')).toBe('ab');
  });
});

describe('partitionKeepingGroups', () => {
  it('schneidet ohne Gruppen stur nach Größe', () => {
    expect(ids(partitionKeepingGroups(items('a', 'b', 'c', 'd', 'e', 'f', 'g'), 5))).toEqual(['abcde', 'fg']);
  });

  it('trennt ein Paar an der Grenze nicht, sondern zieht es in den nächsten Batch', () => {
    const out = partitionKeepingGroups(items('a', 'b', 'c', 'd', 'e', 'f'), 5, [['e', 'f']]);
    expect(ids(out)).toEqual(['abcd', 'ef']);
  });

  it('holt ein späteres Gruppenmitglied an die Stelle des ersten', () => {
    const out = partitionKeepingGroups(items('a', 'b', 'c', 'd', 'e', 'f', 'g'), 5, [['b', 'g']]);
    expect(ids(out)).toEqual(['abgcd', 'ef']);
  });

  it('schneidet eine Gruppe, die allein zu groß ist, am Stück', () => {
    const out = partitionKeepingGroups(items('x', 'a', 'b', 'c', 'y'), 2, [['a', 'b', 'c']]);
    expect(ids(out)).toEqual(['x', 'ab', 'c', 'y']);
  });

  it('ignoriert Gruppenmitglieder, die nicht in der Liste stehen', () => {
    expect(ids(partitionKeepingGroups(items('a', 'b'), 5, [['b', 'zz']]))).toEqual(['ab']);
  });
});

describe('twinPositions', () => {
  it('nennt nur Gruppen mit mindestens zwei Mitgliedern im Batch, 1-basiert', () => {
    expect(twinPositions(items('a', 'b', 'c', 'd'), [['d', 'b'], ['a', 'zz']])).toEqual([[2, 4]]);
  });
});

describe('pairResults', () => {
  const batch = ['A', 'B', 'C'];
  const idx = (r: { i?: number }) => r.i;

  it('ordnet über den gemeldeten Index zu, auch wenn eine Bewertung fehlt', () => {
    const { pairs, via } = pairResults(batch, [{ i: 3 }, { i: 1 }], idx);
    expect(via).toBe('index');
    expect(pairs.map((p) => p.item)).toEqual(['C', 'A']);
  });

  it('fällt bei fehlenden Indizes und gleicher Anzahl auf die Position zurück', () => {
    const { pairs, via } = pairResults(batch, [{}, {}, {}], idx);
    expect(via).toBe('position');
    expect(pairs.map((p) => p.item)).toEqual(['A', 'B', 'C']);
  });

  it('ordnet gar nicht zu, wenn Indizes doppelt sind und die Anzahl nicht passt', () => {
    expect(pairResults(batch, [{ i: 1 }, { i: 1 }], idx)).toEqual({ pairs: [], via: 'none' });
    expect(pairResults(batch, [{ i: 4 }], idx).via).toBe('none');
  });
});
