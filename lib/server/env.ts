import { z } from 'zod';
import { DEFAULT_LLM_MODEL } from '@/lib/shared/constants';

/**
 * Boot-time environment validation. Phase 3 left us with a 30-min debug
 * loop because DATABASE_URL was missing and Drizzle failed with a cryptic
 * `Failed query: ...` stack — by which point the trail was cold. This
 * module fronts that pain: a zod schema enumerates every env var the app
 * reads, conditional pairs (Supabase URL/key, Gate token/password,
 * MeisterTask token/section) are checked together, and `validateEnv()`
 * aggregates every issue into one boot-time exit message.
 *
 * Scope:
 *   - App-Code only (lib/server, app/, middleware). Script-side env vars
 *     (MYSQL_*, PG_DATABASE_URL, GATE_COOKIE, BATCH_SIZE) live in their
 *     own `scripts/*.mjs` Lifecycles and are not validated here.
 *   - `validateEnv()` is the imperative boot-time entry-point (called by
 *     `instrumentation.ts`); `getEnv()` memoizes the result for any
 *     future call-site that wants the typed object.
 *   - Existing `process.env.X` reads across the codebase are NOT migrated
 *     — the value of this module is the clear boot-time fail-fast, not a
 *     forced refactor.
 */

const Schema = z.object({
  // Postgres connection URL. Load-bearing for every Drizzle route since
  // Phase 3 (commits a50c2a7+). Empty string is treated as missing via
  // the upstream normalize step (see parseEnv).
  DATABASE_URL: z.string().min(1),

  // Supabase URL + anon key. Two pairs because `lib/server/db/supabase.ts`
  // accepts NEXT_PUBLIC_* as a legacy fallback to avoid breaking older
  // deployments. The "at least one of each pair" check runs in
  // `runConditionalChecks` below — Zod 4 short-circuits `superRefine`
  // when prior field validation fails, so cross-field checks have to
  // live outside the schema to always fire (so all issues surface in
  // one boot-fail cycle, not piecemeal across re-boots).
  SUPABASE_URL: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1).optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),

  // Service-role key — bypasses RLS. Required by mutating routes
  // (CSV import, analysis batch, enrichment batch); validateEnv flags
  // it as required because the app cannot run those flows without it.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Gate (proxy.ts + app/api/auth/gate). Required: leaving either
  // unset puts the proxy into pass-through mode, which is the
  // identical failure shape as the 2026-05-14 incident scaled up to
  // an anonymous-API outage. Both Vercel projects already have these
  // set as of 2026-05-15 audit.
  GATE_TOKEN: z.string().min(1),
  GATE_PASSWORD: z.string().min(1),

  // LLM. `lib/server/llm.ts` accepts a per-request `x-openrouter-key`
  // header as a fallback, so the env var is fully optional. Model
  // selection falls back to a built-in default after env+header.
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  LLM_DEFAULT_MODEL: z.string().min(1).default(DEFAULT_LLM_MODEL),

  // MeisterTask one-way push (lib/server/meistertask/push.ts). Token +
  // section form a required pair (push has no fallback target); label
  // IDs are a both-or-none pair per the .env.example contract. Both
  // cross-field constraints live in `runConditionalChecks`.
  MEISTERTASK_API_TOKEN: z.string().min(1).optional(),
  MEISTERTASK_DEFAULT_SECTION_ID: z.string().min(1).optional(),
  MEISTERTASK_HIGH_LABEL_ID: z.string().min(1).optional(),
  MEISTERTASK_MID_LABEL_ID: z.string().min(1).optional(),

  // Unbeaufsichtigter Ingest-Cron (POST /api/ingest/run). Optional/fail-safe:
  // ist das Secret NICHT gesetzt, antwortet die Route mit 503 (Feature aus) —
  // die App bootet ohne. Ist es gesetzt, MUSS es lang genug sein (min. 32
  // Zeichen; `openssl rand -hex 32`), sonst bricht der Boot mit klarer Meldung.
  INGEST_CRON_SECRET: z.string().min(32, 'INGEST_CRON_SECRET muss ≥ 32 Zeichen haben (openssl rand -hex 32)').optional(),

  // Obergrenze für das automatische Enrichment je Nacht-Ingest-Lauf (Vorstufe
  // zum Bewerten). Bounded, damit ein großer Rückstau die Route nicht stundenlang
  // belegt; der Rest drainiert über Folgenächte. Default 200 (im Runner).
  INGEST_ENRICH_LIMIT: z.coerce.number().int().positive().optional(),

  // Cloudflare-Origin-Pin für die OeAW-JSON-Exporte (lib/server/ingest/
  // fetch-export.ts). Optional: leer → normaler DNS (läuft lokal ins CF-
  // Challenge). Auf dem VPS die Origin-IP von voxy.arz.oeaw.ac.at setzen, dann
  // löst der Fetch www.oeaw.ac.at auf diese IP auf (SNI/Host bleiben, TLS
  // validiert weiter) und umgeht den CF-Proxy sauber.
  OEAW_EXPORT_ORIGIN_IP: z.string().min(1).optional(),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Optional override for the allow-list used by assertAllowedOrigin
  // (comma-separated). Defaults to the two Vercel project URLs +
  // localhost dev — set this in env to support preview deploys or a
  // custom domain.
  ALLOWED_ORIGINS: z.string().optional(),

  // WEBDB MySQL — read by the /api/events/sync route to pull upcoming
  // TYPO3 events into the local Postgres mirror. Optional as a group:
  // if HOST is unset the sync endpoint refuses with a clear message and
  // /events still serves the last mirrored data. If HOST is set, the
  // conditional check below requires USER + DATABASE too.
  WEBDB_MYSQL_HOST: z.string().min(1).optional(),
  WEBDB_MYSQL_PORT: z.coerce.number().int().positive().default(54499),
  WEBDB_MYSQL_USER: z.string().min(1).optional(),
  WEBDB_MYSQL_PASSWORD: z.string().optional(),
  WEBDB_MYSQL_DATABASE: z.string().min(1).optional(),

  // Phase-2 LLM fallback for the events location extractor. Default off;
  // when enabled, the events sync sends the ~12% events the cheerio
  // walker can't parse to an LLM via OpenRouter (model defaults to
  // deepseek/deepseek-chat for cost; override via EVENTS_LLM_FALLBACK_MODEL).
  // Requires OPENROUTER_API_KEY.
  EVENTS_LLM_FALLBACK_ENABLED: z
    .union([z.literal('true'), z.literal('false'), z.literal('')])
    .default('false')
    .transform((v) => v === 'true'),
  EVENTS_LLM_FALLBACK_MODEL: z.string().min(1).optional(),

  // Social-media monitor (/social). All optional with defaults: the page and
  // settings stay usable without a token; only the refresh action needs
  // APIFY_TOKEN (the route returns a friendly 503 when it's unset).
  APIFY_TOKEN: z.string().min(1).optional(),
  APIFY_INSTAGRAM_ACTOR: z.string().min(1).default('apify~instagram-scraper'),
  // Apify "Instagram Scraper" is pay-per-event (~$0.0027/result, FREE tier).
  // Used to estimate per-refresh Apify cost for the in-app cost display.
  APIFY_COST_PER_RESULT: z.coerce.number().nonnegative().default(0.0027),
  // LLM model for post topic-extraction + theme overview. Falls back to the
  // request header / LLM_DEFAULT_MODEL when unset. DeepSeek V3 is the
  // price/performance pick for this German extraction task.
  SOCIAL_LLM_MODEL: z.string().min(1).default('deepseek/deepseek-chat'),
  SOCIAL_RESULTS_LIMIT: z.coerce.number().int().positive().default(12),
  // Refresh throttle: skip the Apify fetch if a successful refresh ran within
  // this many minutes (unless forced). Guards against token-burning re-clicks.
  SOCIAL_MIN_REFRESH_MINUTES: z.coerce.number().int().nonnegative().default(30),

  // S3-compatible object storage (lib/server/storage/s3.ts) — durable social
  // post images, and reusable for any future blob. Optional as a group: with
  // no S3_ENDPOINT the social-image store is simply disabled and the serving
  // route falls back to the live IG proxy. If S3_ENDPOINT is set, the
  // conditional check below requires key/secret/bucket. One bucket per project;
  // a shared MinIO can back several projects via separate buckets + keys.
  S3_ENDPOINT: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_FORCE_PATH_STYLE: z.string().optional(),

  // YouTube-Connector (Board-Smart-Objekte). Beide optional: ohne API-Key
  // fällt der Connector auf oEmbed zurück (Titel/Kanal/Thumbnail, keine
  // Dauer/Views); der Eigenkanal-Picker braucht Key + Kanal-ID.
  YOUTUBE_API_KEY: z.string().min(1).optional(),
  YOUTUBE_CHANNEL_ID: z.string().regex(/^UC[\w-]{22}$/, 'YouTube-Kanal-IDs beginnen mit UC').optional(),

  // Sentry error monitoring. All optional / fail-open: with no DSN the SDK
  // initialises disabled and every capture is a no-op, so local dev + CI need
  // no Sentry account. `SENTRY_DSN` is the server/edge DSN; the client reads
  // `NEXT_PUBLIC_SENTRY_DSN` (validated by Next's public-env inlining, not
  // here). `SENTRY_ENVIRONMENT` distinguishes the two deploy targets
  // (Vercel vs Coolify) in the Sentry UI; `SENTRY_RELEASE` falls back to the
  // platform Git-SHA. The `AUTH_TOKEN`/`ORG`/`PROJECT` trio is build-time only
  // (source-map upload via withSentryConfig) — kept here so a stray value
  // fails schema-shape, not so the app reads them at runtime.
  SENTRY_DSN: z.string().min(1).optional(),
  SENTRY_ENVIRONMENT: z.string().min(1).optional(),
  SENTRY_RELEASE: z.string().min(1).optional(),
  SENTRY_AUTH_TOKEN: z.string().min(1).optional(),
  SENTRY_ORG: z.string().min(1).optional(),
  SENTRY_PROJECT: z.string().min(1).optional(),
});

