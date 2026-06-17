import { describe, it, expect } from 'vitest';
import { enrichmentReason } from './enrichment-reason';

// Fixed "now" so the future-date branch is deterministic.
const NOW = new Date('2026-06-17T12:00:00.000Z');

describe('enrichmentReason', () => {
  it('blames the missing DOI for a failed pub with neither DOI nor type (the ~97% case)', () => {
    expect(enrichmentReason({ enrichment_status: 'failed', doi: null }, NOW)).toMatch(/keine DOI/i);
  });

  it('treats a blank-string DOI as no DOI', () => {
    expect(enrichmentReason({ enrichment_status: 'failed', doi: '   ' }, NOW)).toMatch(/keine DOI/i);
  });

  it('flags a journal article without a DOI as a back-fillable data gap', () => {
    const r = enrichmentReason(
      { enrichment_status: 'failed', doi: null, publication_type: 'Beitrag in Fachzeitschrift' },
      NOW,
    );
    expect(r).toContain('Beitrag in Fachzeitschrift');
    expect(r).toMatch(/nachgetragen/);
  });

  it('explains that chapter/newspaper-type outputs are simply not indexed', () => {
    const r = enrichmentReason(
      { enrichment_status: 'failed', doi: null, publication_type: 'Beitrag in Magazin/Zeitung' },
      NOW,
    );
    expect(r).toContain('Beitrag in Magazin/Zeitung');
    expect(r).toMatch(/nicht erfasst/);
  });

  it('embeds the DOI and reports found-but-no-abstract for a past has-DOI pub', () => {
    const r = enrichmentReason(
      { enrichment_status: 'failed', doi: '10.1515/commun-2026-0011', published_at: '2026-04-01' },
      NOW,
    );
    expect(r).toContain('10.1515/commun-2026-0011');
    expect(r).toMatch(/keine Quelle/i);
  });

  it('recognises a book / ISBN-13 DOI', () => {
    const r = enrichmentReason(
      { enrichment_status: 'failed', doi: '10.3828/9781805966791', published_at: '2026-02-28' },
      NOW,
    );
    expect(r).toMatch(/Buch/);
  });

  it('names the pre-publication window for a future-dated has-DOI pub', () => {
    const r = enrichmentReason(
      { enrichment_status: 'failed', doi: '10.1/futurepub', published_at: '2026-12-01' },
      NOW,
    );
    expect(r).toMatch(/Zukunft|Pre-Publication/);
    expect(r).toContain('Dezember 2026');
  });

  it('explains a future-dated pub without a DOI as not-yet-published', () => {
    const r = enrichmentReason(
      { enrichment_status: 'failed', doi: null, published_at: '2026-09-15' },
      NOW,
    );
    expect(r).toMatch(/Erscheint erst/);
    expect(r).toContain('September 2026');
  });

  it('capitalises a lowercase type label at the start of the sentence', () => {
    const r = enrichmentReason(
      { enrichment_status: 'failed', doi: null, publication_type: 'aufwändige Multimedia-Publikation' },
      NOW,
    );
    expect(r?.startsWith('Aufwändige Multimedia-Publikation')).toBe(true);
  });

  it('names the missing abstract for the partial case', () => {
    expect(enrichmentReason({ enrichment_status: 'partial', doi: null }, NOW)).toMatch(/Abstract/);
  });

  it('returns null when there is nothing row-specific to add', () => {
    expect(enrichmentReason({ enrichment_status: 'enriched', doi: '10.1/x' }, NOW)).toBeNull();
    expect(enrichmentReason({ enrichment_status: 'pending', doi: null }, NOW)).toBeNull();
    expect(enrichmentReason({ enrichment_status: 'analyzed', doi: null }, NOW)).toBeNull();
    expect(enrichmentReason({ enrichment_status: null, doi: null }, NOW)).toBeNull();
  });
});
