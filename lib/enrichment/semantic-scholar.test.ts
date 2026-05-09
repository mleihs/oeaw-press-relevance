import { describe, it, expect, vi, afterEach } from 'vitest';
import { enrichFromSemanticScholar } from './semantic-scholar';

afterEach(() => vi.restoreAllMocks());

function mockFetch(payload: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }));
}

describe('enrichFromSemanticScholar', () => {
  it('extracts title, authors, abstract from S2 shape', async () => {
    mockFetch({
      title: 'Quantum Cats',
      abstract: 'A study about quantum cats.',
      authors: [{ name: 'Alice' }, { name: 'Bob' }],
      venue: 'Phys Today',
      year: 2023,
    });
    const r = await enrichFromSemanticScholar('10.1234/cats');
    expect(r?.title).toBe('Quantum Cats');
    expect(r?.authors).toEqual(['Alice', 'Bob']);
    expect(r?.abstract).toBe('A study about quantum cats.');
    expect(r?.journal).toBe('Phys Today');
  });

  it('falls back to TLDR when abstract is missing', async () => {
    mockFetch({
      title: 'Boxed Cats',
      tldr: { text: 'A short summary.' },
      authors: [{ name: 'C' }],
    });
    const r = await enrichFromSemanticScholar('10.1234/box');
    // S2 lib returns abstract from data.abstract only — TLDR is in
    // full_text_snippet. Verify TLDR is captured somewhere usable.
    expect(r?.abstract).toBeUndefined();
    expect(r?.full_text_snippet).toContain('A short summary.');
  });
});