type Normalized = Record<string, string | undefined>;

function runConditionalChecks(env: Normalized, errors: string[]): void {
  if (!env.SUPABASE_URL && !env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push('SUPABASE_URL — required (or set NEXT_PUBLIC_SUPABASE_URL as the legacy fallback)');
  }
  if (!env.SUPABASE_ANON_KEY && !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_ANON_KEY — required (or set NEXT_PUBLIC_SUPABASE_ANON_KEY as the legacy fallback)');
  }
  if (env.MEISTERTASK_API_TOKEN && !env.MEISTERTASK_DEFAULT_SECTION_ID) {
    errors.push('MEISTERTASK_DEFAULT_SECTION_ID — required when MEISTERTASK_API_TOKEN is set; MeisterTask push has no fallback target section');
  }
  if (Boolean(env.MEISTERTASK_HIGH_LABEL_ID) !== Boolean(env.MEISTERTASK_MID_LABEL_ID)) {
    const missing = env.MEISTERTASK_HIGH_LABEL_ID ? 'MEISTERTASK_MID_LABEL_ID' : 'MEISTERTASK_HIGH_LABEL_ID';
    errors.push(`${missing} — set both MEISTERTASK_HIGH_LABEL_ID and MEISTERTASK_MID_LABEL_ID, or neither (per .env.example contract)`);
  }
  if (env.WEBDB_MYSQL_HOST) {
    if (!env.WEBDB_MYSQL_USER) {
      errors.push('WEBDB_MYSQL_USER — required when WEBDB_MYSQL_HOST is set (events/sync cannot connect without a user)');
    }
    if (!env.WEBDB_MYSQL_DATABASE) {
      errors.push('WEBDB_MYSQL_DATABASE — required when WEBDB_MYSQL_HOST is set');
    }
  }
  if (env.S3_ENDPOINT) {
    for (const k of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_BUCKET'] as const) {
      if (!env[k]) {
        errors.push(`${k} — required when S3_ENDPOINT is set (object storage for social images)`);
      }
    }
  }
}

