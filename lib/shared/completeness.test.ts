import { describe, it, expect } from 'vitest';
import {
  publicationCompleteness,
  bestContentLength,
  CONTENT_MIN_CHARS,
  type CompletenessInput,
} from './completeness';

// Minimal builder: only the fields the verdict reads, all empty by default.
function pub(overrides: Partial<CompletenessInput> = {}): CompletenessInput {
  return {
    analysis_status: 'pending',
    press_score: null,
    enrichment_status: 'pending',
    summary_de: null,
    summary_en: null,
    enriched_abstract: null,
    abstract: null,
    doi: null,
    ...overrides,
  };
}

const LONG = 'x'.repeat(CONTENT_MIN_CHARS); // exactly at the threshold

describe('bestContentLength', () => {
  it('prefers summary_de over the other sources', () => {
    expect(bestContentLength(pub({ summary_de: 'abc', abstract: 'abcdefgh' }))).toBe(3);
  });
  it('falls back through summary_en, enriched_abstract, abstract', () => {
    expect(bestContentLength(pub({ enriched_abstract: 'abcde' }))).toBe(5);
    expect(bestContentLength(pub({ abstract: 'ab' }))).toBe(2);
  });
  it('is 0 when nothing is present', () => {
    expect(bestContentLength(pub())).toBe(0);
  });
});

describe('publicationCompleteness', () => {
  it('analyzed pub → complete/success', () => {
    const c = publicationCompleteness(pub({ analysis_status: 'analyzed', press_score: 0.42 }));
    expect(c.analyzed).toBe(true);
    expect(c.variant).toBe('success');
  });

  it('analysis_status=failed → warning, regardless of content', () => {
    const c = publicationCompleteness(pub({ analysis_status: 'failed', summary_de: LONG }));
    expect(c.analyzed).toBe(false);
    expect(c.variant).toBe('warning');
    expect(c.headline).toMatch(/fehlgeschlagen/i);
  });

  it('has content (>= threshold) but unscored → info, mentions the length', () => {
    const c = publicationCompleteness(pub({ enrichment_status: 'enriched', summary_de: LONG }));
    expect(c.variant).toBe('info');
    expect(c.headline).toMatch(/Noch nicht bewertet/i);
    expect(c.detail).toContain(String(CONTENT_MIN_CHARS));
  });

  it('no content + failed + no DOI → warning, names the missing DOI path', () => {
    const c = publicationCompleteness(pub({ enrichment_status: 'failed' }));
    expect(c.variant).toBe('warning');
    expect(c.detail).toMatch(/ohne DOI/i);
  });

  it('no content + failed + has DOI → warning, says the DOI yielded no abstract', () => {
    const c = publicationCompleteness(pub({ enrichment_status: 'failed', doi: '10.1/x' }));
    expect(c.variant).toBe('warning');
    expect(c.detail).toMatch(/DOI ist vorhanden/i);
  });

  it('no content + partial → warning partial', () => {
    expect(publicationCompleteness(pub({ enrichment_status: 'partial' })).headline).toMatch(/teilweise/i);
  });

  it('no content + pending → neutral pending', () => {
    const c = publicationCompleteness(pub({ enrichment_status: 'pending' }));
    expect(c.variant).toBe('neutral');
    expect(c.headline).toMatch(/ausstehend/i);
  });

  it('no content + enriched (short) → neutral, cites the length threshold', () => {
    const c = publicationCompleteness(pub({ enrichment_status: 'enriched', abstract: 'too short' }));
    expect(c.variant).toBe('neutral');
    expect(c.detail).toContain(String(CONTENT_MIN_CHARS));
  });

  it('never emits an em-dash (U+2014) in any branch — lib/shared lint gate', () => {
    const states: CompletenessInput[] = [
      pub({ analysis_status: 'analyzed', press_score: 0.5 }),
      pub({ analysis_status: 'failed' }),
      pub({ enrichment_status: 'enriched', summary_de: LONG }),
      pub({ enrichment_status: 'failed' }),
      pub({ enrichment_status: 'failed', doi: '10.1/x' }),
      pub({ enrichment_status: 'partial' }),
      pub({ enrichment_status: 'pending' }),
      pub({ enrichment_status: 'enriched', abstract: 'x' }),
    ];
    for (const s of states) {
      const c = publicationCompleteness(s);
      expect(c.headline + c.detail).not.toContain('—');
    }
  });
});
