import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseFromRequest } from '@/lib/api-helpers';

type SB = ReturnType<typeof getSupabaseFromRequest>;

function csv(s: string | null): string[] {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// publication_type webdb_uids excluded from the press-eligible default view.
const ELIGIBILITY_EXCLUDE_TYPE_UIDS = [5, 7, 8, 13, 15, 19, 23];

// Sentinel UUID guaranteed not to match any row — used when a pre-fetch returns 0 IDs
// so .in('id', [sentinel]) yields no results (vs. matching everything on an empty list).
const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';

// Fetch publication IDs via matview for given ÖSTAT6 category IDs. Paginates.
async function fetchPubIdsByOestat6(supabase: SB, oestat6Ids: string[]): Promise<Set<string>> {
  const ids = new Set<string>();
  if (oestat6Ids.length === 0) return ids;
  const batch = 1000;
  for (let offset = 0; offset < 50000; offset += batch) {
    const { data, error } = await supabase
      .from('publication_oestat6')
      .select('publication_id')
      .in('oestat6_id', oestat6Ids)
      .range(offset, offset + batch - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) ids.add(r.publication_id as string);
    if (data.length < batch) break;
  }
  return ids;
}

// Fetch publication IDs from person_publications matching mahighlight or highlight flags.
async function fetchPubIdsByHighlight(
  supabase: SB,
  ma: boolean,
  hl: boolean,
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!ma && !hl) return ids;
  const batch = 1000;
  for (let offset = 0; offset < 50000; offset += batch) {
    let q = supabase.from('person_publications').select('publication_id');
    if (ma && hl) q = q.or('mahighlight.eq.true,highlight.eq.true');
    else if (ma) q = q.eq('mahighlight', true);
    else if (hl) q = q.eq('highlight', true);
    const { data, error } = await q.range(offset, offset + batch - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) ids.add(r.publication_id as string);
    if (data.length < batch) break;
  }
  return ids;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseFromRequest(req);
    const { searchParams } = new URL(req.url);

    // ---------- parse params ----------
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');
    // R2: cap search to 200 chars (DoS guard) + B3: escape PostgREST .or() metacharacters
    // (`,` `(` `)` `*` `\`) so a crafted query can't break out of the filter context.
    const rawSearch = (searchParams.get('search') || '').slice(0, 200);
    const search = rawSearch.replace(/[\\,()*]/g, (m) => '\\' + m);
    const enrichmentStatus = searchParams.get('enrichment_status') || '';
    const analysisStatus = searchParams.get('analysis_status') || '';
    const publicationType = searchParams.get('publication_type') || '';
    const publicationTypeId = searchParams.get('publication_type_id') || '';
    const pubTypeIds = csv(searchParams.get('pub_type_ids'));
    const orgunitId = searchParams.get('orgunit_id') || '';
    const orgunitIds = csv(searchParams.get('orgunit_ids'));
    const oestat6Ids = csv(searchParams.get('oestat6_ids'));
    const oestat3Domains = csv(searchParams.get('oestat3_domains'))
      .map(Number)
      .filter((n) => Number.isFinite(n));
    // top_level_only is accepted for backwards-compat but no longer affects
    // the backend query — the UI handles dropdown filtering on its own.
    void searchParams.get('top_level_only');
    const publishedAfter = searchParams.get('published_after') || '';
    const fromDate = searchParams.get('from') || '';
    const toDate = searchParams.get('to') || '';
    const minScore = searchParams.get('min_score') || '';
    const excludeIta = searchParams.get('exclude_ita') === 'true';
    const peerReviewed = searchParams.get('peer_reviewed');
    const popularScience = searchParams.get('popular_science');
    const openAccess = searchParams.get('open_access');
    const hasSummaryDe = searchParams.get('has_summary_de') === 'true';
    const hasSummaryEn = searchParams.get('has_summary_en') === 'true';
    const hasPdf = searchParams.get('has_pdf') === 'true';
    const hasDoi = searchParams.get('has_doi') === 'true';
    const mahighlight = searchParams.get('mahighlight') === 'true';
    const highlight = searchParams.get('highlight') === 'true';
    const defaultEligible = searchParams.get('default_eligible') === 'true';
    const includeArchived = searchParams.get('include_archived') === 'true';
    const sortBy = searchParams.get('sort') || 'published_at';
    const sortOrder = searchParams.get('order') === 'asc' ? true : false;
    const statsOnly = searchParams.get('stats') === 'true';

    // ---------- statsOnly branch ----------
    if (statsOnly) {
      let badTypeIdsForStats: string[] = [];
      if (defaultEligible) {
        const { data: badTypes } = await supabase
          .from('publication_types')
          .select('id')
          .in('webdb_uid', ELIGIBILITY_EXCLUDE_TYPE_UIDS);
        badTypeIdsForStats = (badTypes ?? []).map((t) => (t as { id: string }).id);
      }

      const baseFilter = <T>(q: T): T => {
        let r: T = includeArchived
          ? q
          : (q as unknown as { eq(col: string, val: unknown): T }).eq('archived', false);
        if (defaultEligible && badTypeIdsForStats.length) {
          r = (r as unknown as {
            not(col: string, op: string, val: unknown): T;
          }).not('publication_type_id', 'in', `(${badTypeIdsForStats.join(',')})`);
        }
        return r;
      };

      const { count: total } = await baseFilter(
        supabase.from('publications').select('*', { count: 'exact', head: true }),
      );

      const { count: enriched } = await baseFilter(
        supabase.from('publications').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'enriched'),
      );

      const { count: partialCount } = await baseFilter(
        supabase.from('publications').select('*', { count: 'exact', head: true })
          .eq('enrichment_status', 'partial'),
      );

      const { count: withAbstractCount } = await baseFilter(
        supabase.from('publications').select('*', { count: 'exact', head: true })
          .not('enriched_abstract', 'is', null),
      );

      const { count: analyzed } = await baseFilter(
        supabase.from('publications').select('*', { count: 'exact', head: true })
          .eq('analysis_status', 'analyzed'),
      );

      const { count: peerReviewedCount } = await baseFilter(
        supabase.from('publications').select('*', { count: 'exact', head: true })
          .eq('peer_reviewed', true),
      );

      const { count: popularScienceCount } = await baseFilter(
        supabase.from('publications').select('*', { count: 'exact', head: true })
          .eq('popular_science', true),
      );

      const { count: bilingualSummaryCount } = await baseFilter(
        supabase.from('publications').select('*', { count: 'exact', head: true })
          .not('summary_de', 'is', null)
          .not('summary_en', 'is', null),
      );

      const allScores: number[] = [];
      const batchSize = 1000;
      for (let offset = 0; ; offset += batchSize) {
        const { data: batch } = await baseFilter(
          supabase.from('publications')
            .select('press_score')
            .eq('analysis_status', 'analyzed')
            .not('press_score', 'is', null),
        ).range(offset, offset + batchSize - 1);
        if (!batch || batch.length === 0) break;
        allScores.push(...batch.map((d: { press_score: number }) => d.press_score));
        if (batch.length < batchSize) break;
      }

      let avgScore: number | null = null;
      let highScoreCount = 0;
      const scoreDistribution = new Array(10).fill(0);
      if (allScores.length > 0) {
        avgScore = allScores.reduce((a, b) => a + b, 0) / allScores.length;
        highScoreCount = allScores.filter((s) => s >= 0.6).length;
        for (const s of allScores) {
          const idx = Math.min(9, Math.floor(s * 10));
          scoreDistribution[idx]++;
        }
      }

      return NextResponse.json({
        total: total || 0,
        enriched: enriched || 0,
        partial: partialCount || 0,
        with_abstract: withAbstractCount || 0,
        analyzed: analyzed || 0,
        peer_reviewed: peerReviewedCount || 0,
        popular_science: popularScienceCount || 0,
        bilingual_summary: bilingualSummaryCount || 0,
        avg_score: avgScore,
        high_score_count: highScoreCount,
        score_distribution: scoreDistribution,
      });
    }

    // ---------- pre-fetches ----------

    // ÖSTAT6 + ÖSTAT3-domain merge → pub-id candidate set
    let oestatPubIdSet: Set<string> | null = null;
    if (oestat6Ids.length || oestat3Domains.length) {
      const allOestat6Ids = new Set<string>(oestat6Ids);
      if (oestat3Domains.length) {
        const { data: cats } = await supabase
          .from('oestat6_categories')
          .select('id')
          .in('oestat3', oestat3Domains);
        for (const c of cats ?? []) allOestat6Ids.add((c as { id: string }).id);
      }
      oestatPubIdSet = await fetchPubIdsByOestat6(supabase, [...allOestat6Ids]);
    }

    // Highlights: pub-ids that have any person_publication row with the requested flag
    let highlightPubIdSet: Set<string> | null = null;
    if (mahighlight || highlight) {
      highlightPubIdSet = await fetchPubIdsByHighlight(supabase, mahighlight, highlight);
    }

    // top_level_only is now a pure UI-side filter (controls which orgunits are
    // visible in the dropdown). The backend never restricts publications by
    // hierarchy tier — that would zero out results because publications are
    // attached to leaf-level orgunits (e.g. IMAFO_AG_Preiser-Kapeller), not to
    // root nodes. Whatever IDs the UI sent, we filter on those directly.
    const effectiveOrgunitIds = orgunitIds;

    // default_eligible → resolve excluded publication_type ids
    let badTypeIds: string[] = [];
    if (defaultEligible) {
      const { data: badTypes } = await supabase
        .from('publication_types')
        .select('id')
        .in('webdb_uid', ELIGIBILITY_EXCLUDE_TYPE_UIDS);
      badTypeIds = (badTypes ?? []).map((t) => (t as { id: string }).id);
    }

    // ---------- shared filter application ----------
    type AnyQuery = {
      eq: (col: string, val: unknown) => AnyQuery;
      not: (col: string, op: string, val: unknown) => AnyQuery;
      gte: (col: string, val: unknown) => AnyQuery;
      lte: (col: string, val: unknown) => AnyQuery;
      in: (col: string, vals: unknown[]) => AnyQuery;
      is: (col: string, val: unknown) => AnyQuery;
      or: (filters: string) => AnyQuery;
      order: (col: string, opts: { ascending: boolean }) => AnyQuery;
      range: (a: number, b: number) => AnyQuery;
    };

    const applyFilters = (q: AnyQuery, applyEligibility: boolean): AnyQuery => {
      let query = q;
      if (!includeArchived) query = query.eq('archived', false);
      if (search) {
        query = query.or(
          `title.ilike.%${search}%,original_title.ilike.%${search}%,summary_de.ilike.%${search}%,summary_en.ilike.%${search}%,lead_author.ilike.%${search}%`,
        );
      }
      if (enrichmentStatus) query = query.eq('enrichment_status', enrichmentStatus);
      if (analysisStatus) query = query.eq('analysis_status', analysisStatus);
      if (publicationType) query = query.eq('publication_type', publicationType);
      if (publicationTypeId) query = query.eq('publication_type_id', publicationTypeId);
      if (pubTypeIds.length) query = query.in('publication_type_id', pubTypeIds);
      if (publishedAfter) query = query.gte('published_at', publishedAfter);
      if (fromDate) query = query.gte('published_at', fromDate);
      if (toDate) query = query.lte('published_at', toDate);
      if (minScore) query = query.gte('press_score', parseFloat(minScore));
      if (peerReviewed === 'true') query = query.eq('peer_reviewed', true);
      if (peerReviewed === 'false') query = query.eq('peer_reviewed', false);
      if (popularScience === 'true') query = query.eq('popular_science', true);
      if (popularScience === 'false') query = query.eq('popular_science', false);
      if (openAccess === 'true') query = query.eq('open_access', true);
      if (openAccess === 'false') query = query.eq('open_access', false);
      if (hasSummaryDe) query = query.not('summary_de', 'is', null);
      if (hasSummaryEn) query = query.not('summary_en', 'is', null);
      if (hasPdf) query = query.not('download_link', 'is', null);
      if (hasDoi) query = query.not('doi', 'is', null);

      if (orgunitId) query = query.eq('orgunit_publications.orgunit_id', orgunitId);
      if (effectiveOrgunitIds.length) {
        query = query.in('orgunit_publications.orgunit_id', effectiveOrgunitIds);
      }

      if (oestatPubIdSet) {
        const arr = [...oestatPubIdSet];
        query = query.in('id', arr.length ? arr : [SENTINEL_UUID]);
      }
      if (highlightPubIdSet) {
        const arr = [...highlightPubIdSet];
        query = query.in('id', arr.length ? arr : [SENTINEL_UUID]);
      }

      if (excludeIta) {
        query = query
          .or('url.is.null,url.not.ilike.%oeaw.ac.at/ita/%')
          .or('enriched_journal.is.null,enriched_journal.not.ilike.ITA-%')
          .or('enriched_journal.is.null,enriched_journal.not.ilike.ITA %')
          .not('title', 'ilike', '%ITA Dossier%');
      }

      if (applyEligibility && defaultEligible && badTypeIds.length) {
        query = query.not('publication_type_id', 'in', `(${badTypeIds.join(',')})`);
      }

      return query;
    };

    // ---------- main query ----------
    const useInnerOrgJoin = Boolean(orgunitId) || effectiveOrgunitIds.length > 0;
    const selectStr = useInnerOrgJoin
      ? `*, publication_type_lookup:publication_types(name_de, name_en),
         orgunit_publications!inner(orgunit_id, orgunit:orgunits(id, akronym_de, name_de))`
      : `*, publication_type_lookup:publication_types(name_de, name_en),
         orgunit_publications(orgunit:orgunits(id, akronym_de, name_de))`;

    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;

    const mainBuilder = applyFilters(
      supabase.from('publications').select(selectStr, { count: 'exact' }) as unknown as AnyQuery,
      true,
    );
    const mainQuery = mainBuilder.order(sortBy, { ascending: sortOrder }).range(fromIdx, toIdx);

    // ---------- count-without-eligibility for total_hidden ----------
    const noEligPromise = defaultEligible
      ? (applyFilters(
          supabase.from('publications').select(useInnerOrgJoin ? 'id, orgunit_publications!inner(orgunit_id)' : 'id', {
            count: 'exact',
            head: true,
          }) as unknown as AnyQuery,
          false,
        ) as unknown as Promise<{ count: number | null }>)
      : Promise.resolve({ count: null as number | null });

    const [mainResult, noEligResult] = await Promise.all([
      mainQuery as unknown as Promise<{
        data: unknown;
        count: number | null;
        error: { message: string } | null;
      }>,
      noEligPromise,
    ]);

    if (mainResult.error) {
      return NextResponse.json({ error: mainResult.error.message }, { status: 500 });
    }

    type Row = {
      orgunit_publications?: Array<{ orgunit?: { id: string; akronym_de: string; name_de: string } }>;
      [k: string]: unknown;
    };
    const flattened = ((mainResult.data as Row[]) || []).map((r) => {
      const orgunits = (r.orgunit_publications || [])
        .map((op) => op.orgunit)
        .filter(Boolean);
      const out: Record<string, unknown> = { ...r, orgunits };
      delete out.orgunit_publications;
      return out;
    });

    const totalHidden = defaultEligible
      ? Math.max(0, (noEligResult.count ?? 0) - (mainResult.count ?? 0))
      : 0;

    return NextResponse.json({
      publications: flattened,
      total: mainResult.count || 0,
      total_hidden: totalHidden,
      page,
      pageSize,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
