import { describe, it, expect, vi, beforeEach } from 'vitest';

// Der Enrichment-Batch selbst (externe APIs, DB) ist in batch.test.ts abgedeckt;
// hier wird nur die Runner-Orchestrierung geprüft: Skip bei 0 Kandidaten,
// Stats-Erfassung aus dem 'complete'-Frame, Feed-Kennung.

const h = vi.hoisted(() => ({
  pubs: [] as unknown[],
  completeData: { successful: 0, partial: 0, failed: 0, with_abstract: 0 } as Record<string, number>,
  runCalls: 0,
}));

vi.mock('@/lib/server/enrichment/batch', () => ({
  enrichmentPayloadToFilters: (p: unknown) => p,
  fetchPublicationsForEnrichment: async () => h.pubs,
  runEnrichmentBatch: async ({ emit }: { emit: (t: string, d: unknown) => void }) => {
    h.runCalls++;
    emit('complete', h.completeData);
  },
}));

import { runEnrichmentImport } from './run-enrichment';

beforeEach(() => {
  h.pubs = [];
  h.completeData = { successful: 0, partial: 0, failed: 0, with_abstract: 0 };
  h.runCalls = 0;
});

describe('runEnrichmentImport', () => {
  it('skips (no batch run) when nothing is pending', async () => {
    const r = await runEnrichmentImport();
    expect(r.status).toBe('skipped');
    expect(r.pubs).toBe(0);
    expect(h.runCalls).toBe(0);
  });

  it('runs enrichment and reports the complete-frame stats', async () => {
    h.pubs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    h.completeData = { successful: 2, partial: 1, failed: 0, with_abstract: 2 };

    const r = await runEnrichmentImport();
    expect(r.status).toBe('applied');
    expect(r.feed).toBe('enrichment');
    expect(r.pubs).toBe(3);
    expect(r.successful).toBe(2);
    expect(r.partial).toBe(1);
    expect(r.failed).toBe(0);
    expect(r.withAbstract).toBe(2);
    expect(h.runCalls).toBe(1);
  });
});
