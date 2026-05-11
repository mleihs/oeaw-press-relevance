import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseFromRequest } from '@/lib/api-helpers';
import { DECISIONS, isDecision, type Decision } from '@/lib/types';

const FRESHNESS_FALLBACK_DAYS = 7;
const FRESH_SCORE_THRESHOLD = 0.7;

type SB = ReturnType<typeof getSupabaseFromRequest>;

async function fetchSinceTimestamp(supabase: SB): Promise<string> {
  const { data } = await supabase
    .from('review_sessions')
    .select('occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data?.occurred_at) return data.occurred_at;
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - FRESHNESS_FALLBACK_DAYS);
  return fallback.toISOString();
}

async function fetchFlaggedIds(supabase: SB): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await supabase.rpc('pub_ids_with_flags');
  for (const r of (data as Array<{ publication_id: string }>) ?? []) out.add(r.publication_id);
  return out;
}

async function fetchMahighlightIds(supabase: SB): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await supabase.rpc('pub_ids_by_highlight', {
    p_mahighlight: true,
    p_highlight: false,
  });
  for (const r of (data as Array<{ publication_id: string }>) ?? []) out.add(r.publication_id);
  return out;
}

async function fetchFreshHighScoreIds(supabase: SB, sinceTs: string): Promise<Set<string>> {
  const out = new Set<string>();
  // Page through — Supabase caps at 1000 rows per request and a busy queue
  // could occasionally exceed that. We only need IDs so the cost is small.
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('publications')
      .select('id')
      .eq('analysis_status', 'analyzed')
      .gte('press_score', FRESH_SCORE_THRESHOLD)
      .gte('updated_at', sinceTs)
      .eq('archived', false)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ id: string }>) out.add(r.id);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/**
 * Sitzungs-Queue. Returns the union of:
 *   - publications with at least one flag note
 *   - publications with mahighlight=true on any author
 *   - publications analyzed since the last review session (or last 7 days as
 *     fallback) with press_score >= 0.7
 * filtered down by:
 *   - archived = false
 *   - decision = 'undecided'
 *   - snooze_until IS NULL OR snooze_until <= CURRENT_DATE
 *
 * Uses `updated_at` as a proxy for `analyzed_at` (no dedicated column yet).
 * Good enough: an analysis run touches updated_at via the press_score write.
 */
/**
 * Combined ranking that fuses press_score and press_similarity by rank-average.
 * Robust to scale differences (press_score in 0..1, press_similarity is cosine
 * around 0..1 but with much narrower spread). Pubs without similarity fall
 * back to press_score rank only.
 */
function combineRanks<T extends { press_score: number | null; press_similarity: number | null }>(
  rows: T[],
): T[] {
  const n = rows.length;
  if (n === 0) return rows;
  const idx = rows.map((_, i) => i);

  const rankBy = (field: 'press_score' | 'press_similarity'): Map<number, number> => {
    const sortable = idx.map((i) => ({ i, v: rows[i][field] }));
    sortable.sort((a, b) => {
      const av = a.v ?? -Infinity;
      const bv = b.v ?? -Infinity;
      return bv - av;
    });
    const ranks = new Map<number, number>();
    sortable.forEach((s, r) => {
      // 1-based rank, NaN/null pubs get rank=n+1 (lowest)
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

const PUB_SELECT = `*, publication_type_lookup:publication_types(name_de, name_en),
   orgunit_publications(orgunit:orgunits(id, akronym_de, name_de))`;

type RawRow = {
  id: string;
  press_score: number | null;
  press_similarity: number | null;
  orgunit_publications?: Array<{ orgunit?: { id: string; akronym_de: string; name_de: string } }>;
  [k: string]: unknown;
};

function flattenOrgunits(rows: RawRow[]) {
  return rows.map((r) => {
    const orgunits = (r.orgunit_publications ?? []).map((op) => op.orgunit).filter(Boolean);
    const out: Record<string, unknown> = { ...r, orgunits };
    delete out.orgunit_publications;
    return out;
  });
}

/**
 * Decision-bucket counts across all non-archived publications. Drives the
 * tab badges so the user sees how many pubs sit in each state at a glance.
 */
async function fetchDecisionCounts(supabase: SB): Promise<Record<Decision, number>> {
  const results = await Promise.all(
    DECISIONS.map((d) =>
      supabase
        .from('publications')
        .select('*', { count: 'exact', head: true })
        .eq('archived', false)
        .eq('decision', d),
    ),
  );
  return Object.fromEntries(
    DECISIONS.map((d, i) => [d, results[i].count ?? 0]),
  ) as Record<Decision, number>;
}

/** Decided-bucket fetch: simple list of pubs in a given non-undecided state. */
async function fetchDecidedBucket(supabase: SB, decision: Exclude<Decision, 'undecided'>) {
  const { data, error } = await supabase
    .from('publications')
    .select(PUB_SELECT)
    .eq('archived', false)
    .eq('decision', decision)
    .order('decided_at', { ascending: false, nullsFirst: false });
  if (error) return { rows: null, error };
  return { rows: (data as RawRow[] | null) ?? [], error: null };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const url = new URL(req.url);
    const useCombined = url.searchParams.get('sort') === 'combined';
    const rawDecision = url.searchParams.get('decision') ?? 'undecided';
    const decisionParam: Decision = isDecision(rawDecision) ? rawDecision : 'undecided';

    const decisionCountsP = fetchDecisionCounts(supabase);

    // Decided bucket — short path, no since_ts / flagged / mahl / fresh logic.
    if (decisionParam !== 'undecided') {
      const { rows, error } = await fetchDecidedBucket(supabase, decisionParam);
      if (error) return apiError(error.message, 500);
      const flattened = flattenOrgunits(rows ?? []);
      const decision_counts = await decisionCountsP;
      return NextResponse.json({
        publications: flattened,
        since_ts: null,
        sort: 'decided_at',
        counts: { total: flattened.length, flagged: 0, mahl: 0, fresh: 0 },
        decision_counts,
      });
    }

    const sinceTs = await fetchSinceTimestamp(supabase);
    const [flaggedIds, mahlIds, freshIds] = await Promise.all([
      fetchFlaggedIds(supabase),
      fetchMahighlightIds(supabase),
      fetchFreshHighScoreIds(supabase, sinceTs),
    ]);

    const unionIds = new Set<string>([...flaggedIds, ...mahlIds, ...freshIds]);
    if (unionIds.size === 0) {
      const decision_counts = await decisionCountsP;
      return NextResponse.json({
        publications: [],
        since_ts: sinceTs,
        sort: useCombined ? 'combined' : 'press_score',
        counts: { total: 0, flagged: 0, mahl: 0, fresh: 0 },
        decision_counts,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('publications')
      .select(PUB_SELECT)
      .in('id', [...unionIds])
      .eq('archived', false)
      .eq('decision', 'undecided')
      .or(`snooze_until.is.null,snooze_until.lte.${today}`)
      .order('press_score', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false });

    if (error) return apiError(error.message, 500);

    const rawRows = (data as RawRow[] | null) ?? [];
    const ranked = useCombined ? combineRanks(rawRows) : rawRows;
    const flattened = flattenOrgunits(ranked);
    const decision_counts = await decisionCountsP;

    return NextResponse.json({
      publications: flattened,
      since_ts: sinceTs,
      sort: useCombined ? 'combined' : 'press_score',
      counts: {
        total: flattened.length,
        flagged: flaggedIds.size,
        mahl: mahlIds.size,
        fresh: freshIds.size,
      },
      decision_counts,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
