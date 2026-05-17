import { describe, it, expect } from 'vitest';
import { scoreCommand } from './score';

describe('scoreCommand', () => {
  it('an empty query keeps every command (positive score)', () => {
    expect(scoreCommand('', 'Dashboard')).toBeGreaterThan(0);
  });

  it('ranks prefix > word-boundary > inner-substring > subsequence', () => {
    const prefix = scoreCommand('das', 'Dashboard'); // index 0
    const inner = scoreCommand('board', 'Dashboard'); // mid-word
    const sub = scoreCommand('dhb', 'Dashboard'); // subsequence only
    expect(prefix).toBeGreaterThan(inner);
    expect(inner).toBeGreaterThan(sub);
    expect(sub).toBeGreaterThan(0);
  });

  it('scores a match after a space (word boundary) above one inside a word', () => {
    const boundary = scoreCommand('sit', 'Triage Sitzung');
    const insideWord = scoreCommand('ria', 'Triage Sitzung');
    expect(boundary).toBeGreaterThan(insideWord);
  });

  it('returns 0 when the query is not even a subsequence', () => {
    expect(scoreCommand('xyz', 'Dashboard')).toBe(0);
  });

  it('matches via keywords, not just the label', () => {
    expect(scoreCommand('papers', 'Publikationen', ['papers', 'pubs'])).toBeGreaterThan(0);
  });
});
