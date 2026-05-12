import {
  count,
  eq,
  inArray,
  isNotNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import {
  db,
  publications,
  orgunitPublications as orgunitPublicationsTable,
  pressReleases as pressReleasesTable,
} from '@/lib/server/db';
import type { Decision, FlagNote } from '@/lib/shared/types';

export type PublicationRow = typeof publications.$inferSelect;

// Detail-page join graph. Consumed by `fetch.ts` (single-row read for
// `/api/publications/[id]`). Wide on purpose: detail page needs authors,
// orgunits, projects, press_releases, and the publication_types lookup row.
const DETAIL_WITH = {
  publicationTypeRef: true,
  pressReleases: true,
  personPublications: { with: { person: true } },
  orgunitPublications: { with: { orgunit: true } },
  publicationProjects: { with: { project: true } },
} as const;

// List-page join graph. Consumed by `publications/list.ts`. Narrower than
// DETAIL_WITH — only the chips the table view shows. `orgunitPublications`
// can take a child WHERE so that orgunit-filtered queries return only the
// matching orgunit chip per row (mirrors the prior !inner-join behaviour).
function listWith(embedOrgunitWhere?: SQL) {
  return {
    publicationTypeRef: { columns: { nameDe: true, nameEn: true } },
    orgunitPublications: {
      columns: { orgunitId: true },
      where: embedOrgunitWhere,
      with: {
        orgunit: {
          columns: { id: true, akronymDe: true, nameDe: true },
        },
      },
    },
    pressReleases: true,
  } as const;
}

// Queue join graph. Consumed by `review/queue.ts`. Same chips as the list
// graph minus `pressReleases` — the queue wire-shape (`ReviewQueueItem`)
// doesn't carry press_release, and joining it just to drop it bloats the
// payload of every undecided pub.
const QUEUE_WITH = {
  publicationTypeRef: { columns: { nameDe: true, nameEn: true } },
  orgunitPublications: {
    columns: { orgunitId: true },
    with: {
      orgunit: {
        columns: { id: true, akronymDe: true, nameDe: true },
      },
    },
  },
} as const;

export type PublicationDetailRow = NonNullable<
  Awaited<ReturnType<typeof findByIdDetail>>
>;
export type PublicationListRow = Awaited<
  ReturnType<typeof findManyForList>
>[number];
export type PublicationQueueRow = Awaited<
  ReturnType<typeof findManyForQueue>
>[number];

async function findByIdDetail(pubId: string) {
  return db.query.publications.findFirst({
    where: eq(publications.id, pubId),
    with: DETAIL_WITH,
  });
}

async function findManyForList(opts: {
  where: SQL | undefined;
  orderBy: SQL;
  limit: number;
  offset: number;
  embedOrgunitWhere?: SQL;
}) {
  return db.query.publications.findMany({
    where: opts.where,
    orderBy: opts.orderBy,
    limit: opts.limit,
    offset: opts.offset,
    with: listWith(opts.embedOrgunitWhere),
  });
}

async function findManyForQueue(opts: {
  where: SQL | undefined;
  orderBy: SQL | SQL[];
}) {
  return db.query.publications.findMany({
    where: opts.where,
    orderBy: opts.orderBy,
    with: QUEUE_WITH,
  });
}

async function countWhere(where: SQL | undefined): Promise<number> {
  const rows = await db
    .select({ c: count() })
    .from(publications)
    .where(where);
  return rows[0]?.c ?? 0;
}

// Returns raw GROUP BY rows; the caller maps to its own bucket shape.
// Always restricts to `archived=false` because the queue's UI counts
// exclude archived rows by contract.
async function countByDecision(): Promise<
  Array<{ decision: string | null; c: number }>
> {
  return db
    .select({ decision: publications.decision, c: count() })
    .from(publications)
    .where(eq(publications.archived, false))
    .groupBy(publications.decision);
}

// Filter-ID-set pre-fetches. Three of these wrap SQL functions whose join
// logic lives in plpgsql (`pub_ids_by_oestat6`, `pub_ids_by_highlight`,
// `pub_ids_with_flags`) — see ADR 0005 for the "stays in Postgres"
// rationale. The remaining two are pure Drizzle builder reads on the
// junction tables.

// `sql.param(arr)` binds the whole array as one PG parameter. Without it,
// Drizzle's sql tag expands JS arrays into `($1, $2, ...)` (IN-clause
// shape) which an `::uuid[]` cast cannot consume — Phase-3 latent bug,
// fixed in commit 4b0215f. See docs/TESTING.md §5.1.
async function findIdsByOestat6(
  oestat6Ids: string[],
): Promise<Set<string>> {
  if (oestat6Ids.length === 0) return new Set();
  const rows = await db.execute<{ publication_id: string }>(
    sql`SELECT publication_id FROM pub_ids_by_oestat6(${sql.param(oestat6Ids)}::uuid[])`,
  );
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.publication_id);
  return ids;
}

