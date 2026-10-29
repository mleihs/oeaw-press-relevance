import { describe, expect, it } from 'vitest';
import { clipText } from './clip-text';

describe('clipText', () => {
  it('lässt kurze Texte unverändert', () => {
    expect(clipText('kurz', 10, '…')).toBe('kurz');
  });

  it('kürzt und hängt die Auslassung an', () => {
    expect(clipText('abcdef', 3, '…')).toBe('abc…');
  });

  it('halbiert kein Emoji am Schnitt', () => {
    const out = clipText('ab😀cd', 3, '…'); // 😀 belegt die Einheiten 2 und 3
    expect(out).toBe('ab…');
    expect(() => JSON.parse(JSON.stringify({ t: out }))).not.toThrow();
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(out)).toBe(false);
  });

  it('behält ein Emoji, das ganz vor dem Schnitt liegt', () => {
    expect(clipText('ab😀cd', 4)).toBe('ab😀');
  });
});
