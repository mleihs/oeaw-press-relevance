import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseFromRequest } from '@/lib/api-helpers';

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
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);

    const sinceTs = await fetchSinceTimestamp(supabase);
    const [flaggedIds, mahlIds, freshIds] = await Promise.all([
      fetchFlaggedIds(supabase),
      fetchMahighlightIds(supabase),
      fetchFreshHighScoreIds(supabase, sinceTs),
    ]);

    const unionIds = new Set<string>([...flaggedIds, ...mahlIds, ...freshIds]);
    if (unionIds.size === 0) {
      return NextResponse.json({
        publications: [],
        since_ts: sinceTs,
        counts: { total: 0, flagged: 0, mahl: 0, fresh: 0 },
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('publications')
      .select(
        `*, publication_type_lookup:publication_types(name_de, name_en),
         orgunit_publications(orgunit:orgunits(id, akronym_de, name_de))`,
      )
      .in('id', [...unionIds])
      .eq('archived', false)
      .eq('decision', 'undecided')
      .or(`snooze_until.is.null,snooze_until.lte.${today}`)
      .order('press_score', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false });

    if (error) return apiError(error.message, 500);

    type Row = {
      id: string;
      orgunit_publications?: Array<{ orgunit?: { id: string; akronym_de: string; name_de: string } }>;
      [k: string]: unknown;
    };
    const flattened = (data as Row[] | null ?? []).map((r) => {
      const orgunits = (r.orgunit_publications ?? [])
        .map((op) => op.orgunit)
        .filter(Boolean);
      const out: Record<string, unknown> = { ...r, orgunits };
      delete out.orgunit_publications;
      return out;
    });

    return NextResponse.json({
      publications: flattened,
      since_ts: sinceTs,
      counts: {
        total: flattened.length,
        flagged: flaggedIds.size,
        mahl: mahlIds.size,
        fresh: freshIds.size,
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
