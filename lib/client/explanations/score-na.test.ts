import { describe, it, expect } from 'vitest';
import { resolveScoreNa } from './score-na';

describe('resolveScoreNa', () => {
  it('shows the ITA entry and drops any reason for an ITA row', () => {
    expect(
      resolveScoreNa({
        isIta: true,
        analysisStatus: 'pending',
        enrichmentStatus: 'failed',
        naReason: 'Die DOI ist hinterlegt, aber keine Quelle lieferte einen Abstract.',
      }),
    ).toEqual({ explId: 'score_na_ita', reason: null });
  });

  it('maps a non-ITA row by status and passes its reason through', () => {
    expect(
      resolveScoreNa({ enrichmentStatus: 'failed', naReason: 'Keine DOI hinterlegt.' }),
    ).toEqual({ explId: 'score_na_pending_failed', reason: 'Keine DOI hinterlegt.' });
  });

  it('lets a failed analysis win over the enrichment status', () => {
    expect(
      resolveScoreNa({ analysisStatus: 'failed', enrichmentStatus: 'enriched' }).explId,
    ).toBe('score_na_analysis_failed');
  });

  it('falls back to the generic entry without status or reason', () => {
    expect(resolveScoreNa({})).toEqual({ explId: 'score_na', reason: null });
  });
});
