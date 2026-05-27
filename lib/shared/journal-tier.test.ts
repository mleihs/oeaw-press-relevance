import { describe, it, expect } from 'vitest';
import { journalTier } from './journal-tier';

describe('journalTier', () => {
  it('matches the Nature family by prefix', () => {
    expect(journalTier('Nature')).toBe('top');
    expect(journalTier('Nature Communications')).toBe('top');
    expect(journalTier('Nature Reviews Genetics')).toBe('top');
    expect(journalTier('Nature Methods')).toBe('top');
    expect(journalTier('Nature Machine Intelligence')).toBe('top');
    expect(journalTier('nature physics')).toBe('top'); // case-insensitive
  });

  it('matches the AAAS Science family explicitly', () => {
    expect(journalTier('Science')).toBe('top');
    expect(journalTier('Science Advances')).toBe('top');
    expect(journalTier('Science Translational Medicine')).toBe('top');
    expect(journalTier('science immunology')).toBe('top');
  });

  it('does not match journals that merely share the prefix', () => {
    // "Natural Hazards" is a legitimate Springer journal but not Nature-family
    expect(journalTier('Natural Hazards')).toBeNull();
    expect(journalTier('Naturwissenschaften')).toBeNull();
    // Common false-positive risks for the Science prefix
    expect(journalTier('Science of the Total Environment')).toBeNull();
    expect(journalTier('Science China Mathematics')).toBeNull();
    expect(journalTier('Science as Culture')).toBeNull();
  });

  it('returns null for empty / nullish input', () => {
    expect(journalTier(null)).toBeNull();
    expect(journalTier(undefined)).toBeNull();
    expect(journalTier('')).toBeNull();
    expect(journalTier('   ')).toBeNull();
  });

  it('tolerates surrounding whitespace', () => {
    expect(journalTier('  Nature  ')).toBe('top');
    expect(journalTier('\tScience Advances\n')).toBe('top');
  });
});
