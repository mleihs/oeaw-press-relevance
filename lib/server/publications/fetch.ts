import { publicationsRepo } from '@/lib/server/repos/publications';
import { pressReleaseToApi } from '@/lib/server/press-releases/to-api';
import type {
  Person,
  PressRelease,
  PublicationWithRelations,
} from '@/lib/shared/types';
import {
  orgunitToApi,
  personToApi,
  projectToApi,
  publicationToApi,
  publicationTypeToApi,
} from './to-api';

/**
 * Fetches a publication with the full relation graph for the detail page:
 * publication_type lookup, authors with highlight flags, orgunits with
 * highlight flag, projects, and the press_releases collection. The result
 * is flattened into `PublicationWithRelations` (`authors_resolved`,
 * `orgunits`, `projects`, `press_release`) so the UI doesn't have to repeat
 * the join traversal.
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
  const row = await publicationsRepo.findByIdDetail(pubId);

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

  const orgunits: PublicationWithRelations['orgunits'] = (
    row.orgunitPublications ?? []
  )
    .filter(
      (op): op is typeof op & { orgunit: NonNullable<typeof op.orgunit> } =>
        op.orgunit !== null,
    )
    .map((op) => orgunitToApi(op.orgunit));

  const projects: PublicationWithRelations['projects'] = (
    row.publicationProjects ?? []
  )
    .filter(
      (pp): pp is typeof pp & { project: NonNullable<typeof pp.project> } =>
        pp.project !== null,
    )
    .map((pp) => projectToApi(pp.project));

  return {
    ...publicationToApi(row),
    press_release,
    publication_type_lookup: row.publicationTypeRef
      ? publicationTypeToApi(row.publicationTypeRef)
      : null,
    authors_resolved,
    orgunits,
    projects,
  };
}

export async function deletePublication(pubId: string): Promise<void> {
  await publicationsRepo.deleteById(pubId);
}
