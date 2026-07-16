import { z } from 'zod';
import { DECISIONS } from './types';

/**
 * Validates raw HTTP payloads at the API boundary. Schemas live here so the
 * client (forms, optimistic-update helpers) and the server (route handlers,
 * business-logic functions) can agree on the wire format without duplicating
 * the validator. Schemas validate *shape only* — semantic rules (e.g. "reset
 * to undecided wipes attribution") belong in lib/server/<feature>/.
 */
export const decisionPayloadSchema = z.object({
  decision: z.enum(DECISIONS),
  decided_by: z.string().nullish(),
  decision_rationale: z.string().nullish(),
  snooze_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'snooze_until must be YYYY-MM-DD')
    .nullish(),
  decided_in_session: z.string().nullish(),
});

export type DecisionPayload = z.infer<typeof decisionPayloadSchema>;

export const meistertaskPushPayloadSchema = z.object({
  publication_id: z.string().min(1, 'publication_id required'),
});

export type MeistertaskPushPayload = z.infer<typeof meistertaskPushPayloadSchema>;

export const sessionFinishPayloadSchema = z.object({
  attendees: z.array(z.string()).nullish(),
  facilitator: z.string().nullish(),
  notes: z.string().nullish(),
});

export type SessionFinishPayload = z.infer<typeof sessionFinishPayloadSchema>;

export const flagSetPayloadSchema = z.object({
  by: z.string().nullish(),
  note: z.string().nullish(),
});

export type FlagSetPayload = z.infer<typeof flagSetPayloadSchema>;

export const flagDeletePayloadSchema = z.object({
  by: z.string().nullish(),
});

export type FlagDeletePayload = z.infer<typeof flagDeletePayloadSchema>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const enrichmentBatchPayloadSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(20),
  include_partial: z.boolean().default(false),
  include_no_doi: z.boolean().default(false),
  ids: z.array(z.string().regex(uuidPattern, 'ids must be UUIDs')).optional(),
});

export type EnrichmentBatchPayload = z.infer<typeof enrichmentBatchPayloadSchema>;

// Vereinheitlichtes Payload fürs Relevanz-Scoring — für Publikationen UND
// Events (der „Bewerten"-Fallback nutzt für beide dasselbe Modal + Endpunkt-
// Kontrakt). Die Kandidaten kommen aus den kanonischen Views
// (publication_scoring_candidates / event_scoring_candidates), daher gibt es
// KEINE enrichment-/word-count-Filter mehr: `limit` begrenzt die Batch-Menge,
// `forceReanalyze` re-bewertet auch bereits Bewertetes (überschreibt), sonst nur
// offene Kandidaten aus der View.
export const scoringBatchPayloadSchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  batchSize: z.coerce.number().int().min(1).max(5).default(3),
  forceReanalyze: z.boolean().default(false),
});
export type ScoringBatchPayload = z.infer<typeof scoringBatchPayloadSchema>;

// ---------------------------------------------------------------------------
// Social-media monitoring (/social).
// ---------------------------------------------------------------------------

export const socialRefreshPayloadSchema = z.object({
  // Force bypasses the SOCIAL_MIN_REFRESH_MINUTES throttle.
  force: z.boolean().default(false),
});

export type SocialRefreshPayload = z.infer<typeof socialRefreshPayloadSchema>;

// lookback_days: 1–365, or null to inherit the global default.
const lookbackDays = z.coerce.number().int().min(1).max(365).nullable();

export const socialChannelCreateSchema = z.object({
  // Accepts a bare handle ("quarks.de") or a full profile URL — the server
  // normalizes both via parseInstagramHandle().
  handle: z.string().trim().min(1, 'Handle oder Instagram-URL erforderlich'),
  display_name: z.string().trim().nullish(),
  lookback_days: lookbackDays.optional(),
});

export type SocialChannelCreate = z.infer<typeof socialChannelCreateSchema>;

export const socialChannelUpdateSchema = z.object({
  active: z.boolean().optional(),
  display_name: z.string().trim().nullish(),
  lookback_days: lookbackDays.optional(),
});

export type SocialChannelUpdate = z.infer<typeof socialChannelUpdateSchema>;

export const socialSettingsUpdateSchema = z.object({
  fresh_window_days: z.coerce.number().int().min(1).max(365).optional(),
  theme_window_days: z.coerce.number().int().min(1).max(365).optional(),
  // null clears retention (keep everything); a number sets the prune horizon.
  retention_days: z.coerce.number().int().min(1).max(3650).nullable().optional(),
});

export type SocialSettingsUpdate = z.infer<typeof socialSettingsUpdateSchema>;

