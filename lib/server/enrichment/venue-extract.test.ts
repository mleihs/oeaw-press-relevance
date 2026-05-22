import { describe, it, expect } from 'vitest';
import { extractVenue, cleanVenue } from './venue-extract';

// Fixtures are trimmed but format-faithful samples of real HeboWebDB exports.

describe('extractVenue — BibTeX', () => {
  it('reads journal from an @article (quoted value with colon + commas)', () => {
    const bibtex = `@article{522e5cd8,    title = "Understanding structural evolution",    author = "O Renk and M Kapp",    year = "2019",    journal  = "IOP Conference Series: Materials Science and Engineering",    issn = "1757-8981",
}`;
    expect(extractVenue({ bibtex })).toEqual({
      venue: 'IOP Conference Series: Materials Science and Engineering',
      source: 'bibtex',
    });
  });

  it('reads booktitle from @inproceedings, ignoring the noisy series', () => {
    const bibtex = `@inproceedings{b81aa06b,    title = "The track finding algorithm",    series = "150, 0007 (2017)",    booktitle = "Connecting The Dots/Intelligent Trackers 2017",    note = "x",
}`;
    expect(extractVenue({ bibtex })?.venue)
      .toBe('Connecting The Dots/Intelligent Trackers 2017');
  });

  it('decodes LaTeX umlauts and survives a quote inside a brace group', () => {
    const bibtex = `@inproceedings{x, booktitle = "Musiktheater in Wien um 1900. Tagung Wien, 24. bis 26. M{"a}rz 2011", note = "y",
}`;
    expect(extractVenue({ bibtex })?.venue)
      .toBe('Musiktheater in Wien um 1900. Tagung Wien, 24. bis 26. März 2011');
  });

  it('handles brace-delimited values', () => {
    const bibtex = `@article{x, journal = {Nature Communications}, year = {2024}}`;
    expect(extractVenue({ bibtex })?.venue).toBe('Nature Communications');
  });

  it('returns null for an @book with no journal/booktitle', () => {
    const bibtex = `@book{x, title = "Some Monograph", publisher = "Hans Schneider", year = "2014"}`;
    expect(extractVenue({ bibtex })).toBeNull();
  });
});

describe('extractVenue — RIS', () => {
  it('reads JO (journal name)', () => {
    const ris = `TY  - JOUR\nAB  - Some abstract text.\nJO  - Journal of the International Association of Buddhist Studies\nER  - `;
    expect(extractVenue({ ris })).toEqual({
      venue: 'Journal of the International Association of Buddhist Studies',
      source: 'ris',
    });
  });

  it('reads T2 (book / proceedings venue)', () => {
    const ris = `TY  - CHAP\nT2  - Ludwig Anzengrubers Theaterpoetik des Ruralen\nER  - `;
    expect(extractVenue({ ris })?.venue)
      .toBe('Ludwig Anzengrubers Theaterpoetik des Ruralen');
  });
});

describe('extractVenue — EndNote', () => {
  it('reads %J (journal)', () => {
    const endnote = `%0 Journal Article\n%T The preparation of nanofluids\n%J Advanced Powder Technology\n%@ 0921-8831`;
    expect(extractVenue({ endnote })).toEqual({
      venue: 'Advanced Powder Technology',
      source: 'endnote',
    });
  });

  it('reads %B (book section) and decodes &amp;', () => {
    const endnote = `%0 Book Section\n%T Assessment\n%B The 4th Conference on Advanced Technologies &amp; Treatments in Diabetes`;
    expect(extractVenue({ endnote })?.venue)
      .toBe('The 4th Conference on Advanced Technologies & Treatments in Diabetes');
  });
});

describe('extractVenue — precedence & edge cases', () => {
  it('prefers BibTeX over RIS', () => {
    expect(extractVenue({
      bibtex: `@article{x, journal = "From BibTeX"}`,
      ris: `TY  - JOUR\nJO  - From RIS\nER  - `,
    })).toEqual({ venue: 'From BibTeX', source: 'bibtex' });
  });

  it('returns null on empty / missing input', () => {
    expect(extractVenue({})).toBeNull();
    expect(extractVenue({ bibtex: null, ris: '', endnote: undefined })).toBeNull();
  });

  it('rejects number / code junk', () => {
    expect(extractVenue({ ris: `TY  - JOUR\nT2  - 150, 0007 (2017)\nER  - ` })).toBeNull();
  });
});

describe('cleanVenue', () => {
  it('decodes umlauts + entities and collapses whitespace', () => {
    expect(cleanVenue('  {\\"O}sterreichische   Zeitschrift  '))
      .toBe('Österreichische Zeitschrift');
    expect(cleanVenue('Astronomy \\& Astrophysics')).toBe('Astronomy & Astrophysics');
  });
});
