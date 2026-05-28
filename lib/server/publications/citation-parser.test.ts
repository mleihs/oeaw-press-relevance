import { describe, it, expect } from 'vitest';
import { parseCitation } from './citation-parser';

describe('parseCitation', () => {
  it('returns null for null / undefined / empty / non-Pure input', () => {
    expect(parseCitation(null)).toBeNull();
    expect(parseCitation(undefined)).toBeNull();
    expect(parseCitation('')).toBeNull();
    expect(parseCitation('Plain citation. / Author X / Journal Y, 2026.')).toBeNull();
  });

  it('parses a contributiontojournal_standard wrapper from the prod corpus', () => {
    const html =
      '<div class="rendering rendering_researchoutput rendering_researchoutput_standard rendering_contributiontojournal rendering_standard rendering_contributiontojournal_standard">' +
      '<span><strong>Name use by companion parrots.</strong></span> / Benedict, Lauryn' +
      '<span>; Groiss, Viktoria</span><span>; Hoeschele, Marisa</span> et al. <br/>' +
      'in: <span>PLoS ONE</span>, Jahrgang 21, Nr. 4, e0346830, 17.04.2026, S. e0346830.</div>';
    expect(parseCitation(html)).toEqual({
      type: 'researchoutput',
      subtype: 'contributiontojournal',
      title: 'Name use by companion parrots',
      authors: [
        { name: 'Benedict, Lauryn', role: null },
        { name: 'Groiss, Viktoria', role: null },
        { name: 'Hoeschele, Marisa', role: null },
      ],
      et_al: true,
      venue: 'PLoS ONE',
      venue_kind: 'journal',
      trailer: 'Jahrgang 21, Nr. 4, e0346830, 17.04.2026, S. e0346830.',
    });
  });

  it('parses a contributiontobookanthology with editor roles in parens', () => {
    const html =
      '<div class="rendering rendering_researchoutput rendering_researchoutput_standard rendering_contributiontobookanthology rendering_standard rendering_contributiontobookanthology_standard">' +
      '<span><strong>Religion – Loyalität – Ehre.</strong></span> / <span>Strohmeyer, Arno</span>; Keller, Katrin (Herausgeber:in); a, Petr (Herausgeber:in) et al. <br/>' +
      'Adaptive Reuse: Aspects of Creativity. ed. by X. Place: Publisher, 2024. S. 1-20.</div>';
    const parsed = parseCitation(html);
    expect(parsed?.subtype).toBe('contributiontobookanthology');
    expect(parsed?.title).toBe('Religion – Loyalität – Ehre');
    expect(parsed?.authors).toEqual([
      { name: 'Strohmeyer, Arno', role: null },
      { name: 'Keller, Katrin', role: 'Herausgeber:in' },
      { name: 'a, Petr', role: 'Herausgeber:in' },
    ]);
    expect(parsed?.et_al).toBe(true);
    expect(parsed?.venue).toBe('Adaptive Reuse: Aspects of Creativity');
    expect(parsed?.venue_kind).toBe('book-host');
  });

  it('parses a bookanthology_standard with no <br> tail', () => {
    const html =
      '<div class="rendering rendering_researchoutput rendering_researchoutput_standard rendering_bookanthology rendering_standard rendering_bookanthology_standard">' +
      '<span><strong>Nanotrust II, ENDBERICHT.</strong></span> / <span>Nentwich, Michael</span><span>; Gazsó, André</span><span>; Simko, Myrtill</span></div>';
    const parsed = parseCitation(html);
    expect(parsed?.subtype).toBe('bookanthology');
    expect(parsed?.title).toBe('Nanotrust II, ENDBERICHT');
    expect(parsed?.authors).toEqual([
      { name: 'Nentwich, Michael', role: null },
      { name: 'Gazsó, André', role: null },
      { name: 'Simko, Myrtill', role: null },
    ]);
    expect(parsed?.et_al).toBe(false);
    expect(parsed?.venue).toBeNull();
    expect(parsed?.venue_kind).toBeNull();
  });

  it('preserves titles containing " / " by anchoring on <strong>, not the slash', () => {
    const html =
      '<div class="rendering rendering_researchoutput rendering_researchoutput_standard rendering_contributiontojournal rendering_standard rendering_contributiontojournal_standard">' +
      '<span><strong>Topic A / Topic B in Material X.</strong></span> / Author A<span>; Author B</span> <br/>' +
      'in: <span>Some Journal</span>, 2026.</div>';
    const parsed = parseCitation(html);
    expect(parsed?.title).toBe('Topic A / Topic B in Material X');
    expect(parsed?.authors.length).toBe(2);
  });

  it('decodes Unicode super/subscript inside the title', () => {
    const html =
      '<div class="rendering rendering_researchoutput rendering_researchoutput_standard rendering_contributiontojournal">' +
      '<span><strong>Cu<sub>54</sub>Zr<sub>46</sub> nanolaminates.</strong></span> / Author A <br/>' +
      'in: <span>J Mat Sci</span>, 2026.</div>';
    expect(parseCitation(html)?.title).toBe('Cu₅₄Zr₄₆ nanolaminates');
  });

  it('handles dataset_short content type', () => {
    const html =
      '<div class="rendering rendering_dataset rendering_short rendering_dataset_short">' +
      '<span><strong>Cosmic Ray Dataset 2025.</strong></span> / Researcher X<span>; Researcher Y</span></div>';
    const parsed = parseCitation(html);
    expect(parsed?.type).toBe('dataset');
    expect(parsed?.title).toBe('Cosmic Ray Dataset 2025');
  });

  it('returns null on malformed / partial Pure HTML (no <strong>)', () => {
    const html = '<div class="rendering rendering_researchoutput">no title here</div>';
    expect(parseCitation(html)).toBeNull();
  });
});
