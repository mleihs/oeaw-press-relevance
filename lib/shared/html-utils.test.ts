import { describe, it, expect } from 'vitest';
import { decodeHtmlBlock, decodeHtmlInline } from './html-utils';

describe('decodeHtmlInline', () => {
  it('returns empty string for null / undefined / empty', () => {
    expect(decodeHtmlInline(null)).toBe('');
    expect(decodeHtmlInline(undefined)).toBe('');
    expect(decodeHtmlInline('')).toBe('');
  });

  it('converts <SUP> and <SUB> markup (HTML-entity-encoded) to Unicode super/subscript', () => {
    expect(decodeHtmlInline('e&lt;SUP&gt;+&lt;/SUP&gt;e&lt;SUP&gt;-&lt;/SUP&gt;')).toBe('e⁺e⁻');
    expect(decodeHtmlInline('H&lt;SUB&gt;2&lt;/SUB&gt;O')).toBe('H₂O');
  });

  it('decodes HTML entities, strips remaining tags, and collapses whitespace', () => {
    expect(decodeHtmlInline('Foo &amp; bar &lt;b&gt;baz&lt;/b&gt;   qux')).toBe('Foo & bar baz qux');
    expect(decodeHtmlInline('  spaces   collapsed  ')).toBe('spaces collapsed');
  });

  it('decodes decimal and hex numeric entities (Pure HTML uses these)', () => {
    // &#160; = non-breaking space (U+00A0); collapse turns it into a single space
    expect(decodeHtmlInline('Saal&#160;A')).toBe('Saal A');
    // &#x27; = apostrophe
    expect(decodeHtmlInline('it&#x27;s here')).toBe("it's here");
  });

  it('decodes common typographic named entities', () => {
    expect(decodeHtmlInline('en&ndash;dash and em&mdash;dash &hellip;')).toBe('en–dash and em—dash …');
    expect(decodeHtmlInline('&laquo;quote&raquo;')).toBe('«quote»');
  });
});

describe('decodeHtmlBlock', () => {
  it('returns empty string for null / undefined', () => {
    expect(decodeHtmlBlock(null)).toBe('');
    expect(decodeHtmlBlock(undefined)).toBe('');
  });

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

  it('drops unknown inline tags but keeps their text content (italic / em / cite)', () => {
    expect(decodeHtmlBlock('Plain <italic>kursiv</italic> and <em>emph</em> and <cite>ref</cite>')).toBe(
      'Plain kursiv and emph and ref',
    );
  });

  it('collapses runs of more than two blank lines to a single paragraph break', () => {
    expect(decodeHtmlBlock('A<br/><br/><br/><br/>B')).toBe('A\n\nB');
  });

  it('treats <br />, <br/>, <br>, <BR>, <Br/> identically', () => {
    expect(decodeHtmlBlock('A<br />B<br/>C<br>D<BR>E<Br/>F')).toBe('A\nB\nC\nD\nE\nF');
  });

  it('decodes numeric entities mid-text without breaking line structure', () => {
    expect(decodeHtmlBlock('Saal A<br/>1010&#160;Wien')).toBe('Saal A\n1010 Wien');
  });

  it('does not blow up on malformed / partial HTML', () => {
    expect(decodeHtmlBlock('Plain text with <unclosed and >dangling')).not.toThrow;
    // Just check it returns a string — robustness over correctness for bad input.
    expect(typeof decodeHtmlBlock('Plain text with <unclosed and >dangling')).toBe('string');
  });
});
