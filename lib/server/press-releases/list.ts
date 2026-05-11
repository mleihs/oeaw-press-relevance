import type { SupabaseClient } from '@supabase/supabase-js';
import type { PressRelease } from '@/lib/shared/types';

export interface PressReleasesStats {
  total: number;
  matched: number;
  orphans: number;
  this_month: number;
  this_year: number;
}

export interface PressReleasesListResult {
  press_releases: PressRelease[];
  total: number;
}

export interface PressReleasesListFilters {
  orphans: 'true' | 'false' | null;
  withPub: boolean;
}

/**
 * Five count-only queries in parallel: total, matched (publication_id NOT
 * NULL), orphans (publication_id NULL), this_month (released_at >= start of
 * current month) and this_year (released_at >= January 1 of current year).
 */
export async function getPressReleasesStats(
  db: SupabaseClient,
): Promise<PressReleasesStats> {
  const startOfMonth = (() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();
  const startOfYear = (() => {
    const d = new Date();
    d.setMonth(0, 1);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  })();

  const [totalQ, matchedQ, orphansQ, monthQ, yearQ] = await Promise.all([
    db.from('press_releases').select('*', { count: 'exact', head: true }),
    db
      .from('press_releases')
      .select('*', { count: 'exact', head: true })
      .not('publication_id', 'is', null),
    db
      .from('press_releases')
      .select('*', { count: 'exact', head: true })
      .is('publication_id', null),
    db
      .from('press_releases')
      .select('*', { count: 'exact', head: true })
      .gte('released_at', startOfMonth),
    db
      .from('press_releases')
      .select('*', { count: 'exact', head: true })
      .gte('released_at', startOfYear),
  ]);

  const firstError =
    totalQ.error || matchedQ.error || orphansQ.error || monthQ.error || yearQ.error;
  if (firstError) throw new Error(firstError.message);

  return {
    total: totalQ.count ?? 0,
    matched: matchedQ.count ?? 0,
    orphans: orphansQ.count ?? 0,
    this_month: monthQ.count ?? 0,
    this_year: yearQ.count ?? 0,
  };
}

/**
 * List press-releases ordered by released_at desc.
 *   - `orphans: 'true'`  -> only publication_id IS NULL
 *   - `orphans: 'false'` -> only publication_id IS NOT NULL
 *   - `orphans: null`    -> all
 *   - `withPub: true`    -> joins lightweight publication fields used by the
 *                          UI listing page
 */
export async function listPressReleases(
  filters: PressReleasesListFilters,
  db: SupabaseClient,
): Promise<PressReleasesListResult> {
  const select = filters.withPub
    ? `*, publication:publications(id, title, original_title, lead_author, citation, press_score, press_similarity, decision, published_at)`
    : '*';

  let q = db
    .from('press_releases')
    .select(select, { count: 'exact' })
    .order('released_at', { ascending: false, nullsFirst: false });

  if (filters.orphans === 'true') q = q.is('publication_id', null);
  else if (filters.orphans === 'false') q = q.not('publication_id', 'is', null);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);

  // PostgREST type-parser can't narrow embedded relation joins; double-cast
  // through unknown is the standard workaround until @supabase/supabase-js
  // ships proper type-gen for embedded joins. Runtime shape is correct.
  return {
    press_releases: (data ?? []) as unknown as PressRelease[],
    total: count ?? 0,
  };
}
