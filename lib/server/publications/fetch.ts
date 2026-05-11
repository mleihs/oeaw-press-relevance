import { eq } from 'drizzle-orm';
import { db, publications } from '@/lib/server/db';
import type {
  Person,
  PressRelease,
  PublicationWithRelations,
} from '@/lib/shared/types';
import { PublicationNotFoundError } from './errors';
import {
  orgunitToApi,
  personToApi,
  pressReleaseToApi,
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
 * When the pub doesn't exist Drizzle's `findFirst` returns `undefined`; this
 * is mapped to PublicationNotFoundError so the route layer can produce 404.
 */
export async function getPublicationById(
  pubId: string,
): Promise<PublicationWithRelations> {
  const row = await db.query.publications.findFirst({
    where: eq(publications.id, pubId),
    with: {
      publicationType: true,
      pressReleases: true,
      personPublications: {
        with: { person: true },
      },
      orgunitPublications: {
        with: { orgunit: true },
      },
      publicationProjects: {
        with: { project: true },
      },
    },
  });

  if (!row) throw new PublicationNotFoundError();

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
    publication_type_lookup: row.publicationType
      ? publicationTypeToApi(row.publicationType)
      : null,
    authors_resolved,
    orgunits,
    projects,
  };
}

export async function deletePublication(pubId: string): Promise<void> {
  await db.delete(publications).where(eq(publications.id, pubId));
}
