#!/usr/bin/env tsx
// Applies manually-produced (in-chat) event relevance scores to the DB. Reads a
// JSON array of { id, public_appeal, scientific_significance, reach, timeliness,
// pitch_suggestion, suggested_angle, target_audience, reasoning } and writes
// each row via the same computeEventScore + column set as the LLM path, so the
// UI renders them identically. Provenance is tagged as in-chat (cost 0).
//
// Auf dem Sicherheitsniveau von scripts/session-pipeline.mjs cmdApply
// (Härtung 2026-07-21, AP6 des Bewertungs-Splits):
//   * DRY-RUN ist Default. Geschrieben wird erst mit --apply.
//   * Harte Validierung statt stiller clamp01-Korrektur: eine fehlende oder
//     nicht-numerische Dimension bricht mit Item-Liste ab. Ein Score-Objekt
//     ohne `reach` war vorher stillschweigend `reach: 0` — also eine erfundene
//     Bewertung, die von einer echten nicht zu unterscheiden ist.
//   * Überschreibschutz `event_score IS NULL` im UPDATE-WHERE; bewusstes
//     Überschreiben nur mit --force.
//   * Der Provenance-Tag kommt aus lib/shared/event-session-model.json statt
//     hartkodiert zu sein: auf Prod stehen deshalb drei Tag-Varianten
//     nebeneinander, was jede Auswertung nach Modell verfälscht.
//
// Usage:
//   npm run apply-event-scores -- --file=/tmp/scores.json                  # Dry-run, lokal
//   npm run apply-event-scores -- --file=/tmp/scores.json --apply          # schreibt, lokal
//   npm run apply-event-scores -- --target=prod --yes --apply --file=…     # schreibt, prod
//   … --force                                                             # überschreibt bestehende Scores

import { readFileSync } from 'node:fs';
import { loadDbUrl, parseScriptArgs, confirmProd } from './lib/db.mjs';
import { initScriptSentry, captureScriptError, flushAndExit } from './lib/sentry.mjs';
import sessionModel from '@/lib/shared/event-session-model.json';

const { target, flags } = parseScriptArgs();
const isProd = target === 'prod';
process.loadEnvFile('.env.local');
initScriptSentry('apply-event-scores');
process.env.DATABASE_URL = loadDbUrl(target);

const fileFlag = flags.find((f) => f.startsWith('--file='));
const file = fileFlag ? fileFlag.split('=')[1] : '';
if (!file) {
  console.error('[apply-event-scores] --file=<scores.json> required');
  process.exit(1);
}
const apply = flags.includes('--apply');
const force = flags.includes('--force');

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

const DIMS = [
  'public_appeal',
  'scientific_significance',
  'reach',
  'timeliness',
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Harte Validierung. Sammelt ALLE Probleme, damit eine Korrekturrunde reicht. */
function validate(rows: unknown): ScoredEvent[] {
  if (!Array.isArray(rows)) {
    console.error('[apply-event-scores] Datei enthält kein JSON-Array.');
    process.exit(1);
  }
  const problems: string[] = [];
  rows.forEach((raw, i) => {
    const r = raw as Record<string, unknown>;
    const id = typeof r?.id === 'string' ? r.id : '';
    const label = id ? id.slice(0, 8) : `#${i}`;
    if (!UUID.test(id)) problems.push(`${label}: id fehlt oder ist keine UUID`);
    for (const dim of DIMS) {
      const v = r?.[dim];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) {
        problems.push(`${label}: ${dim}=${JSON.stringify(v)} (erwartet Zahl 0..1)`);
      }
    }
  });
  if (problems.length > 0) {
    console.error(`[apply-event-scores] ${problems.length} ungültige Angaben, nichts geschrieben:`);
    for (const p of problems.slice(0, 20)) console.error(`  ${p}`);
    if (problems.length > 20) console.error(`  … und ${problems.length - 20} weitere`);
    process.exit(1);
  }
  return rows as ScoredEvent[];
}

async function main(): Promise<void> {
  const rows = validate(JSON.parse(readFileSync(file, 'utf8')));
  if (apply) await confirmProd({ isProd, flags, label: 'apply-event-scores' });

  const { db, events } = await import('@/lib/server/db');
  const { and, eq, isNull, sql } = await import('drizzle-orm');
  const { computeEventScore } = await import('@/lib/shared/scoring');
  const { getCurrentEventScoreWeights } = await import('@/lib/server/events/score-weights');
  const weights = await getCurrentEventScoreWeights();

  const mode = apply ? (force ? '[APPLY] [FORCE]' : '[APPLY]') : '[DRY-RUN]';
  console.log(
    `[apply-event-scores] ${rows.length} Bewertungen validiert · target=${target} · tag=${sessionModel.tag} ${mode}`,
  );

  if (!apply) {
    for (const r of rows.slice(0, 3)) {
      const dims = Object.fromEntries(DIMS.map((d) => [d, r[d]])) as Record<
        (typeof DIMS)[number],
        number
      >;
      console.log(
        `  id=${r.id.slice(0, 8)}…  event_score=${computeEventScore(dims, weights)}  pitch="${(r.pitch_suggestion ?? '').slice(0, 60)}…"`,
      );
    }
    console.log('  Mit --apply tatsächlich schreiben, mit --force auch Bewertetes überschreiben.');
    return;
  }

  let applied = 0;
  let skipped = 0;
  for (const r of rows) {
    const dims = {
      public_appeal: r.public_appeal,
      scientific_significance: r.scientific_significance,
      reach: r.reach,
      timeliness: r.timeliness,
    };
    // Überschreibschutz im WHERE statt im JS: atomar, unabhängig von einem
    // Vor-SELECT und von der analysis_status/event_score-Invariante. Ein
    // Update, das nichts trifft, zählt als übersprungen.
    const where = force
      ? eq(events.id, r.id)
      : and(eq(events.id, r.id), isNull(events.eventScore));
    const res = await db
      .update(events)
      .set({
        analysisStatus: 'analyzed',
        eventScore: computeEventScore(dims, weights),
        publicAppeal: dims.public_appeal,
        scientificSignificance: dims.scientific_significance,
        reach: dims.reach,
        timeliness: dims.timeliness,
        pitchSuggestion: r.pitch_suggestion?.trim() || null,
        suggestedAngle: r.suggested_angle?.trim() || null,
        targetAudience: r.target_audience?.trim() || null,
        reasoning: r.reasoning?.trim() || null,
        llmModel: sessionModel.tag,
        analysisCost: 0,
        analyzedAt: sql`NOW()`,
      })
      .where(where)
      .returning({ id: events.id });
    if (res.length > 0) applied++;
    else skipped++;
  }
  console.log(
    `[apply-event-scores] applied ${applied} · skipped ${skipped}${
      skipped > 0 && !force ? ' (bereits bewertet oder unbekannte id; --force überschreibt)' : ''
    } · target=${target}`,
  );
}

main().catch((err: unknown) => {
  console.error('[apply-event-scores] failed:', err);
  captureScriptError(err);
  void flushAndExit(1);
});
