import { describe, it, expect } from 'vitest';
import { decodeHtmlBlock, decodeHtmlTitle, displayTitle } from './html-utils';

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

describe('decodeHtmlBlock', () => {
  it('strips Pure-style citation wrapper, maps <br/> to newline, drops inline tags', () => {
    const html =
      '<div class="rendering rendering_researchoutput rendering_researchoutput_standard rendering_contributiontojournal rendering_standard rendering_contributiontojournal_standard">' +
      '<span><strong>Name use by companion parrots.</strong></span> / Benedict, Lauryn' +
      '<span>; Groiss, Viktoria</span><span>; Hoeschele, Marisa</span> et al. <br/>' +
      'in: <span>PLoS ONE</span>, Jahrgang 21, Nr. 4, e0346830, 17.04.2026, S. e0346830.</div>';
    expect(decodeHtmlBlock(html)).toBe(
      'Name use by companion parrots. / Benedict, Lauryn; Groiss, Viktoria; Hoeschele, Marisa et al.\nin: PLoS ONE, Jahrgang 21, Nr. 4, e0346830, 17.04.2026, S. e0346830.',
    );
  });

  it('converts <sub>/<sup> to Unicode so scientific notation survives', () => {
    expect(decodeHtmlBlock('Cu<sub>54</sub>Zr<sub>46</sub> and J<sup>+</sup>')).toBe(
      'Cu₅₄Zr₄₆ and J⁺',
    );
  });

  it('decodes entities and preserves blank line between paragraphs', () => {
    expect(decodeHtmlBlock('<p>Foo &amp; bar</p><p>baz</p>')).toBe('Foo & bar\n\nbaz');
  });

  it('drops unknown inline tags but keeps their text content', () => {
    expect(decodeHtmlBlock('Plain <italic>kursiv</italic> text')).toBe('Plain kursiv text');
  });

  it('collapses runs of more than two blank lines to a single paragraph break', () => {
    expect(decodeHtmlBlock('A<br/><br/><br/><br/>B')).toBe('A\n\nB');
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