async function findIdsByHighlight(
  ma: boolean,
  hl: boolean,
): Promise<Set<string>> {
  if (!ma && !hl) return new Set();
  const rows = await db.execute<{ publication_id: string }>(
    sql`SELECT publication_id FROM pub_ids_by_highlight(${ma}, ${hl})`,
  );
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.publication_id);
  return ids;
}

async function findIdsWithFlags(): Promise<Set<string>> {
  const rows = await db.execute<{ publication_id: string }>(
    sql`SELECT publication_id FROM pub_ids_with_flags()`,
  );
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.publication_id);
  return ids;
}

async function findIdsByOrgunit(
  orgunitFilterIds: string[],
): Promise<Set<string>> {
  if (orgunitFilterIds.length === 0) return new Set();
  const rows = await db
    .select({ publicationId: orgunitPublicationsTable.publicationId })
    .from(orgunitPublicationsTable)
    .where(inArray(orgunitPublicationsTable.orgunitId, orgunitFilterIds));
  const ids = new Set<string>();
  for (const r of rows) ids.add(r.publicationId);
  return ids;
}

async function findPressReleasedIds(): Promise<Set<string>> {
  const rows = await db
    .select({ publicationId: pressReleasesTable.publicationId })
    .from(pressReleasesTable)
    .where(isNotNull(pressReleasesTable.publicationId));
  const ids = new Set<string>();
  for (const r of rows) {
    if (r.publicationId) ids.add(r.publicationId);
  }
  return ids;
}

// Mutations. Repo returns the post-trigger Drizzle row; consumer maps via
// `publicationToApi`. Triggers (e.g. `trg_publications_decided_at_sync`)
// fire inside Postgres, so .returning() sees the synchronised row.

export interface UpdateDecisionSet {
  decision: Decision;
  decidedBy: string | null;
  decisionRationale: string | null;
  snoozeUntil: string | null;
  decidedInSession: string | null;
}

async function updateDecision(
  pubId: string,
  set: UpdateDecisionSet,
): Promise<PublicationRow | undefined> {
  const [row] = await db
    .update(publications)
    .set(set)
    .where(eq(publications.id, pubId))
    .returning();
  return row;
}

async function readFlagNotes(pubId: string): Promise<FlagNote[] | undefined> {
  const [row] = await db
    .select({ flagNotes: publications.flagNotes })
    .from(publications)
    .where(eq(publications.id, pubId))
    .limit(1);
  if (!row) return undefined;
  return (row.flagNotes as FlagNote[] | null) ?? [];
}

async function updateFlagNotes(
  pubId: string,
  notes: FlagNote[],
): Promise<void> {
  await db
    .update(publications)
    .set({ flagNotes: notes })
    .where(eq(publications.id, pubId));
}

async function deleteById(pubId: string): Promise<void> {
  await db.delete(publications).where(eq(publications.id, pubId));
}

export const publicationsRepo = {
  findByIdDetail,
  findManyForList,
  findManyForQueue,
  countWhere,
  countByDecision,
  findIdsByOestat6,
  findIdsByHighlight,
  findIdsWithFlags,
  findIdsByOrgunit,
  findPressReleasedIds,
  updateDecision,
  readFlagNotes,
  updateFlagNotes,
  deleteById,
} as const;
