import { and, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import { publications, descNullsLast } from '@/lib/server/db';
import {
  publicationsRepo,
  type PublicationQueueRow,
} from '@/lib/server/repos/publications';
import { getLatestSessionTimestamp } from '@/lib/server/sessions/lifecycle';
import {
  DECISIONS,
  isDecision,
  type Decision,
  type Publication,
} from '@/lib/shared/types';
import { publicationToApi } from '../publications/to-api';

const FRESH_SCORE_THRESHOLD = 0.7;

// Same mini relation projections as publications/list.ts (chip-sized
// payloads). Co-located here because the queue carries no press_release —
// reusing PublicationListItem would force `press_release: null` into the
// wire shape, which is a needless added field.
export type ReviewQueueItem = Publication & {
  publication_type_lookup: { name_de: string; name_en: string } | null;
  orgunits: Array<{ id: string; akronym_de: string | null; name_de: string }>;
};

export interface ReviewQueueResult {
  publications: ReviewQueueItem[];
  since_ts: string | null;
  sort: 'press_score' | 'combined' | 'decided_at';
  counts: { total: number; flagged: number; mahl: number; fresh: number };
  decision_counts: Record<Decision, number>;
}

async function fetchDecisionCounts(): Promise<Record<Decision, number>> {
  const rows = await publicationsRepo.countByDecision();
  const result = Object.fromEntries(DECISIONS.map((d) => [d, 0])) as Record<
    Decision,
    number
  >;
  for (const r of rows) {
    if (isDecision(r.decision ?? '')) {
      result[r.decision as Decision] = r.c;
    }
  }
  return result;
}

/**
 * Combined ranking that fuses press_score and press_similarity by
 * rank-average. Robust to scale differences (press_score in 0..1,
 * press_similarity is cosine around 0..1 but with much narrower spread).
 * Pubs without similarity fall back to press_score rank only.
 */
function combineRanks<
  T extends { press_score: number | null; press_similarity: number | null },
>(rows: T[]): T[] {
  const n = rows.length;
  if (n === 0) return rows;
  const idx = rows.map((_, i) => i);

  const rankBy = (
    field: 'press_score' | 'press_similarity',
  ): Map<number, number> => {
    const sortable = idx.map((i) => ({ i, v: rows[i][field] }));
    sortable.sort((a, b) => {
      const av = a.v ?? -Infinity;
      const bv = b.v ?? -Infinity;
      return bv - av;
    });
    const ranks = new Map<number, number>();
    sortable.forEach((s, r) => {
      // 1-based rank, NaN/null pubs get rank=n+1 (lowest).
      ranks.set(s.i, s.v == null ? n + 1 : r + 1);
    });
    return ranks;
  };

  const rPS = rankBy('press_score');
  const rSIM = rankBy('press_similarity');

  return [...rows]
    .map((r, i) => {
      const psR = rPS.get(i)!;
      const simR = rSIM.get(i)!;
      const fused = r.press_similarity == null ? psR : (psR + simR) / 2;
      return { row: r, fused };
    })
    .sort((a, b) => a.fused - b.fused)
    .map((x) => x.row);
}

// Drizzle relational findMany row → wire-shape ReviewQueueItem.
function flattenRow(row: PublicationQueueRow): ReviewQueueItem {
  const orgunits = (row.orgunitPublications ?? [])
    .map((op) => op.orgunit)
    .filter((o): o is NonNullable<typeof o> => o !== null)
    .map((o) => ({
      id: o.id,
      akronym_de: o.akronymDe,
      name_de: o.nameDe,
    }));
  return {
    ...publicationToApi(row),
    publication_type_lookup: row.publicationTypeRef
      ? {
          name_de: row.publicationTypeRef.nameDe,
          name_en: row.publicationTypeRef.nameEn,
        }
      : null,
    orgunits,
  };
}

/**
 * Sitzungs-Queue. For the undecided bucket: returns the union of
 *   - publications with at least one flag note (pub_ids_with_flags)
 *   - publications with mahighlight=true on any author (pub_ids_by_highlight)
 *   - publications analyzed since the last review session (or last 7 days as
 *     fallback) with press_score >= 0.7
 * filtered by archived=false, decision='undecided', snooze_until IS NULL or
 * <= today. `combined` sort fuses press_score and press_similarity by rank.
 *
 * For decided buckets: short path with just decided_at ordering — no
 * since_ts / flagged / mahl / fresh logic.
 *
 * Uses updated_at as a proxy for analyzed_at (no dedicated column yet); good
 * enough because the analysis run touches updated_at via press_score writes.
 */
export async function buildReviewQueue(
  searchParams: URLSearchParams,
): Promise<ReviewQueueResult> {
  const useCombined = searchParams.get('sort') === 'combined';
  const rawDecision = searchParams.get('decision') ?? 'undecided';
  const decisionParam: Decision = isDecision(rawDecision)
    ? rawDecision
    : 'undecided';

  const decisionCountsP = fetchDecisionCounts();

  if (decisionParam !== 'undecided') {
    const rows = await publicationsRepo.findManyForQueue({
      where: and(
        eq(publications.archived, false),
        eq(publications.decision, decisionParam),
      ),
      orderBy: descNullsLast(publications.decidedAt),
    });
    const flattened = rows.map(flattenRow);
    const decision_counts = await decisionCountsP;
    return {
      publications: flattened,
      since_ts: null,
      sort: 'decided_at',
      counts: { total: flattened.length, flagged: 0, mahl: 0, fresh: 0 },
      decision_counts,
    };
  }

  const sinceTs = await getLatestSessionTimestamp();
  const [flaggedIds, mahlIds, freshIds] = await Promise.all([
    publicationsRepo.findIdsWithFlags(),
    publicationsRepo.findIdsByHighlight({ mahighlight: true, highlight: false }),
    publicationsRepo.findIdsByFreshness({
      sinceTs,
      minPressScore: FRESH_SCORE_THRESHOLD,
    }),
  ]);

  const unionIds = new Set<string>([...flaggedIds, ...mahlIds, ...freshIds]);
  if (unionIds.size === 0) {
    const decision_counts = await decisionCountsP;
    return {
      publications: [],
      since_ts: sinceTs,
      sort: useCombined ? 'combined' : 'press_score',
      counts: { total: 0, flagged: 0, mahl: 0, fresh: 0 },
      decision_counts,
    };
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = await publicationsRepo.findManyForQueue({
    where: and(
      inArray(publications.id, [...unionIds]),
      eq(publications.archived, false),
      eq(publications.decision, 'undecided'),
      or(
        isNull(publications.snoozeUntil),
        lte(publications.snoozeUntil, today),
      ),
    ),
    orderBy: [
      descNullsLast(publications.pressScore),
      desc(publications.updatedAt),
    ],
  });
  const flattenedAll = rows.map(flattenRow);
  const ranked = useCombined ? combineRanks(flattenedAll) : flattenedAll;
  const decision_counts = await decisionCountsP;

  return {
    publications: ranked,
    since_ts: sinceTs,
    sort: useCombined ? 'combined' : 'press_score',
    counts: {
      total: ranked.length,
      flagged: flaggedIds.size,
      mahl: mahlIds.size,
      fresh: freshIds.size,
    },
    decision_counts,
  };
}