// Event-score weights save. Raw, non-negative "relative importance" values
// (bounded so a fat-finger can't overflow); the server normalizes them to sum 1
// before storing. At least one must be > 0.
export const eventScoreWeightsUpdateSchema = z
  .object({
    public_appeal: z.coerce.number().min(0).max(1000),
    scientific_significance: z.coerce.number().min(0).max(1000),
    reach: z.coerce.number().min(0).max(1000),
    timeliness: z.coerce.number().min(0).max(1000),
    note: z.string().trim().max(120).optional(),
  })
  .refine(
    (d) => d.public_appeal + d.scientific_significance + d.reach + d.timeliness > 0,
    { message: 'Mindestens ein Gewicht muss größer als 0 sein.' },
  );

export type EventScoreWeightsUpdate = z.infer<typeof eventScoreWeightsUpdateSchema>;

// ===========================================================================
// API-edge query / param / payload schemas (Pass A, ADR 0018)
//
// Hand-written and zod-only so this file stays the boundaries kernel
// (shared -> shared). The one table-derived schema (idParamSchema) lives
// server-side in lib/server/schemas.ts. Every schema here is derived from
// the *actual current* route/client usage — defaults, tri-state-by-absence
// booleans and uncapped values are preserved on purpose so valid traffic
// behaves exactly as before; only genuinely malformed input that used to
// reach a `NaN` offset / `NaN::int` cast (a 500) now gets a clean 400.
// ===========================================================================

/** `?since=YYYY-MM-DD`, required. Shape-only (no calendar check) to mirror
 *  the prior hand-rolled regex in researchers/* and persons/[id]. */
const sinceField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'since must be YYYY-MM-DD');

/** Tri-state-by-absence: anything but the literal string 'false' is true;
 *  absent is true. Exactly the prior `searchParams.get(x) !== 'false'`. */
const notFalseBool = z.preprocess((v) => v !== 'false', z.boolean());

/** Opt-in flag: only the literal string 'true' is true; absent is false.
 *  Exactly the prior `searchParams.get(x) === 'true'`. */
const isTrueBool = z.preprocess((v) => v === 'true', z.boolean());

/** Positive-int query param (page/pageSize/limit). Empty string and
 *  absence both fall back to `def` (mirrors `Number(get(x) || 'def')`);
 *  non-numeric / <= 0 become a deterministic 400 instead of a NaN page
 *  offset or a `${NaN}::int` cast 500. */
const intParam = (def: number) =>
  z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().int().positive().default(def),
  );

/** Numeric query param (min_value): same empty/absent → `def`, bad → 400.
 *  Not `.int()` — min_value is a `::numeric` and is fractional for some
 *  metrics (e.g. sum_score → 0.5). */
const numParam = (def: number) =>
  z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    z.coerce.number().default(def),
  );

/** `?x=a,b,c` → ['a','b','c']; absent / empty / all-blank → null. Single
 *  home for the CSV-list param parse that was copy-pasted as a local
 *  `csv()` in both researchers routes (the exact duplication ADR 0018
 *  set out to remove). */
const csvParam = z
  .string()
  .optional()
  .transform((s) => {
    if (!s) return null;
    const arr = s.split(',').map((x) => x.trim()).filter(Boolean);
    return arr.length ? arr : null;
  });

/** POST /api/auth/gate. `password` is required (min 1): a missing/empty
 *  password is a client bug or probe and now gets a deterministic 400
 *  rather than falling through to the 401 "Invalid password" path. The
 *  rate-limiter still runs first and the timing-safe compare is unchanged,
 *  so this leaks nothing (single shared secret, no user enumeration). */
export const gatePayloadSchema = z.object({
  password: z.string().min(1, 'Password required'),
});
export type GatePayload = z.infer<typeof gatePayloadSchema>;

/** POST /api/auth/login (Supabase-Auth-Identität hinter dem Gate). */
export const loginPayloadSchema = z.object({
  email: z.email('Bitte eine gültige E-Mail-Adresse angeben.'),
  password: z.string().min(1, 'Passwort erforderlich.'),
});
export type LoginPayload = z.infer<typeof loginPayloadSchema>;

export const userRoleSchema = z.enum(['admin', 'member']);

/** POST /api/auth/users — Nutzer anlegen (admin-only). Das Initialpasswort
 *  generiert das Formular client-seitig (generatePassword) und der Admin
 *  gibt es persönlich weiter; min 10 hält Tippfehler-Passwörter fern. */
