import { describe, it, expect } from 'vitest';
import { decodeHtmlTitle, displayTitle } from './html-utils';

describe('decodeHtmlTitle', () => {
  it('converts <SUP> and <SUB> markup (HTML-entity-encoded) to Unicode super/subscript', () => {
    expect(decodeHtmlTitle('e&lt;SUP&gt;+&lt;/SUP&gt;e&lt;SUP&gt;-&lt;/SUP&gt;')).toBe('e⁺e⁻');
    expect(decodeHtmlTitle('H&lt;SUB&gt;2&lt;/SUB&gt;O')).toBe('H₂O');
  });

  it('decodes HTML entities, strips remaining tags, and collapses whitespace', () => {
    expect(decodeHtmlTitle('Foo &amp; bar &lt;b&gt;baz&lt;/b&gt;   qux')).toBe('Foo & bar baz qux');
    expect(decodeHtmlTitle('  spaces   collapsed  ')).toBe('spaces collapsed');
  });
});

describe('displayTitle', () => {
  it('returns the decoded primary title when citation is null or undefined', () => {
    expect(displayTitle('Hello &amp; World', null)).toBe('Hello & World');
    expect(displayTitle('Plain title', undefined)).toBe('Plain title');
  });

  it('extends the primary via citation when the citation title-segment starts with "<primary>:"', () => {
    const primary = 'Wissenschaftliche Zusammenfassung';
    const citation = 'Wissenschaftliche Zusammenfassung: AAR2 Klimabericht. / Kromp-Kolb, H';
    expect(displayTitle(primary, citation)).toBe('Wissenschaftliche Zusammenfassung: AAR2 Klimabericht');
  });

  it('returns the primary unchanged when the citation prefix does NOT match the title', () => {
    const primary = 'Some title';
    const citation = 'Other unrelated text / Author X';
    expect(displayTitle(primary, citation)).toBe('Some title');
  });
});
