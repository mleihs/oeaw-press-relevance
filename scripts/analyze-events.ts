#!/usr/bin/env tsx
// CLI wrapper around lib/server/events/analyze.ts → runEventsAnalysisBatch().
// Headless/cron path for event relevance scoring (the UI "Analysieren" button
// is the interactive equivalent). Unlike sync-events, this only needs
// OPENROUTER_API_KEY + DATABASE_URL — no TYPO3 MySQL — so it works against any
// target. The UPSERT-preserved analysis columns mean re-runs only touch
// 'pending' rows unless --force is passed.
//
// Usage:
//   npm run analyze-events                              # → local (.env.local)
//   npm run analyze-events -- --target=prod --yes       # → prod, unattended
//   npm run analyze-events -- --target=prod --yes --limit=200 --force

import { loadDbUrl, parseScriptArgs, confirmProd, redactedDatabaseUrl } from './lib/db.mjs';

const { target, flags } = parseScriptArgs();
const isProd = target === 'prod';

process.loadEnvFile('.env.local');
process.env.DATABASE_URL = loadDbUrl(target);

const limitFlag = flags.find((f) => /^--limit=\d+$/.test(f));
const limit = limitFlag ? parseInt(limitFlag.split('=')[1], 10) : 50;
const force = flags.includes('--force');

async function main(): Promise<void> {
  await confirmProd({ isProd, flags, label: 'analyze-events' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('[analyze-events] OPENROUTER_API_KEY not set.');
    process.exit(1);
  }
  const model = process.env.LLM_DEFAULT_MODEL || 'deepseek/deepseek-chat';

  // Dynamic import after the DATABASE_URL override (Drizzle reads it at load).
  const { fetchEventsForAnalysis, runEventsAnalysisBatch } = await import(
    '@/lib/server/events/analyze'
  );

  const events = await fetchEventsForAnalysis({ limit, batchSize: 3, forceReanalyze: force });
  console.log(
    `[analyze-events] target=${target} db=${redactedDatabaseUrl()} model=${model} events=${events.length}${force ? ' (force)' : ''}`,
  );
  if (events.length === 0) {
    console.log('[analyze-events] nothing to analyze.');
    return;
  }

  const t0 = Date.now();
  await runEventsAnalysisBatch({
    events,
    apiKey,
    model,
    batchSize: 3,
    abortSignal: new AbortController().signal,
    emit: (type, data) => {
      if (type === 'progress') {
        const d = data as { processed: number; total: number };
        process.stdout.write(`\r[analyze-events] ${d.processed}/${d.total} …   `);
      } else if (type === 'complete') {
        const d = data as { successful: number; failed: number; cost: number };
        console.log(
          `\n[analyze-events] done in ${Date.now() - t0}ms: ${d.successful} analysiert, ${d.failed} fehlgeschlagen, $${d.cost.toFixed(4)}`,
        );
      } else if (type === 'error') {
        console.error(`\n[analyze-events] error: ${(data as { message: string }).message}`);
      }
    },
  });
}

main().catch((err: unknown) => {
  console.error('[analyze-events] failed:', err);
  process.exit(1);
});
