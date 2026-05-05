import { request } from '@playwright/test';
import { readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

// Logs in once via the gate API and stashes the cookie in storageState.json.
// Subsequent test workers reuse this state — no per-test login round-trip.
//
// We parse .env.local directly because globalSetup runs as a plain Node
// script outside Next.js's automatic env loading.

const STATE_PATH = 'e2e/.auth/state.json';

function readEnvVar(file: string, key: string): string | null {
  try {
    const content = readFileSync(file, 'utf-8');
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match ? match[1].trim().replace(/^["']|["']$/g, '') : null;
  } catch {
    return null;
  }
}

export default async function globalSetup() {
  const gatePassword =
    process.env.GATE_PASSWORD ?? readEnvVar('.env.local', 'GATE_PASSWORD');

  // Without GATE_PASSWORD configured, the gate is in dev-passthrough mode and
  // every request lands without a cookie — no setup needed in that branch.
  if (!gatePassword) {
    console.log('[playwright] no GATE_PASSWORD found — skipping login');
    return;
  }

  const ctx = await request.newContext({ baseURL: 'http://localhost:3000' });
  const res = await ctx.post('/api/auth/gate', {
    data: { password: gatePassword },
  });
  if (!res.ok()) {
    throw new Error(`Gate login failed: ${res.status()} ${await res.text()}`);
  }

  mkdirSync(dirname(STATE_PATH), { recursive: true });
  await ctx.storageState({ path: STATE_PATH });
  await ctx.dispose();
}
