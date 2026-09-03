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

// Gemeinsame Präambel (scripts/lib/bootstrap.ts): Flags parsen, .env.local
// laden (WEBDB_MYSQL_*, OPENROUTER_API_KEY …; shell vars win), Sentry
// initialisieren, DATABASE_URL hart auf das Ziel setzen (beats any
// shell-level shadow — ohne den Override würde ein DATABASE_URL=localhost
// aus der Shell `--target=prod` still auf local schreiben lassen).
import {
  bootstrapScript, redactedDatabaseUrl, captureScriptError, flushAndExit,
} from './lib/bootstrap';

const { target, confirmProd } = bootstrapScript('sync-events');

async function main(): Promise<void> {
  await confirmProd('sync-events');

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
