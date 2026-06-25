#!/usr/bin/env tsx
// One-shot backfill: download every already-fetched social post's image into
// the private `social-images` Supabase Storage bucket and stamp `image_path`,
// then GC orphaned objects. Idempotent — re-running only stores what's still
// missing (e.g. re-tries previously unreachable hosts) and removes orphans.
//
// Reuses the app pipeline (lib/server/social/images.ts), so it needs BOTH the
// target's Postgres URL AND its Supabase Storage credentials. For --target=prod
// those come from ~/.config/oeaw-press-release/prod-credentials; for local they
// come from .env.local.
//
// Usage:
//   npm run backfill-social-images -- --target=local
//   npm run backfill-social-images -- --target=prod

import { readFileSync } from 'node:fs';
import { loadDbUrl, parseScriptArgs } from './lib/db.mjs';

const { target } = parseScriptArgs();
process.loadEnvFile('.env.local');
process.env.DATABASE_URL = loadDbUrl(target);

if (target === 'prod') {
  // Point the Supabase Storage client at the PROD project (otherwise we'd
  // write prod posts' images into the local bucket).
  const cred = readFileSync(
    `${process.env.HOME}/.config/oeaw-press-release/prod-credentials`,
    'utf-8',
  );
  const pick = (k: string): string => {
    const m = cred.match(new RegExp(`^${k}=(.+)$`, 'm'));
    if (!m) throw new Error(`${k} not found in prod-credentials`);
    return m[1].trim();
  };
  process.env.SUPABASE_URL = pick('PROD_SUPABASE_URL');
  process.env.SUPABASE_SERVICE_ROLE_KEY = pick('PROD_SUPABASE_SECRET_KEY');
}

async function main(): Promise<void> {
  const { persistAndReconcilePostImages } = await import('@/lib/server/social/images');
  const res = await persistAndReconcilePostImages();
  console.log(
    `[backfill-social-images] target=${target} stored=${res.stored} ` +
      `failed=${res.failed} (unreachable/expired host) removed=${res.removed} (orphans)`,
  );
}

main().catch((err: unknown) => {
  console.error('[backfill-social-images] failed:', err);
  process.exit(1);
});
