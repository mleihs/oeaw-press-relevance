import { describe, it, expect } from 'vitest';
import { parseInstagramHandle, instagramUrl, normalizeApifyPost } from './apify';

describe('parseInstagramHandle', () => {
  it('accepts a bare handle', () => {
    expect(parseInstagramHandle('quarks.de')).toBe('quarks.de');
  });
  it('strips a leading @', () => {
    expect(parseInstagramHandle('@vista.science')).toBe('vista.science');
  });
  it('extracts the handle from a full profile URL', () => {
    expect(parseInstagramHandle('https://www.instagram.com/quarks.de/')).toBe('quarks.de');
  });
  it('lowercases', () => {
    expect(parseInstagramHandle('Quarks.DE')).toBe('quarks.de');
  });
  it('rejects reserved path segments', () => {
    expect(() => parseInstagramHandle('https://www.instagram.com/p/abc123/')).toThrow();
  });
  it('rejects invalid characters', () => {
    expect(() => parseInstagramHandle('not a handle!')).toThrow();
  });
});

describe('instagramUrl', () => {
  it('builds the canonical profile URL', () => {
    expect(instagramUrl('quarks.de')).toBe('https://www.instagram.com/quarks.de/');
  });
});

describe('normalizeApifyPost', () => {
  const raw = {
    id: '123',
    shortCode: 'DZkcs4kCNIt',
    type: 'Sidecar',
    caption: 'Hallo Welt',
    url: 'https://www.instagram.com/p/DZkcs4kCNIt/',
    likesCount: 11686,
    commentsCount: 69,
    timestamp: '2026-06-14T14:23:05.000Z',
    displayUrl: 'https://cdn/img.jpg',
    ownerUsername: 'Quarks.de',
    latestComments: [{ a: 1 }],
    childPosts: [{ b: 2 }],
    images: ['x', 'y'],
  };

  it('maps the core fields and lowercases ownerUsername', () => {
    const p = normalizeApifyPost(raw)!;
    expect(p.externalId).toBe('DZkcs4kCNIt');
    expect(p.likeCount).toBe(11686);
    expect(p.commentCount).toBe(69);
    expect(p.mediaType).toBe('Sidecar');
    expect(p.imageUrl).toBe('https://cdn/img.jpg');
    expect(p.ownerUsername).toBe('quarks.de');
    expect(p.postedAt).toBe('2026-06-14T14:23:05.000Z');
  });

  it('coerces string counts to numbers', () => {
    const p = normalizeApifyPost({ ...raw, likesCount: '11686', commentsCount: '69' })!;
    expect(p.likeCount).toBe(11686);
    expect(p.commentCount).toBe(69);
  });

  it('drops bulky nested arrays from raw', () => {
    const p = normalizeApifyPost(raw)!;
    expect(p.raw).not.toHaveProperty('latestComments');
    expect(p.raw).not.toHaveProperty('childPosts');
    expect(p.raw).not.toHaveProperty('images');
    expect(p.raw).toHaveProperty('shortCode');
  });

  it('returns null when there is no stable id', () => {
    expect(normalizeApifyPost({ caption: 'x' })).toBeNull();
  });
});