export const userCreatePayloadSchema = z.object({
  email: z.email('Bitte eine gültige E-Mail-Adresse angeben.'),
  password: z.string().min(10, 'Initialpasswort braucht mindestens 10 Zeichen.'),
  displayName: z.string().trim().min(1, 'Name erforderlich.').max(120),
  role: userRoleSchema,
});
export type UserCreatePayload = z.infer<typeof userCreatePayloadSchema>;

/** PATCH /api/auth/users/[id] — Rolle ändern und/oder (de)aktivieren. */
export const userPatchPayloadSchema = z
  .object({
    role: userRoleSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.disabled !== undefined, {
    message: 'Leerer Patch: role oder disabled angeben.',
  });
export type UserPatchPayload = z.infer<typeof userPatchPayloadSchema>;

/** GET /api/persons/[id] query. (`id` itself is validated by the
 *  server-side idParamSchema.) */
export const personDetailQuerySchema = z.object({
  since: sinceField,
  exclude_ita: notFalseBool,
  exclude_outreach: notFalseBool,
});
export type PersonDetailQuery = z.infer<typeof personDetailQuerySchema>;

const LEADERBOARD_METRICS = [
  'count_high',
  'sum_score',
  'avg_score',
  'weighted_avg',
  'pubs_total',
] as const;
const AUTHORSHIP_SCOPES = ['all', 'lead'] as const;

/**
 * GET /api/researchers/{distribution,top}. Both routes parsed an
 * identical block (the copy-pasted `csv()` + `ALLOWED_*` + since-regex);
 * this is the single source. `limitDefault` is the only per-route
 * difference (distribution 500, top 50); the hard cap (1000 / 200) stays
 * a `Math.min` in the route, faithful to the prior clamp-don't-reject
 * behaviour. `oestat3_ids` is split here (`csvParam`) so the route no
 * longer carries a duplicated `csv()`.
 */
export const researchersLeaderboardQuerySchema = (limitDefault: number) =>
  z.object({
    since: sinceField,
    metric: z.enum(LEADERBOARD_METRICS, { message: 'invalid metric' })
      .default('count_high'),
    authorship_scope: z
      .enum(AUTHORSHIP_SCOPES, { message: 'invalid authorship_scope' })
      .default('all'),
    oestat3_ids: csvParam,
    include_external: isTrueBool,
    include_deceased: isTrueBool,
    member_only: isTrueBool,
    min_value: numParam(1),
    limit: intParam(limitDefault),
    exclude_ita: notFalseBool,
    exclude_outreach: notFalseBool,
  });
export type ResearchersLeaderboardQuery = z.infer<
  ReturnType<typeof researchersLeaderboardQuerySchema>
>;

/** GET /api/publications/[id]/similar-pressed query. `limit` is clamped to
 *  1..20 by the route (Math.min/max) as before — the schema only blocks a
 *  non-numeric `?limit`. */
export const similarPressedQuerySchema = z.object({
  limit: intParam(3),
  model: z.string().min(1).default('allenai/specter2_base'),
});
export type SimilarPressedQuery = z.infer<typeof similarPressedQuerySchema>;

/**
 * GET /api/publications list query. Deliberately permissive: the rich
 * nuqs-driven filter UI sends ~35 params and `listPublications` already
 * parses them defensively (string defaults, sort whitelist, capped+escaped
 * search). Only `page`/`pageSize` had an undefined-behaviour vector
 * (`parseInt('abc')` → NaN offset → 500), so only those are enforced;
 * everything else passes through (`.loose()`) untouched so no valid filter
 * combination can regress to a surprise 400.
 */
export const publicationsListQuerySchema = z
  .object({
    page: intParam(1),
    pageSize: intParam(20),
  })
  .loose();

/** GET /api/export/{csv,json}. `analyzed` defaults true; only the literal
 *  'false' opts into the full (unfiltered) export, exactly as before. */
export const analyzedExportQuerySchema = z
  .object({ analyzed: notFalseBool })
  .loose();
export type AnalyzedExportQuery = z.infer<typeof analyzedExportQuerySchema>;

/** GET /api/publications/stats. */
export const publicationsStatsQuerySchema = z
  .object({ default_eligible: isTrueBool })
  .loose();

// Deliberately NO schema for GET /api/press-releases and
// GET /api/review/queue: their input is fully narrowed downstream
// (listPressReleases decodes the tri-state `orphans` via exact
// `=== 'true' / 'false'`; buildReviewQueue guards `decision` with
// isDecision and treats only `sort === 'combined'` specially). A
// permissive `.loose()` schema there could not reject anything and its
// result would be discarded — that is validation theater, not
// validation. Documented verified-no-op, same as
// /api/press-releases/promote-status (verified-no-op discipline).