export type Env = z.infer<typeof Schema>;

export type ParseResult =
  | { ok: true; env: Env }
  | { ok: false; errors: string[] };

function normalize(input: Record<string, string | undefined>): Normalized {
  const out: Normalized = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = v === '' ? undefined : v;
  }
  return out;
}

function formatIssue(issue: { path: PropertyKey[]; message: string }): string {
  const name = issue.path.length > 0
    ? issue.path.map((p) => String(p)).join('.')
    : '(top-level)';
  // Zod 4 surfaces missing required fields as "Invalid input: expected
  // string, received undefined" — friendlier framing for the user.
  const isMissing = /received undefined/i.test(issue.message);
  const msg = isMissing ? 'required (not set)' : issue.message;
  return `${name} — ${msg}`;
}

/**
 * Pure parser. Does not touch process.exit — the boot wrapper does that.
 * Empty strings are normalized to `undefined` first so `.env` lines like
 * `MEISTERTASK_API_TOKEN=` correctly disable optional features instead
 * of failing `.min(1)`. Schema issues and conditional-pair issues are
 * aggregated in one pass so users see every problem on a single boot
 * attempt.
 */
export function parseEnv(input: Record<string, string | undefined>): ParseResult {
  const normalized = normalize(input);
  const schemaResult = Schema.safeParse(normalized);
  const errors: string[] = schemaResult.success
    ? []
    : schemaResult.error.issues.map(formatIssue);
  runConditionalChecks(normalized, errors);
  if (errors.length > 0) return { ok: false, errors };
  // No errors → schema must have succeeded (conditional checks don't
  // produce a parsed object on their own).
  if (!schemaResult.success) {
    // Defensive: unreachable in practice, but keeps the type narrow.
    return { ok: false, errors: ['internal: schema failed but produced no issues'] };
  }
  return { ok: true, env: schemaResult.data };
}

/**
 * Boot-time entry-point. Aggregates every issue, prints them as a
 * numbered list, and exits with status 1. Called from `instrumentation.ts`
 * during Next.js server start.
 */
export function validateEnv(): Env {
  const result = parseEnv(process.env);
  if (!result.ok) {
    console.error('\n[env] Environment validation failed:\n');
    result.errors.forEach((line, i) => {
      console.error(`  ${i + 1}) ${line}`);
    });
    console.error('\nSee .env.example for the full list of supported variables.');
    console.error('Set values in .env.local (local dev) or deployment secrets (prod).\n');
    process.exit(1);
  }
  return result.env;
}

let cached: Env | undefined;

/**
 * Memoized accessor. First call validates against `process.env`; later
 * calls return the cached result. Idempotent across module-import cycles.
 */
export function getEnv(): Env {
  if (!cached) cached = validateEnv();
  return cached;
}
