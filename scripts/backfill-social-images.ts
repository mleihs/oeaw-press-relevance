#!/usr/bin/env tsx
// One-shot backfill: download every already-fetched social post's image into
// the S3 bucket and stamp `image_path`, then GC orphaned objects. Idempotent —
// re-running only stores what's still missing (e.g. re-tries previously
// unreachable hosts) and removes orphans.
//
// Reuses the app pipeline (lib/server/social/images.ts → lib/server/storage/s3).
// The S3 bucket is shared across DB targets (one bucket per project), so the S3
// credentials come from .env.local for BOTH targets; only DATABASE_URL switches.
//
// Usage:
//   npm run backfill-social-images -- --target=local
//   npm run backfill-social-images -- --target=prod
//
// Requires S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET in
// .env.local (the shared MinIO).

import { loadDbUrl, parseScriptArgs } from './lib/db.mjs';

const { target } = parseScriptArgs();
process.loadEnvFile('.env.local');
process.env.DATABASE_URL = loadDbUrl(target);

if (!process.env.S3_ENDPOINT) {
  console.error(
    '[backfill-social-images] S3 not configured. Set S3_ENDPOINT / S3_ACCESS_KEY_ID / ' +
      'S3_SECRET_ACCESS_KEY / S3_BUCKET in .env.local first.',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const { persistAndReconcilePostImages } = await import('@/lib/server/social/images');
  const res = await persistAndReconcilePostImages();
  console.log(
    `[backfill-social-images] target=${target} bucket=${process.env.S3_BUCKET} ` +
      `stored=${res.stored} failed=${res.failed} (unreachable/expired host) ` +
      `removed=${res.removed} (orphans)`,
  );
}

main().catch((err: unknown) => {
  console.error('[backfill-social-images] failed:', err);
  process.exit(1);
});
