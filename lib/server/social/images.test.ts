import { describe, expect, it } from 'vitest';
import { imageKeyForPost, isAllowedImageUrl, selectOrphanKeys } from './images';

describe('imageKeyForPost', () => {
  it('maps a post id to a deterministic posts/<id>.jpg key', () => {
    expect(imageKeyForPost('8e494a3a-1111-2222-3333-444455556666')).toBe(
      'posts/8e494a3a-1111-2222-3333-444455556666.jpg',
    );
  });
});

describe('isAllowedImageUrl', () => {
  it('accepts the IG CDN hosts (incl. fna + scontent subdomains)', () => {
    expect(isAllowedImageUrl('https://scontent-phl2-1.cdninstagram.com/v/x.jpg')).toBe(true);
    expect(isAllowedImageUrl('https://instagram.fosu2-1.fna.fbcdn.net/v/x.jpg')).toBe(true);
  });

  it('rejects non-https, foreign hosts, and look-alike suffixes', () => {
    expect(isAllowedImageUrl('http://scontent.cdninstagram.com/x.jpg')).toBe(false); // not https
    expect(isAllowedImageUrl('https://evil.com/x.jpg')).toBe(false);
    expect(isAllowedImageUrl('https://cdninstagram.com.evil.com/x.jpg')).toBe(false); // suffix spoof
    expect(isAllowedImageUrl('not a url')).toBe(false);
  });
});

describe('selectOrphanKeys', () => {
  it('returns stored keys no live row references', () => {
    const listed = ['posts/a.jpg', 'posts/b.jpg', 'posts/c.jpg'];
    const valid = new Set(['posts/a.jpg', 'posts/c.jpg']);
    expect(selectOrphanKeys(listed, valid)).toEqual(['posts/b.jpg']);
  });

  it('is empty when storage matches DB truth', () => {
    const keys = ['posts/a.jpg', 'posts/b.jpg'];
    expect(selectOrphanKeys(keys, new Set(keys))).toEqual([]);
  });
});
