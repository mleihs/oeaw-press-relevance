import {
  type Orgunit,
  type Person,
  type Project,
  type Publication,
  type PublicationType,
  type Decision,
  type FlagNote,
  DECISIONS,
} from '@/lib/shared/types';
import {
  orgunits as orgunitsTable,
  persons as personsTable,
  projects as projectsTable,
  publications as publicationsTable,
  publicationTypes as publicationTypesTable,
} from '@/lib/server/db';

// Explicit per-feature mappers from Drizzle camelCase rows to the snake_case
// + ISO-8601 wire DTOs documented in `lib/shared/types.ts`. A column rename
// on the publications table surfaces here as a tsc compile error — exactly
// the failure mode Plan §7.1 was designed for.
//
// Helper mappers for embedded relations (person, orgunit, project,
// publication_type) currently live alongside `publicationToApi` because the
// `/api/publications/[id]` detail wire shape reads them together and there
// are no `lib/server/{persons,projects,publication-types}/` feature folders
// yet. **`pressReleaseToApi` was already moved to
// `lib/server/press-releases/to-api.ts`** (its entity has a feature folder);
// the others follow the same path once their features grow. ADR 0003 is the
// per-feature toApi rule that governs this.

export function publicationToApi(
  row: typeof publicationsTable.$inferSelect,
): Publication {
  return {
    id: row.id,
    webdb_uid: row.webdbUid,
    csv_uid: row.csvUid,
    title: row.title,
    original_title: row.originalTitle,
    lead_author: row.leadAuthor,
    abstract: row.abstract,
    summary_de: row.summaryDe,
    summary_en: row.summaryEn,
    doi: row.doi,
    doi_link: row.doiLink,
    published_at: row.publishedAt,
    publication_type: row.publicationType,
    publication_type_id: row.publicationTypeId,
    open_access: row.openAccess ?? false,
    open_access_status: row.openAccessStatus,
    oa_type: row.oaType,
    url: row.url,
    website_link: row.websiteLink,
    download_link: row.downloadLink,
    citation: row.citation,
    citation_apa: row.citationApa,
    citation_de: row.citationDe,
    citation_en: row.citationEn,
    ris: row.ris,
    bibtex: row.bibtex,
    endnote: row.endnote,
    peer_reviewed: row.peerReviewed,
    popular_science: row.popularScience,
    archived: row.archived,
    webdb_tstamp: row.webdbTstamp
      ? new Date(row.webdbTstamp).toISOString()
      : null,
    webdb_crdate: row.webdbCrdate
      ? new Date(row.webdbCrdate).toISOString()
      : null,
    synced_at: row.syncedAt ? new Date(row.syncedAt).toISOString() : null,
    enrichment_status: (row.enrichmentStatus ??
      'pending') as Publication['enrichment_status'],
    enriched_abstract: row.enrichedAbstract,
    enriched_keywords: row.enrichedKeywords ?? null,
    enriched_journal: row.enrichedJournal,
    enriched_source: row.enrichedSource,
    full_text_snippet: row.fullTextSnippet,
    word_count: row.wordCount ?? 0,
    analysis_status: (row.analysisStatus ??
      'pending') as Publication['analysis_status'],
    press_score: row.pressScore,
    press_similarity: row.pressSimilarity,
    public_accessibility: row.publicAccessibility,
    societal_relevance: row.societalRelevance,
    novelty_factor: row.noveltyFactor,
    storytelling_potential: row.storytellingPotential,
    media_timeliness: row.mediaTimeliness,
    pitch_suggestion: row.pitchSuggestion,
    target_audience: row.targetAudience,
    suggested_angle: row.suggestedAngle,
    reasoning: row.reasoning,
    haiku: row.haiku,
    llm_model: row.llmModel,
    analysis_cost: row.analysisCost,
    import_batch: row.importBatch,
    // createdAt/updatedAt are `defaultNow()` in the schema; never NULL in
    // practice but Drizzle types them optional. Non-null asserts match the
    // Publication DTO contract (required `string`).
    created_at: new Date(row.createdAt!).toISOString(),
    updated_at: new Date(row.updatedAt!).toISOString(),
    meistertask_task_id: row.meistertaskTaskId,
    meistertask_task_token: row.meistertaskTaskToken,
    decision: row.decision as Decision,
    decided_at: row.decidedAt ? new Date(row.decidedAt).toISOString() : null,
    decided_by: row.decidedBy,
    decision_rationale: row.decisionRationale,
    snooze_until: row.snoozeUntil,
    flag_notes: (row.flagNotes as FlagNote[]) ?? [],
    decided_in_session: row.decidedInSession,
  };
}

