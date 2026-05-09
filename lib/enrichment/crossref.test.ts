import { describe, it, expect, vi, afterEach } from 'vitest';
import { enrichFromCrossRef } from './crossref';

afterEach(() => vi.restoreAllMocks());

function mockFetch(payload: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }));
}

describe('enrichFromCrossRef', () => {
  it('extracts title, authors, journal, abstract, year from CrossRef shape', async () => {
    mockFetch({
      message: {
        title: ['A Test Paper'],
        author: [
          { given: 'Jane', family: 'Doe' },
          { given: 'John', family: 'Smith' },
        ],
        'container-title': ['Test Journal'],
        abstract: '<jats:p>This is the abstract.</jats:p>',
        subject: ['biology', 'genetics'],
        'published-print': { 'date-parts': [[2024, 5, 15]] },
      },
    });
    const r = await enrichFromCrossRef('10.1234/test');
    expect(r?.title).toBe('A Test Paper');
    expect(r?.authors).toEqual(['Jane Doe', 'John Smith']);
    expect(r?.journal).toBe('Test Journal');
    expect(r?.abstract).toBe('This is the abstract.');
    expect(r?.published_at).toBe('2024-05-15');
    expect(r?.keywords).toEqual(['biology', 'genetics']);
  });

  it('returns null on non-OK response', async () => {
    mockFetch({}, false);
    expect(await enrichFromCrossRef('10.1234/missing')).toBeNull();
  });

  it('handles missing optional fields gracefully', async () => {
    mockFetch({ message: { title: ['Bare Paper'] } });
    const r = await enrichFromCrossRef('10.1234/bare');
    expect(r?.title).toBe('Bare Paper');
    expect(r?.authors).toBeUndefined();
    expect(r?.abstract).toBeUndefined();
  });
});
