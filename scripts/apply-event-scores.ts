#!/usr/bin/env tsx
// Applies manually-produced (in-chat) event relevance scores to the DB. Reads a
// JSON array of { id, public_appeal, scientific_significance, reach, timeliness,
// pitch_suggestion, suggested_angle, target_audience, reasoning } and writes
// each row via the same computeEventScore + column set as the LLM path, so the
// UI renders them identically. Provenance is tagged as in-chat (cost 0).
//
// Usage: npm run apply-event-scores -- --target=prod --yes --file=/tmp/scores.json

import { readFileSync } from 'node:fs';
import { loadDbUrl, parseScriptArgs } from './lib/db.mjs';

const { target, flags } = parseScriptArgs();
process.loadEnvFile('.env.local');
process.env.DATABASE_URL = loadDbUrl(target);

const fileFlag = flags.find((f) => f.startsWith('--file='));
const file = fileFlag ? fileFlag.split('=')[1] : '';
if (!file) {
  console.error('[apply-event-scores] --file=<scores.json> required');
  process.exit(1);
}

interface ScoredEvent {
  id: string;
  public_appeal: number;
  scientific_significance: number;
  reach: number;
  timeliness: number;
  pitch_suggestion?: string;
  suggested_angle?: string;
  target_audience?: string;
  reasoning?: string;
}

async function main(): Promise<void> {
  const rows: ScoredEvent[] = JSON.parse(readFileSync(file, 'utf8'));
  const { db, events } = await import('@/lib/server/db');
  const { eq, sql } = await import('drizzle-orm');
  const { computeEventScore } = await import('@/lib/shared/scoring');

  const clamp01 = (n: number) => Math.max(0, Math.min(1, Number(n) || 0));
  let applied = 0;
  for (const r of rows) {
    const dims = {
      public_appeal: clamp01(r.public_appeal),
      scientific_significance: clamp01(r.scientific_significance),
      reach: clamp01(r.reach),
      timeliness: clamp01(r.timeliness),
    };
    await db
      .update(events)
      .set({
        analysisStatus: 'analyzed',
        eventScore: computeEventScore(dims),
        publicAppeal: dims.public_appeal,
        scientificSignificance: dims.scientific_significance,
        reach: dims.reach,
        timeliness: dims.timeliness,
        pitchSuggestion: r.pitch_suggestion?.trim() || null,
        suggestedAngle: r.suggested_angle?.trim() || null,
        targetAudience: r.target_audience?.trim() || null,
        reasoning: r.reasoning?.trim() || null,
        llmModel: 'anthropic/claude-opus-4 (in-chat)',
        analysisCost: 0,
        analyzedAt: sql`NOW()`,
      })
      .where(eq(events.id, r.id));
    applied++;
  }
  console.log(`[apply-event-scores] applied ${applied} scores to ${target}`);
}

main().catch((err: unknown) => {
  console.error('[apply-event-scores] failed:', err);
  process.exit(1);
});
