import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lang } from '@/lib/shared/types';
import { PublicationNotFoundError } from './errors';

const PUB_DETAIL_SELECT = `
  *,
  publication_type_lookup:publication_types(id, webdb_uid, name_de, name_en),
  person_publications(highlight, mahighlight, authorship, person:persons(*)),
  orgunit_publications(highlight, orgunit:orgunits(id, webdb_uid, name_de, name_en, akronym_de, akronym_en, url_de, url_en)),
  publication_projects(project:projects(*)),
  press_releases(*)
`;

interface PersonPubRow {
  person: Record<string, unknown> | null;
  authorship: string | null;
  highlight: boolean;
  mahighlight: boolean;
}
interface OrgunitPubRow {
  orgunit: Record<string, unknown> | null;
  highlight: boolean;
}
interface ProjectPubRow {
  project: Record<string, unknown> | null;
}
interface RawDetailRow {
  press_releases?: Array<{ lang: Lang | null }>;
  person_publications?: PersonPubRow[];
  orgunit_publications?: OrgunitPubRow[];
  publication_projects?: ProjectPubRow[];
  [k: string]: unknown;
}

/**
 * Fetches a publication with the full relation graph for the detail page:
 * publication_type lookup, authors with highlight flags, orgunits with
 * highlight flag, projects, and the press_releases collection. The result
 * is flattened into a friendlier shape (`authors_resolved`, `orgunits`,
 * `projects`, `press_release`) so the UI doesn't have to repeat the join
 * traversal.
 *
 * When the pub doesn't exist Supabase returns an error on .single(); this
 * is mapped to PublicationNotFoundError so the route layer can produce 404.
 */
export async function getPublicationById(
  pubId: string,
  db: SupabaseClient,
): Promise<Record<string, unknown>> {
  const { data, error } = await db
    .from('publications')
    .select(PUB_DETAIL_SELECT)
    .eq('id', pubId)
    .single<RawDetailRow>();

  if (error || !data) {
    throw new PublicationNotFoundError(error?.message);
  }

  // Press-release: prefer DE over EN when both exist for the same pub.
  const prs = data.press_releases ?? [];
  const press_release = prs.find((p) => p.lang === 'de') ?? prs[0] ?? null;

  const out: Record<string, unknown> = {
    ...data,
    press_release,
    authors_resolved: (data.person_publications ?? [])
      .filter((pp): pp is PersonPubRow & { person: Record<string, unknown> } =>
        pp.person !== null,
      )
      .map((pp) => ({
        ...pp.person,
        authorship: pp.authorship,
        highlight: pp.highlight,
        mahighlight: pp.mahighlight,
      })),
    orgunits: (data.orgunit_publications ?? [])
      .filter((op): op is OrgunitPubRow & { orgunit: Record<string, unknown> } =>
        op.orgunit !== null,
      )
      .map((op) => ({
        ...op.orgunit,
        highlight: op.highlight,
      })),
    projects: (data.publication_projects ?? [])
      .filter((pp): pp is ProjectPubRow & { project: Record<string, unknown> } =>
        pp.project !== null,
      )
      .map((pp) => pp.project),
  };
  delete out.person_publications;
  delete out.orgunit_publications;
  delete out.publication_projects;
  delete out.press_releases;
  return out;
}

export async function deletePublication(
  pubId: string,
  db: SupabaseClient,
): Promise<void> {
  const { error } = await db.from('publications').delete().eq('id', pubId);
  if (error) throw new Error(error.message);
}
