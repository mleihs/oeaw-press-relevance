#!/usr/bin/env tsx
// CLI wrapper around lib/server/events/sync.ts → syncUpcomingEvents().
//
// Architecture: TYPO3 is the single source of truth for upcoming events.
// The /api/events/sync HTTP endpoint cannot run on Vercel because the
// TYPO3 MySQL container lives on the developer machine; this CLI is the
// canonical write path for both targets (local Postgres mirror and prod
// Supabase). syncUpcomingEvents() takes a SyncOptions parameter, so the
// HTTP route and this script feed it from different sources without the
// CLI dragging the app's full env-validator (GATE_TOKEN, SERVICE_ROLE…)
// into a context where it has nothing to validate.
//
// The UPSERT in sync.ts only updates TYPO3-sourced columns, so re-runs
// (local or prod) never overwrite maintainer-curated state (decision,
// decided_at, flag_notes, created_at) — that's per-environment by
// construction.
//
// Usage:
//   npm run sync-events                         # → local Supabase (.env.local)
//   npm run sync-events -- --target=prod        # → prod Supabase (asks y/N)
//   npm run sync-events -- --target=prod --yes  # CI / unattended
//
// Prod credentials live in ~/.config/oeaw-press-release/prod-credentials —
// loaded via scripts/lib/db.mjs (shared with backfill-venue, enrich-orphans,
// recompute-press-scores). The file is gitignored by virtue of being
// outside the repo.

import { loadDbUrl, parseScriptArgs, confirmProd, redactedDatabaseUrl } from './lib/db.mjs';
import { initScriptSentry, captureScriptError, flushAndExit } from './lib/sentry.mjs';

const { target, flags } = parseScriptArgs();
const isProd = target === 'prod';

// 1) Dev-machine baseline: WEBDB_MYSQL_*, OPENROUTER_API_KEY etc. live in
//    .env.local. process.loadEnvFile preserves any value already set in
//    process.env (shell vars win) — that matches the rest of the project.
process.loadEnvFile('.env.local');
initScriptSentry('sync-events');

// 2) Target switch: for prod we hard-override DATABASE_URL with the value
//    from the prod-credentials file, beating any shell-level shadow.
//    Without this override, a developer's shell DATABASE_URL=localhost
//    would silently make `--target=prod` write to local — a foot-gun.
process.env.DATABASE_URL = loadDbUrl(target);

async function main(): Promise<void> {
  await confirmProd({ isProd, flags, label: 'sync-events' });

  // Dynamic import: lib/server/db (Drizzle) reads DATABASE_URL at module
  // load, so it must be loaded AFTER the override above.
  const { syncUpcomingEvents } = await import('@/lib/server/events/sync');

  console.log(
    `[sync-events] target=${target} db=${redactedDatabaseUrl()}`,
  );

  const t0 = Date.now();
  const result = await syncUpcomingEvents({
    mysqlHost: process.env.WEBDB_MYSQL_HOST,
    // The LLM fallback path still reaches into getEnv() inside
    // llm-extract-location.ts; gating it off here keeps the CLI free of
    // the app env-validator. Re-enable once that module also takes
    // explicit options.
    llmFallbackEnabled: false,
  });
  console.log(`[sync-events] done in ${Date.now() - t0}ms:`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err: unknown) => {
  console.error('[sync-events] failed:', err);
  captureScriptError(err);
  void flushAndExit(1);
});
