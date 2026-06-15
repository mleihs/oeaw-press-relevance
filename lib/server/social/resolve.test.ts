import { describe, it, expect } from 'vitest';
import { resolveThemePosts } from './resolve';
import type { SocialPost, SocialTheme } from '@/lib/shared/types';

function post(id: string, topic: string, keywords: string[]): SocialPost {
  return {
    id, channel_id: 'c1', external_id: id, url: null, posted_at: null,
    caption: null, like_count: null, comment_count: null, media_type: null,
    image_url: null, topic, keywords, summary_de: null,
    analysis_status: 'analyzed', llm_model: null, analyzed_at: null,
  };
}
function theme(t: Partial<SocialTheme>): SocialTheme {
  return { theme: 'T', description: '', channels: [], post_count: 0, keywords: [], ...t };
}

describe('resolveThemePosts', () => {
  const posts = [
    post('p1', 'Klimawandel', ['co2', 'gletscher']),
    post('p2', 'Hexenverfolgung', ['hexen', 'bamberg']),
    post('p3', 'Bildschirmzeit', ['kinder', 'studien']),
  ];

  it('resolves via explicit post_ids', () => {
    const out = resolveThemePosts([theme({ post_ids: ['p2', 'p1'] })], posts);
    expect(out[0].posts.map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('drops post_ids that no longer exist', () => {
    const out = resolveThemePosts([theme({ post_ids: ['p1', 'gone'] })], posts);
    expect(out[0].posts.map((p) => p.id)).toEqual(['p1']);
  });

  it('falls back to keyword overlap when no post_ids', () => {
    const out = resolveThemePosts([theme({ keywords: ['Hexen'] })], posts);
    expect(out[0].posts.map((p) => p.id)).toEqual(['p2']);
  });

  it('returns empty when nothing matches and no ids', () => {
    const out = resolveThemePosts([theme({ keywords: ['quantencomputer'] })], posts);
    expect(out[0].posts).toEqual([]);
  });
});
