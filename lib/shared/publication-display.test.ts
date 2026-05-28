import { describe, it, expect } from 'vitest';
import { displayAuthor, displayInstitute, displayTitle } from './publication-display';

describe('displayAuthor', () => {
  it('returns the trimmed lead_author', () => {
    expect(displayAuthor({ lead_author: '  Wilken, Dennis  ' })).toBe('Wilken, Dennis');
  });

  it('falls back to "Unbekannt" for null / empty', () => {
    expect(displayAuthor({ lead_author: null })).toBe('Unbekannt');
    expect(displayAuthor({ lead_author: '   ' })).toBe('Unbekannt');
  });
});

describe('displayInstitute', () => {
  it('returns the first orgunit acronym, falling back to the name', () => {
    expect(
      displayInstitute({ orgunits: [{ akronym_de: 'ÖAI', name_de: 'Österreichisches Archäologisches Institut' }] }),
    ).toBe('ÖAI');
    expect(
      displayInstitute({ orgunits: [{ akronym_de: null, name_de: 'Institute X' }] }),
    ).toBe('Institute X');
  });

  it('returns null when no orgunits are attached', () => {
    expect(displayInstitute({})).toBe(null);
    expect(displayInstitute({ orgunits: [] })).toBe(null);
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

  it('handles Pure renderingHtml citation wrapper transparently', () => {
    const primary = 'Wissenschaftliche Zusammenfassung';
    const citation =
      '<div class="rendering rendering_researchoutput rendering_researchoutput_standard">' +
      '<span><strong>Wissenschaftliche Zusammenfassung: AAR2 Klimabericht.</strong></span> / Kromp-Kolb, H' +
      '</div>';
    expect(displayTitle(primary, citation)).toBe('Wissenschaftliche Zusammenfassung: AAR2 Klimabericht');
  });
});
