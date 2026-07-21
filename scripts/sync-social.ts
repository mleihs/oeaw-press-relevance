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

import { loadDbUrl, parseScriptArgs, confirmProd, redactedDatabaseUrl } from './lib/db.mjs';

const { target, flags } = parseScriptArgs();
const isProd = target === 'prod';

process.loadEnvFile('.env.local');
process.env.DATABASE_URL = loadDbUrl(target);

function num(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function main(): Promise<void> {
  await confirmProd({ isProd, flags, label: 'sync-social' });

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
  process.exit(1);
});
