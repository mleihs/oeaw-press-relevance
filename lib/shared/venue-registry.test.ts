import { describe, it, expect } from 'vitest';
import {
  canonicalName,
  lookupVenue,
  venueDisplayLabel,
  venueGroupSpellings,
} from './venue-registry';

describe('lookupVenue', () => {
  it('finds a venue by exact canonical name', () => {
    const meta = lookupVenue('Die Presse');
    expect(meta).toMatchObject({
      canonicalName: 'Die Presse',
      kind: 'newspaper',
      domain: 'diepresse.com',
      country: 'AT',
    });
  });

  it('collapses corpus variants of Der Standard via aliases', () => {
    expect(lookupVenue('DerStandard.at')?.canonicalName).toBe('Der Standard');
    expect(lookupVenue('Der Standard [Blog]')?.canonicalName).toBe('Der Standard');
  });

  it('resolves an aliased acronym (FAZ → Frankfurter Allgemeine)', () => {
    expect(lookupVenue('FAZ')?.canonicalName).toBe('Frankfurter Allgemeine Zeitung');
  });

  it('matches case-insensitively', () => {
    expect(lookupVenue('die presse')?.canonicalName).toBe('Die Presse');
    expect(lookupVenue('DIE PRESSE')?.canonicalName).toBe('Die Presse');
  });

  it('collapses internal whitespace runs', () => {
    expect(lookupVenue('Tiroler  Tageszeitung')?.canonicalName).toBe('Tiroler Tageszeitung');
  });

  it('returns null for unknown venues', () => {
    expect(lookupVenue('Some Conference Proceedings 2024')).toBeNull();
  });

  it('returns null for null / undefined / empty / whitespace-only', () => {
    expect(lookupVenue(null)).toBeNull();
    expect(lookupVenue(undefined)).toBeNull();
    expect(lookupVenue('')).toBeNull();
    expect(lookupVenue('   ')).toBeNull();
  });
});

describe('venueDisplayLabel', () => {
  it('returns "Tageszeitung" for a known newspaper', () => {
    expect(venueDisplayLabel('Die Presse')).toBe('Tageszeitung');
  });

  it('returns "Magazin" for a known magazine', () => {
    expect(venueDisplayLabel('profil')).toBe('Magazin');
  });

  it('returns "Erschienen in" for unknown venues (no false "Journal")', () => {
    expect(venueDisplayLabel('Some Conference Proceedings Volume')).toBe('Erschienen in');
  });

  it('returns "Erschienen in" for empty input', () => {
    expect(venueDisplayLabel(null)).toBe('Erschienen in');
    expect(venueDisplayLabel('')).toBe('Erschienen in');
  });
});

describe('canonicalName', () => {
  it('returns the canonical name when given the canonical name itself', () => {
    expect(canonicalName('Die Presse')).toBe('Die Presse');
  });

  it('resolves an alias to the canonical name', () => {
    expect(canonicalName('DerStandard.at')).toBe('Der Standard');
    expect(canonicalName('FAZ')).toBe('Frankfurter Allgemeine Zeitung');
  });

  it('returns the raw input verbatim for unknown venues', () => {
    expect(canonicalName('Some Unknown Conference Proceedings')).toBe(
      'Some Unknown Conference Proceedings',
    );
  });

  it('is case-insensitive on the input', () => {
    expect(canonicalName('die presse')).toBe('Die Presse');
  });
});

describe('venueGroupSpellings', () => {
  it('returns canonical + aliases for a known multi-spelling outlet', () => {
    const spellings = venueGroupSpellings('Der Standard');
    expect(spellings).toContain('Der Standard');
    expect(spellings).toContain('DerStandard.at');
    expect(spellings).toContain('Der Standard [Blog]');
  });

  it('returns the same group when input is an alias', () => {
    expect(venueGroupSpellings('DerStandard.at')).toEqual(
      venueGroupSpellings('Der Standard'),
    );
  });

  it('returns just the canonical name when outlet has no aliases', () => {
    expect(venueGroupSpellings('Die Presse')).toEqual(['Die Presse']);
  });

  it('returns null for unknown venues so caller can fall back to exact match', () => {
    expect(venueGroupSpellings('Some Unknown Venue')).toBeNull();
  });
});
