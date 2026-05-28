import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { publicationsRepo } from '@/lib/server/repos/publications';
import { pressReleaseToApi } from '@/lib/server/press-releases/to-api';
import type {
  ParsedCitationTrailerPerson,
  Person,
  PressRelease,
  PublicationWithRelations,
} from '@/lib/shared/types';
import { extractCandidateNames, parseCitation } from './citation-parser';
import {
  personToApi,
  projectToApi,
  publicationToApi,
  publicationTypeToApi,
} from './to-api';

/**
 * Lookup of names → matching rows in the `persons` table. Used to enrich
 * a parsed-citation trailer so editor / contributor / mentioned-colleague
 * names can render as person-page links in the CitationCard.
 *
 * Exact case-insensitive match against `firstname || ' ' || lastname`.
 * Sequentially scans persons (~5k rows on prod, microseconds) since the
 * trigram index doesn't cover the `lower(...)` form; acceptable on a
 * single-row detail fetch.
 *
 * `sql.param(arr)::text[]` binds the candidate list as one PG array, the
 * same convention already used in `findIdsByOestat6` / `findOrgunitContext-
 * ByPubIds`. Without it, Drizzle's sql tag expands a JS array into the
 * IN-clause shape, which `unnest(...)` cannot consume on the prod pooler
 * (see memory: `drizzle-any-array-prod-bug`).
 */
async function findTrailerPersons(
  candidates: string[],
): Promise<ParsedCitationTrailerPerson[]> {
  if (candidates.length === 0) return [];
  const rows = await db.execute<{
    candidate: string;
    person_id: string;
    external: boolean;
  }>(
    sql`
      SELECT DISTINCT
        c.name AS candidate,
        p.id::text AS person_id,
        p.external AS external
      FROM unnest(${sql.param(candidates)}::text[]) AS c(name)
      JOIN persons p
        ON lower(p.firstname || ' ' || p.lastname) = lower(c.name)
    `,
  );
  return rows.map((r) => ({
    name: r.candidate,
    person_id: r.person_id,
    external: r.external,
  }));
}

/**
 * Fetches a publication with the full relation graph for the detail page:
 * publication_type lookup, authors, projects, and the press_releases
 * collection. Orgunit chips come from the `publication_orgunit_context` view
 * (same read-path as the list, so direct WebDB attribution + the
 * author-affiliation fallback stay consistent between list and detail).
 * The result is flattened into `PublicationWithRelations`
 * (`authors_resolved`, `orgunits`, `projects`, `press_release`) so the UI
 * doesn't have to repeat the join traversal.
 *
 * Repo returns the raw Drizzle row with embedded relations; this function
 * owns the per-feature flattening + DTO mapping. Missing row → `null` so
 * RSC callers can `notFound()` directly (per ADR 0009 pilot pattern) and
 * route handlers can map to 404. `PublicationNotFoundError` is still raised
 * by the mutation paths (`decisions.ts`, `flag.ts`) where acting on an
 * absent row is a real error.
 */
export async function getPublicationById(
  pubId: string,
): Promise<PublicationWithRelations | null> {
  // Parallel: the main relation graph and the view-backed orgunit chips.
  // Without the parallel call the orgunit lookup would block on the
  // findByIdDetail result even though it only needs the pubId.
  const [row, orgunitContextByPub] = await Promise.all([
    publicationsRepo.findByIdDetail(pubId),
    publicationsRepo.findOrgunitContextByPubIds([pubId]),
  ]);

  if (!row) return null;

  // Press-release: prefer DE over EN when both exist for the same pub.
  // Defensive sort by lang because the relational query order isn't
  // contractually fixed.
  const prsApi = (row.pressReleases ?? []).map(pressReleaseToApi);
  const press_release: PressRelease | null =
    prsApi.find((p) => p.lang === 'de') ?? prsApi[0] ?? null;

  const authors_resolved: PublicationWithRelations['authors_resolved'] = (
    row.personPublications ?? []
  )
    .filter(
      (pp): pp is typeof pp & { person: NonNullable<typeof pp.person> } =>
        pp.person !== null,
    )
    .map((pp) => ({
      ...(personToApi(pp.person) as Person),
      authorship: pp.authorship,
      highlight: pp.highlight,
      mahighlight: pp.mahighlight,
    }));

  const orgunits: PublicationWithRelations['orgunits'] =
    orgunitContextByPub.get(pubId) ?? [];

  const projects: PublicationWithRelations['projects'] = (
    row.publicationProjects ?? []
  )
    .filter(
      (pp): pp is typeof pp & { project: NonNullable<typeof pp.project> } =>
        pp.project !== null,
    )
    .map((pp) => projectToApi(pp.project));

  // Structured Pure-citation projection — null when the citation is plain
  // text or any other format. The detail page uses it for the richer
  // citation block; plain-text fallback (`decodeHtmlBlock`) covers the
  // null case. Lift on detail fetch (one row) not list fetch (50 rows × ~3 KB).
  //
  // After the pure parse we ALSO scan the trailer text for person-name
  // candidates and join against the `persons` table. Matches let the
  // CitationCard turn editor / contributor names (e.g., "Hrsg. /
  // Birgitta Eder; …") into person-page links — same value as linking
  // the OEAW authors in the main list, just for everyone the WebDB has
  // a row for that the editor pipeline didn't link via
  // `person_publications`.
  const parsedBase = parseCitation(row.citation);
  const trailerPersons = parsedBase?.trailer
    ? await findTrailerPersons(extractCandidateNames(parsedBase.trailer))
    : [];
  const parsed_citation = parsedBase
    ? { ...parsedBase, trailer_persons: trailerPersons }
    : null;

  return {
    ...publicationToApi(row),
    press_release,
    publication_type_lookup: row.publicationTypeRef
      ? publicationTypeToApi(row.publicationTypeRef)
      : null,
    authors_resolved,
    orgunits,
    projects,
    parsed_citation,
  };
}

export async function deletePublication(pubId: string): Promise<void> {
  await publicationsRepo.deleteById(pubId);
}
