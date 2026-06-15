import { describe, it, expect } from 'vitest';
import { postHaystack, matchesQuery, sortPosts, isWithinDays } from './social-filter';
import type { SocialPost } from './types';

function p(over: Partial<SocialPost>): SocialPost {
  return {
    id: 'x', channel_id: 'c', external_id: 'x', url: null, posted_at: null,
    caption: null, like_count: null, comment_count: null, media_type: null,
    image_url: null, topic: null, keywords: [], summary_de: null,
    analysis_status: 'analyzed', llm_model: null, analyzed_at: null, ...over,
  };
}

describe('postHaystack', () => {
  it('combines topic/summary/caption/keywords/handle, lowercased', () => {
    const hay = postHaystack(
      p({ topic: 'Klima', summary_de: 'Gletscher', keywords: ['CO2'], caption: 'Hallo' }),
      'Quarks.de',
    );
    expect(hay).toContain('klima');
    expect(hay).toContain('co2');
    expect(hay).toContain('quarks.de');
  });
});

describe('matchesQuery', () => {
  const hay = 'klimawandel gletscher co2 quarks.de';
  it('empty query matches everything', () => expect(matchesQuery(hay, '  ')).toBe(true));
  it('single term', () => expect(matchesQuery(hay, 'Gletscher')).toBe(true));
  it('all terms must match (AND)', () => {
    expect(matchesQuery(hay, 'klima co2')).toBe(true);
    expect(matchesQuery(hay, 'klima hexen')).toBe(false);
  });
});

describe('isWithinDays', () => {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
  it('true for recent', () => expect(isWithinDays(daysAgo(2), 7)).toBe(true));
  it('false for older', () => expect(isWithinDays(daysAgo(10), 7)).toBe(false));
  it('undated counts as recent', () => expect(isWithinDays(null, 7)).toBe(true));
});

describe('sortPosts', () => {
  const a = p({ id: 'a', posted_at: '2026-06-01T00:00:00Z', like_count: 10, comment_count: 1 });
  const b = p({ id: 'b', posted_at: '2026-06-10T00:00:00Z', like_count: 2, comment_count: 0 });

  it('recent: newest first', () => {
    expect(sortPosts([a, b], 'recent').map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('engaged: highest likes+comments first', () => {
    expect(sortPosts([a, b], 'engaged').map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('does not mutate input', () => {
    const input = [a, b];
    sortPosts(input, 'engaged');
    expect(input.map((x) => x.id)).toEqual(['a', 'b']);
  });
});
