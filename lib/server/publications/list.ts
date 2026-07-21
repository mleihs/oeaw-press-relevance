import {
  and,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  notInArray,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import {
  db,
  publications,
  oestat6Categories as oestat6CategoriesTable,
  orgunitPublications as orgunitPublicationsTable,
  descNullsLast,
  ascNullsLast,
} from '@/lib/server/db';
import { publicationsRepo } from '@/lib/server/repos/publications';
import { pressReleaseToApi } from '@/lib/server/press-releases/to-api';
import { venueGroupSpellings } from '@/lib/shared/venue-registry';
import type { Lang, Publication, PressRelease } from '@/lib/shared/types';
import { publicationToApi } from './to-api';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';

/**
 * Bewertungs-Scope als Listenfilter. Beantwortet die Frage der
 * Dashboard-Kachel — „welche Publikationen warten auf eine Bewertung?" — mit
 * DERSELBEN Wahrheit, die die Kachel zählt und der Bewerten-Knopf erreicht:
 * der kanonischen View publication_scoring_candidates plus dem 60-Tage-Schnitt.
 *
 * Vorher verlinkte die Kachel auf `?analysis=pending`, eine Annäherung, die
 * failed-Retries wegließ, den press_score nicht prüfte, das Content-Gate nicht
 * kannte und kein Zeitfenster hatte: die Kachel nannte 17, der Klick zeigte
 * Tausende. Genau die Lücke „die Zahl verspricht, was der Klick nicht
 * einlöst", die AP3 auf der Kachel selbst geschlossen hat.
 *
 *   fresh   = die Menge des Bewerten-Knopfes (Kandidaten im Fenster)
 *   backlog = Kandidaten außerhalb des Fensters, also der In-Chat-Rückstau
 *
 * Exportiert für den SQL-Rendering-Test in list.test.ts (keine DB nötig).
 */
export function scoringScopeClause(scope: string): SQL | null {
  if (scope !== 'fresh' && scope !== 'backlog') return null;
  const cutoff = sql`now() - make_interval(days => ${SCORING_RECENT_DAYS}::int)`;
  const window =
    scope === 'fresh'
      ? sql`${publications.createdAt} >= ${cutoff}`
      : sql`${publications.createdAt} < ${cutoff}`;
  return sql`${publications.id} IN (SELECT id FROM publication_scoring_candidates) AND ${window}`;
}

// Sortable column whitelist. The previous Supabase-JS code accepted any
// string from `?sort=`, relying on PostgREST identifier escaping. Drizzle
// has no comparable runtime guard once a string lands inside `sql\`\``,
// so we explicitly map wire-shape keys to typed columns.
// Exported for the SORTABLE_COLUMNS-guard tests in `list.test.ts`.
export const SORTABLE_COLUMNS: Record<string, AnyColumn> = {
  published_at: publications.publishedAt,
  title: publications.title,
  lead_author: publications.leadAuthor,
  press_score: publications.pressScore,
  press_similarity: publications.pressSimilarity,
  updated_at: publications.updatedAt,
  decided_at: publications.decidedAt,
  created_at: publications.createdAt,
  webdb_uid: publications.webdbUid,
  enrichment_status: publications.enrichmentStatus,
  analysis_status: publications.analysisStatus,
  // 5 LLM dimensions — used by the dashboard radar's click-to-sort
  // interaction so the user can re-order the Top-N panel by any single
  // dimension. NULLS LAST is the default order direction in the query
  // builder, so unanalysed pubs (null score on every dim) drop off the
  // bottom and never poison the top of the list.
  public_accessibility: publications.publicAccessibility,
  societal_relevance: publications.societalRelevance,
  novelty_factor: publications.noveltyFactor,
  storytelling_potential: publications.storytellingPotential,
  media_timeliness: publications.mediaTimeliness,
};

// Sentinel UUID guaranteed not to match any row — used when a pre-fetch
// returns 0 IDs so `inArray(id, [SENTINEL])` yields no results (vs.
// matching everything on an empty list).
const SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';

function csv(s: string | null): string[] {
  if (!s) return [];
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

// Eligibility helper: the press-ineligible publication-type IDs, resolved
// from the canonical `ineligible_publication_types` view (the single PG
// home for the excluded-type UID list; migration 20260516000002). The
// server defers to PG so the UID list is not re-encoded in TS — the only
// remaining TS copy is the client filter UI's unavoidable mirror in
// lib/shared/eligibility.ts, pinned by scripts/smoke/eligibility.ts.
async function fetchBadTypeIds(): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(
    sql`SELECT id FROM ineligible_publication_types`,
  );
  return rows.map((r) => r.id);
}

// Oestat3 → oestat6 expansion: a user-selected `domain` (3-digit oestat) is
// resolved to the matching 6-digit categories so the filter pre-fetch can
// look up pubs by those concrete oestat6 IDs.
async function fetchOestat6IdsByDomain(
  oestat3Domains: number[],
): Promise<string[]> {
  if (oestat3Domains.length === 0) return [];
  const rows = await db
    .select({ id: oestat6CategoriesTable.id })
    .from(oestat6CategoriesTable)
    .where(inArray(oestat6CategoriesTable.oestat3, oestat3Domains));
  return rows.map((r) => r.id);
}

// Per-feature list-result item. The wire shape mirrors the prior Supabase-JS
// flattened shape: full Publication + mini publication-type lookup + mini
// orgunit chips + a single (DE-preferred) press_release. The orgunit/type
// projections are deliberately narrower than the full DTOs (payload size).
//
// `orgunits[].source` distinguishes WebDB attribution (`attributed`) from
// the press-triage derivation that fills in when an OEAW author co-authored
// but WebDB didn't claim the paper for any unit (`author_affiliation`).
// `orgunits[].url_de` is shipped because the same chip-fetch (the
// `publication_orgunit_context` view) feeds the detail page, which renders
// each chip as a link. List view ignores it.
// See lib/server/db/migrations/.../publication_orgunit_context_view.sql.
export type PublicationListItem = Publication & {
  publication_type_lookup: { name_de: string; name_en: string } | null;
  orgunits: Array<{
    id: string;
    akronym_de: string | null;
    name_de: string;
    url_de: string | null;
    source: 'attributed' | 'author_affiliation';
  }>;
  press_release: PressRelease | null;
};

export interface PublicationsListResult {
  publications: PublicationListItem[];
  total: number;
  total_hidden: number;
  page: number;
  pageSize: number;
}

/**
 * Paginated publications query with the full Phase-2 filter set. Owns the
 * URLSearchParams parsing so the route handler stays a thin adapter.
 *
 * - `defaultEligible` filter resolves the "ineligible" publication-type IDs
 *   (per `ELIGIBILITY_EXCLUDE_TYPE_UIDS`) at runtime — new ineligible types
 *   added in WebDB are picked up automatically.
 * - `total_hidden` counts pubs that would match all filters EXCEPT the
 *   eligibility filter (UI shows "X hidden by eligibility").
 * - press-released, oestat6, highlight, flagged, orgunit filters all pass
 *   through a pre-fetch → ID-set → `inArray` pipeline. This unifies the
 *   "filter parent by related rows" pattern (instead of mixing PostgREST's
 *   `!inner` joins with EXISTS-style filters) and keeps the main query
 *   single-table — easier to reason about and easier to count.
 */
export async function listPublications(
  searchParams: URLSearchParams,
): Promise<PublicationsListResult> {
  // ---------- parse params ----------
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');
  // Cap search to 200 chars (DoS guard). ILIKE-escape the pattern wildcards
  // (`%` and `_`) plus the SQL string-escape backslash, so a crafted query
  // can't broaden its own match.
  const rawSearch = (searchParams.get('search') || '').slice(0, 200);
  const search = rawSearch.replace(/[\\%_]/g, (m) => '\\' + m);
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
  // Venue exact-match filter (DoS-capped). enriched_journal holds a venue,
  // not strictly a journal — see components/venue-line.tsx.
  const journal = (searchParams.get('journal') || '').slice(0, 300);
  // top_level_only is UI-only since 2026-05; backend doesn't use it.
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
  const flagged = searchParams.get('flagged') === 'true';
  const pressReleased = searchParams.get('press_released');
  const defaultEligible = searchParams.get('default_eligible') === 'true';
  const includeArchived = searchParams.get('include_archived') === 'true';
  // Bewertungs-Scope: '' | 'fresh' | 'backlog'. Die kanonische Kandidaten-View
  // statt einer Annäherung über analysis_status — siehe scoringScopeClause().
  const scoringScope = searchParams.get('scoring_scope') || '';
  const sortByRaw = searchParams.get('sort') || 'published_at';
  const sortBy = sortByRaw in SORTABLE_COLUMNS ? sortByRaw : 'published_at';
  const sortCol = SORTABLE_COLUMNS[sortBy]!;
  const sortAsc = searchParams.get('order') === 'asc';

  // ---------- pre-fetches (parallel) ----------
  const orgunitFilterIds = orgunitId
    ? [orgunitId, ...orgunitIds]
    : orgunitIds;

  const [
    pressReleasedIdSet,
    extraOestat6Ids,
    highlightPubIdSet,
    flaggedPubIdSet,
    orgunitPubIdSet,
    badTypeIds,
  ] = await Promise.all([
    pressReleased === 'true' || pressReleased === 'false'
      ? publicationsRepo.findPressReleasedIds()
      : Promise.resolve(null),
    oestat3Domains.length
      ? fetchOestat6IdsByDomain(oestat3Domains)
      : Promise.resolve([]),
    mahighlight || highlight
      ? publicationsRepo.findIdsByHighlight({ mahighlight, highlight })
      : Promise.resolve(null),
    flagged ? publicationsRepo.findIdsWithFlags() : Promise.resolve(null),
    orgunitFilterIds.length
      ? publicationsRepo.findIdsByOrgunit(orgunitFilterIds)
      : Promise.resolve(null),
    defaultEligible ? fetchBadTypeIds() : Promise.resolve([] as string[]),
  ]);

  // oestat6 needs the union of explicit IDs and domain-resolved IDs.
  const allOestat6Ids = [
    ...new Set<string>([...oestat6Ids, ...extraOestat6Ids]),
  ];
  const oestatPubIdSet =
    allOestat6Ids.length > 0
      ? await publicationsRepo.findIdsByOestat6(allOestat6Ids)
      : null;

  // ---------- build WHERE clauses ----------
  function buildWhere(applyEligibility: boolean): SQL | undefined {
    const clauses: SQL[] = [];

    if (!includeArchived) clauses.push(eq(publications.archived, false));

    const scoping = scoringScopeClause(scoringScope);
    if (scoping) clauses.push(scoping);

    if (search) {
      const pattern = `%${search}%`;
      const searchClause = or(
        ilike(publications.title, pattern),
        ilike(publications.originalTitle, pattern),
        ilike(publications.summaryDe, pattern),
        ilike(publications.summaryEn, pattern),
        ilike(publications.leadAuthor, pattern),
      );
      if (searchClause) clauses.push(searchClause);
    }

    if (enrichmentStatus) {
      clauses.push(eq(publications.enrichmentStatus, enrichmentStatus));
    }
    if (analysisStatus) {
      clauses.push(eq(publications.analysisStatus, analysisStatus));
    }
    if (publicationType) {
      clauses.push(eq(publications.publicationType, publicationType));
    }
    if (publicationTypeId) {
      clauses.push(eq(publications.publicationTypeId, publicationTypeId));
    }
    if (pubTypeIds.length) {
      clauses.push(inArray(publications.publicationTypeId, pubTypeIds));
    }
    if (journal) {
      // When the input maps to a registry entry (e.g. "Der Standard" or any
      // of its aliases like "DerStandard.at"), expand to all known corpus
      // spellings of that canonical group so the filter URL acts on intent
      // (the outlet) rather than one storage variant. The registry's
      // aliases are curated from the corpus, so case-sensitive `IN (...)`
      // is enough for known venues. Unknown venues keep the original
      // case-insensitive exact-match fallback (lower()=lower() rather than
      // ILIKE, so a literal % or _ can't broaden the match).
      const spellings = venueGroupSpellings(journal);
      if (spellings) {
        clauses.push(inArray(publications.enrichedJournal, spellings));
      } else {
        clauses.push(
          sql`lower(${publications.enrichedJournal}) = lower(${journal})`,
        );
      }
    }
    if (publishedAfter) {
      clauses.push(gte(publications.publishedAt, publishedAfter));
    }
    if (fromDate) clauses.push(gte(publications.publishedAt, fromDate));
    if (toDate) clauses.push(lte(publications.publishedAt, toDate));
    if (minScore) {
      const v = parseFloat(minScore);
      if (Number.isFinite(v)) clauses.push(gte(publications.pressScore, v));
    }
    if (peerReviewed === 'true') {
      clauses.push(eq(publications.peerReviewed, true));
    } else if (peerReviewed === 'false') {
      clauses.push(eq(publications.peerReviewed, false));
    }
    if (popularScience === 'true') {
      clauses.push(eq(publications.popularScience, true));
    } else if (popularScience === 'false') {
      clauses.push(eq(publications.popularScience, false));
    }
    if (openAccess === 'true') {
      clauses.push(eq(publications.openAccess, true));
    } else if (openAccess === 'false') {
      clauses.push(eq(publications.openAccess, false));
    }
    if (hasSummaryDe) clauses.push(isNotNull(publications.summaryDe));
    if (hasSummaryEn) clauses.push(isNotNull(publications.summaryEn));
    if (hasPdf) clauses.push(isNotNull(publications.downloadLink));
    if (hasDoi) clauses.push(isNotNull(publications.doi));

    if (pressReleasedIdSet) {
      const arr = [...pressReleasedIdSet];
      if (pressReleased === 'true') {
        clauses.push(
          inArray(publications.id, arr.length ? arr : [SENTINEL_UUID]),
        );
      } else if (pressReleased === 'false' && arr.length > 0) {
        clauses.push(notInArray(publications.id, arr));
      }
    }

    if (orgunitPubIdSet) {
      const arr = [...orgunitPubIdSet];
      clauses.push(
        inArray(publications.id, arr.length ? arr : [SENTINEL_UUID]),
      );
    }
    if (oestatPubIdSet) {
      const arr = [...oestatPubIdSet];
      clauses.push(
        inArray(publications.id, arr.length ? arr : [SENTINEL_UUID]),
      );
    }
    if (highlightPubIdSet) {
      const arr = [...highlightPubIdSet];
      clauses.push(
        inArray(publications.id, arr.length ? arr : [SENTINEL_UUID]),
      );
    }
    if (flaggedPubIdSet) {
      const arr = [...flaggedPubIdSet];
      clauses.push(
        inArray(publications.id, arr.length ? arr : [SENTINEL_UUID]),
      );
    }

    // ITA-subtree filter via cached boolean column (set by ETL after every
    // webdb-import). One indexed clause, no URL bloat from a 365-element
    // NOT-IN list, no client-side filter race.
    if (excludeIta) clauses.push(eq(publications.isItaSubtree, false));

    if (applyEligibility && defaultEligible && badTypeIds.length) {
      clauses.push(notInArray(publications.publicationTypeId, badTypeIds));
    }

    return clauses.length > 0 ? and(...clauses) : undefined;
  }

  const whereMain = buildWhere(true);
  const whereNoElig = defaultEligible ? buildWhere(false) : undefined;

  // ---------- main + count queries (parallel) ----------
  // NULLS LAST: pubs ohne Wert (z.B. published_at NULL bei ~600 Pubs aus
  // unvollständigen WebDB-Einträgen) verschwinden ans Ende statt oben in
  // der DESC-sortierten Liste zu landen — sonst dominiert das die #1-
  // Ansicht des Press-Teams. Helper kapselt den Drizzle-`desc()`-NULLS-Gap
  // (siehe `lib/server/db/sort.ts`).
  const orderClause = sortAsc ? ascNullsLast(sortCol) : descNullsLast(sortCol);

  const fromIdx = (page - 1) * pageSize;

  // Embedded orgunit list mirrors the prior !inner-join behaviour: when an
  // orgunit filter is active, only the matching orgunit rows show up in the
  // chips. Without a filter, all of a pub's orgunits show.
  const embedOrgunitWhere =
    orgunitFilterIds.length > 0
      ? inArray(orgunitPublicationsTable.orgunitId, orgunitFilterIds)
      : undefined;

  const [mainRows, total, totalNoElig] = await Promise.all([
    publicationsRepo.findManyForList({
      where: whereMain,
      orderBy: orderClause,
      limit: pageSize,
      offset: fromIdx,
      embedOrgunitWhere,
    }),
    publicationsRepo.countWhere(whereMain),
    defaultEligible
      ? publicationsRepo.countWhere(whereNoElig)
      : Promise.resolve(0),
  ]);

  // Press-triage orgunit chips come from publication_orgunit_context (the
  // SQL view that unions direct attribution + transitive author-affiliation
  // as fallback). One batched fetch by pub-id keeps it to a single extra
  // round-trip even on a 50-row page. The embed-orgunit filter (active
  // when the user filtered by orgunit_id) is passed through so the chip
  // list and the active filter keep telling the same story.
  const pubIds = mainRows.map((r) => r.id);
  const orgunitContextByPub = await publicationsRepo.findOrgunitContextByPubIds(
    pubIds,
    orgunitFilterIds,
  );

  // ---------- flatten ----------
  const flattened: PublicationListItem[] = mainRows.map((row) => {
    const orgunitsMini = orgunitContextByPub.get(row.id) ?? [];

    const prs = (row.pressReleases ?? []).map(pressReleaseToApi);
    const press_release: PressRelease | null =
      prs.find((p) => p.lang === ('de' as Lang)) ?? prs[0] ?? null;

    // The list projection omits the heavy citation-export blobs
    // (LIST_TRIMMED_COLUMNS) to cut pooler egress; refill them as null so the
    // Publication DTO keeps its full `string | null` shape for the wire.
    const rowFull = {
      ...row,
      ris: null,
      bibtex: null,
      endnote: null,
      citationApa: null,
      fullTextSnippet: null,
    };

    return {
      ...publicationToApi(rowFull),
      publication_type_lookup: row.publicationTypeRef
        ? {
            name_de: row.publicationTypeRef.nameDe,
            name_en: row.publicationTypeRef.nameEn,
          }
        : null,
      orgunits: orgunitsMini,
      press_release,
    };
  });

  const totalHidden = defaultEligible ? Math.max(0, totalNoElig - total) : 0;

  return {
    publications: flattened,
    total,
    total_hidden: totalHidden,
    page,
    pageSize,
  };
}
