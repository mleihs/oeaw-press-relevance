// Decides what an N/A score bubble explains: which score_na_* entry it shows
// and whether a per-row reason leads it. Kept as one pure function, free of
// React and runtime imports, so the rule lives in exactly one place and is
// testable on its own (score-na.test.ts).

import type { EXPL } from './index';

export interface ScoreNaInput {
  analysisStatus?: string | null;
  enrichmentStatus?: string | null;
  /** Per-row reason derived by the caller (lib/shared/enrichment-reason.ts). */
  naReason?: string | null;
  /** Row lies in the ITA subtree, which is excluded from scoring. */
  isIta?: boolean;
}

export interface ScoreNa {
  explId: keyof typeof EXPL;
  reason: string | null;
}

export function resolveScoreNa({
  analysisStatus,
  enrichmentStatus,
  naReason,
  isIta,
}: ScoreNaInput): ScoreNa {
  // ITA wins over every status: such a row is never scored, so neither the
  // status copy ("bewertbar, Scoring fehlt" and friends) nor an enrichment
  // reason would tell the truth.
  if (isIta) return { explId: 'score_na_ita', reason: null };
  return { explId: byStatus(analysisStatus, enrichmentStatus), reason: naReason ?? null };
}

function byStatus(
  analysisStatus?: string | null,
  enrichmentStatus?: string | null,
): keyof typeof EXPL {
  if (analysisStatus === 'failed') return 'score_na_analysis_failed';
  if (enrichmentStatus === 'failed') return 'score_na_pending_failed';
  if (enrichmentStatus === 'partial') return 'score_na_pending_partial';
  if (enrichmentStatus === 'pending') return 'score_na_pending_pending';
  if (enrichmentStatus === 'enriched') return 'score_na_pending_enriched';
  return 'score_na';
}
