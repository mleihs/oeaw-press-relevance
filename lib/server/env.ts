import { z } from 'zod';

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

  // Gate (middleware.ts + app/api/auth/gate). Required: leaving either
  // unset puts the middleware into pass-through mode, which is the
  // identical failure shape as the 2026-05-14 incident scaled up to
  // an anonymous-API outage. Both Vercel projects already have these
  // set as of 2026-05-15 audit.
  GATE_TOKEN: z.string().min(1),
  GATE_PASSWORD: z.string().min(1),

  // LLM. `lib/server/llm.ts` accepts a per-request `x-openrouter-key`
  // header as a fallback, so the env var is fully optional. Model
  // selection falls back to a built-in default after env+header.
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  LLM_DEFAULT_MODEL: z.string().min(1).default('anthropic/claude-sonnet-4'),

  // MeisterTask one-way push (lib/server/meistertask/push.ts). Token +
  // section form a required pair (push has no fallback target); label
  // IDs are a both-or-none pair per the .env.example contract. Both
  // cross-field constraints live in `runConditionalChecks`.
  MEISTERTASK_API_TOKEN: z.string().min(1).optional(),
  MEISTERTASK_DEFAULT_SECTION_ID: z.string().min(1).optional(),
  MEISTERTASK_HIGH_LABEL_ID: z.string().min(1).optional(),
  MEISTERTASK_MID_LABEL_ID: z.string().min(1).optional(),

  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
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
