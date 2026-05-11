import { NextRequest, NextResponse } from 'next/server';
import { apiError, getSupabaseFromRequest } from '@/lib/server/api-helpers';
import type { PressRelease } from '@/lib/shared/types';

/**
 * Press-releases endpoint.
 *
 * Query params:
 *   ?stats=true     count-only mode → {total, matched, orphans, this_month, this_year}
 *   ?orphans=true   only press-releases without a publications-match (publication_id IS NULL)
 *   ?orphans=false  only matched (publication_id IS NOT NULL)
 *   ?with_pub=true  joins lightweight publication fields for matched rows (title, lead_author,
 *                   press_score, press_similarity, decision) — used by the listing page
 *   (none)          all press-releases (raw)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const sp = req.nextUrl.searchParams;
    const orphans = sp.get('orphans');
    const stats = sp.get('stats') === 'true';
    const withPub = sp.get('with_pub') === 'true';

    if (stats) {
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
        supabase.from('press_releases').select('*', { count: 'exact', head: true }),
        supabase
          .from('press_releases')
          .select('*', { count: 'exact', head: true })
          .not('publication_id', 'is', null),
        supabase
          .from('press_releases')
          .select('*', { count: 'exact', head: true })
          .is('publication_id', null),
        supabase
          .from('press_releases')
          .select('*', { count: 'exact', head: true })
          .gte('released_at', startOfMonth),
        supabase
          .from('press_releases')
          .select('*', { count: 'exact', head: true })
          .gte('released_at', startOfYear),
      ]);
      const firstError =
        totalQ.error || matchedQ.error || orphansQ.error || monthQ.error || yearQ.error;
      if (firstError) return apiError(firstError.message, 500);
      return NextResponse.json({
        total: totalQ.count ?? 0,
        matched: matchedQ.count ?? 0,
        orphans: orphansQ.count ?? 0,
        this_month: monthQ.count ?? 0,
        this_year: yearQ.count ?? 0,
      });
    }

    const select = withPub
      ? `*, publication:publications(id, title, original_title, lead_author, citation, press_score, press_similarity, decision, published_at)`
      : '*';

    let q = supabase
      .from('press_releases')
      .select(select, { count: 'exact' })
      .order('released_at', { ascending: false, nullsFirst: false });

    if (orphans === 'true') q = q.is('publication_id', null);
    else if (orphans === 'false') q = q.not('publication_id', 'is', null);

    const { data, error, count } = await q;
    if (error) return apiError(error.message, 500);

    // The Supabase PostgREST type-parser can't narrow the joined embedded
    // relation in `select(...publication:publications(...))` — it reports a
    // ParserError tuple instead of the row type. Doubling-cast through
    // `unknown` is the standard workaround until @supabase/supabase-js ships
    // proper type-gen for embedded joins. The runtime shape is correct;
    // consumers (UI page) cast to their concrete `PressReleaseWithPub` shape.
    return NextResponse.json({
      press_releases: (data ?? []) as unknown as PressRelease[],
      total: count ?? 0,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