export function publicationTypeToApi(
  row: typeof publicationTypesTable.$inferSelect,
): PublicationType {
  return {
    id: row.id,
    webdb_uid: row.webdbUid,
    name_de: row.nameDe,
    name_en: row.nameEn,
  };
}

export function personToApi(row: typeof personsTable.$inferSelect): Person {
  return {
    id: row.id,
    webdb_uid: row.webdbUid,
    firstname: row.firstname,
    lastname: row.lastname,
    degree_before: row.degreeBefore,
    degree_after: row.degreeAfter,
    email: row.email,
    orcid: row.orcid,
    oestat3_name_de: row.oestat3NameDe,
    oestat3_name_en: row.oestat3NameEn,
    research_fields: row.researchFields,
    external: row.external,
    deceased: row.deceased,
    portrait: row.portrait,
    slug: row.slug,
  };
}

export function orgunitToApi(
  row: typeof orgunitsTable.$inferSelect,
): Orgunit {
  return {
    id: row.id,
    webdb_uid: row.webdbUid,
    name_de: row.nameDe,
    name_en: row.nameEn,
    akronym_de: row.akronymDe,
    akronym_en: row.akronymEn,
    url_de: row.urlDe,
    url_en: row.urlEn,
    parent_id: row.parentId,
  };
}

export function projectToApi(
  row: typeof projectsTable.$inferSelect,
): Project {
  return {
    id: row.id,
    webdb_uid: row.webdbUid,
    title_de: row.titleDe,
    title_en: row.titleEn,
    summary_de: row.summaryDe,
    summary_en: row.summaryEn,
    thematic_focus_de: row.thematicFocusDe,
    thematic_focus_en: row.thematicFocusEn,
    funding_type_de: row.fundingTypeDe,
    funding_type_en: row.fundingTypeEn,
    starts_on: row.startsOn,
    ends_on: row.endsOn,
    cancelled: row.cancelled,
    url_de: row.urlDe,
    url_en: row.urlEn,
  };
}

// --- Lightweight publication embed -----------------------------------------
//
// Subset of `Publication` that gets embedded on a press-release row when the
// list wrapper is called with `withPub: true`. Lives here (publications
// feature) rather than in `press-releases/list.ts` because its shape and the
// camelCase→snake_case mapping are publications-domain concerns.

/**
 * Wire shape of the lightweight publication subset embedded by
 * `listPressReleases({ withPub: true })`. Snake-case keys to match the rest
 * of the wire-shape convention (Plan §7.1, ADR 0003).
 */
export interface PubLite {
  id: string;
  title: string;
  original_title: string | null;
  lead_author: string | null;
  citation: string | null;
  press_score: number | null;
  press_similarity: number | null;
  decision: Decision;
  published_at: string | null;
}

/**
 * Column selector for `db.query.X.findMany({ with: { publication: { columns: PUB_LITE_COLUMNS } } })`.
 * Single source of truth for the columns that make up `PubLite` — `publicationToApiLite`
 * derives its input shape from this object, so adding/removing a column here
 * surfaces in the mapper at compile time.
 */
export const PUB_LITE_COLUMNS = {
  id: true,
  title: true,
  originalTitle: true,
  leadAuthor: true,
  citation: true,
  pressScore: true,
  pressSimilarity: true,
  decision: true,
  publishedAt: true,
} as const;

type PubLiteRow = Pick<
  typeof publicationsTable.$inferSelect,
  keyof typeof PUB_LITE_COLUMNS
>;

function isDecision(v: unknown): v is Decision {
  return typeof v === 'string' && (DECISIONS as readonly string[]).includes(v);
}

/**
 * Maps a Drizzle row from the `PUB_LITE_COLUMNS` selection (camelCase keys)
 * to the snake-case `PubLite` wire shape. `decision` is narrowed defensively
 * via `isDecision` — DB constraints already guarantee valid values, but
 * legacy junk on older migrations falls back to `'undecided'`.
 */
export function publicationToApiLite(row: PubLiteRow): PubLite {
  return {
    id: row.id,
    title: row.title,
    original_title: row.originalTitle,
    lead_author: row.leadAuthor,
    citation: row.citation,
    press_score: row.pressScore,
    press_similarity: row.pressSimilarity,
    decision: isDecision(row.decision) ? row.decision : 'undecided',
    published_at: row.publishedAt,
  };
}

