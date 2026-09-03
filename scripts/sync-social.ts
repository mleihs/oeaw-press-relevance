#!/usr/bin/env tsx
// CLI wrapper around lib/server/social/refresh.ts → runSocialRefresh().
//
// Same shape as scripts/sync-events.ts: load .env.local, switch DATABASE_URL
// by --target, then dynamic-import the pipeline AFTER the override (Drizzle
// reads DATABASE_URL at module load). Lets a cron job refresh the social
// monitor headlessly on either target without dragging in the app's env
// validator — Apify/OpenRouter config is read from process.env here.
//
// Usage:
//   npm run sync-social                          # → local Supabase (.env.local)
//   npm run sync-social -- --force               # bypass the refresh throttle
//   npm run sync-social -- --target=prod --yes   # CI / unattended → prod

// Gemeinsame Präambel: Flags → .env.local → Sentry → DATABASE_URL-Override.
// (Sentry ist neu ggü. der alten Kopie — ohne SENTRY_DSN inert.)
import {
  bootstrapScript, redactedDatabaseUrl, captureScriptError, flushAndExit,
} from './lib/bootstrap';

const { target, flags, confirmProd } = bootstrapScript('sync-social');

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function main(): Promise<void> {
  await confirmProd('sync-social');

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[sync-social] OPENROUTER_API_KEY fehlt (in .env.local setzen).');
    process.exit(1);
  }
  const apifyToken = process.env.APIFY_TOKEN;
  if (!apifyToken) {
    console.error('[sync-social] APIFY_TOKEN fehlt (in .env.local setzen).');
    process.exit(1);
  }

  // Dynamic import AFTER the DATABASE_URL override (Drizzle reads it at load).
  const { runSocialRefresh } = await import('@/lib/server/social/refresh');

  console.log(`[sync-social] target=${target} db=${redactedDatabaseUrl()}`);

  const result = await runSocialRefresh({
    apifyToken,
    actor: process.env.APIFY_INSTAGRAM_ACTOR || 'apify~instagram-scraper',
    resultsLimit: num(process.env.SOCIAL_RESULTS_LIMIT, 12),
    apiKey,
    model:
      process.env.SOCIAL_LLM_MODEL ||
      process.env.LLM_DEFAULT_MODEL ||
      'deepseek/deepseek-chat',
    minRefreshMinutes: num(process.env.SOCIAL_MIN_REFRESH_MINUTES, 30),
    apifyCostPerResult: num(process.env.APIFY_COST_PER_RESULT, 0.0027),
    force: flags.includes('--force'),
    triggeredBy: 'cli',
    emit: (type, data) => console.log(`[sync-social] ${type}`, JSON.stringify(data)),
  });

  console.log('[sync-social] done:');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err: unknown) => {
  console.error('[sync-social] failed:', err);
  captureScriptError(err);
  void flushAndExit(1);
});
