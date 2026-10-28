#!/usr/bin/env tsx
// Applies manually-produced (in-chat) event relevance scores to the DB. Reads a
// JSON array of { id, public_appeal, scientific_significance, reach, timeliness,
// pitch_suggestion, suggested_angle, target_audience, reasoning } and writes
// each row through the same function as the scoring core
// (lib/server/scoring/persist.ts, writeEventEvaluations), so the UI renders
// them identically. Provenance is tagged as in-chat (cost 0).
//
// Auf dem Sicherheitsniveau von scripts/session-pipeline.ts cmdApply
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
//   * Textfelder laufen durch dieselben Gates wie im Bewertungskern
//     (lib/shared/scoring/text-sanitize.ts + text-audit.ts): Leak, Gedankenstrich
//     und ae/oe/ue statt Umlaut brechen ab, alles andere ist eine Warnung.
//
// Usage:
//   npm run apply-event-scores -- --file=/tmp/scores.json                  # Dry-run, lokal
//   npm run apply-event-scores -- --file=/tmp/scores.json --apply          # schreibt, lokal
//   npm run apply-event-scores -- --target=prod --yes --apply --file=…     # schreibt, prod
//   … --force                                                             # überschreibt bestehende Scores

import { readFileSync } from 'node:fs';
// Gemeinsame Präambel: Flags → .env.local → Sentry → DATABASE_URL-Override.
import {
  bootstrapScript, captureScriptError, flushAndExit,
} from './lib/bootstrap';
import sessionModel from '@/lib/shared/event-session-model.json';
import { EVENT_SCORE_DIMENSIONS } from '@/lib/shared/constants';
import { uuidPattern } from '@/lib/shared/schemas';
import { evaluationProblems } from '@/lib/shared/scoring/evaluation';
import { sanitizeText } from '@/lib/shared/scoring/text-sanitize';
import { auditItem, TEXT_FIELDS, type AuditCode } from '@/lib/shared/scoring/text-audit';

const { target, flags, confirmProd } = bootstrapScript('apply-event-scores');

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

/** Text-Befunde, die den Lauf abbrechen statt nur zu warnen. */
const BLOCKING: ReadonlySet<AuditCode> = new Set(['leak', 'em_dash', 'umlaut_digraph']);

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
    if (!uuidPattern.test(id)) problems.push(`${label}: id fehlt oder ist keine UUID`);
    for (const p of evaluationProblems(r, { dimensions: EVENT_SCORE_DIMENSIONS })) problems.push(`${label}: ${p}`);
    for (const field of TEXT_FIELDS) {
      if (typeof r?.[field] === 'string') r[field] = sanitizeText(r[field]);
    }
    const texts = Object.fromEntries(TEXT_FIELDS.map((f) => [f, r?.[f]]).filter(([, v]) => typeof v === 'string'));
    for (const f of auditItem({ id: label, texts }, { entity: 'events' })) {
      const line = `${label}: ${f.field} [${f.code}] ${f.detail}`;
      if (BLOCKING.has(f.code)) problems.push(line);
      else console.warn(`[apply-event-scores] Warnung ${line}`);
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
  if (apply) await confirmProd('apply-event-scores');

  const { eventScores, writeEventEvaluations } = await import('@/lib/server/scoring/persist');
  // Fehlende Texte bleiben leer und werden als NULL geschrieben, wie bisher.
  const results = rows.map((r) => ({
    public_appeal: r.public_appeal,
    scientific_significance: r.scientific_significance,
    reach: r.reach,
    timeliness: r.timeliness,
    pitch_suggestion: r.pitch_suggestion ?? '',
    suggested_angle: r.suggested_angle ?? '',
    target_audience: r.target_audience ?? '',
    reasoning: r.reasoning ?? '',
  }));

  const mode = apply ? (force ? '[APPLY] [FORCE]' : '[APPLY]') : '[DRY-RUN]';
  console.log(
    `[apply-event-scores] ${rows.length} Bewertungen validiert · target=${target} · tag=${sessionModel.tag} ${mode}`,
  );

  if (!apply) {
    const scores = await eventScores(results.slice(0, 3));
    rows.slice(0, 3).forEach((r, i) => {
      console.log(
        `  id=${r.id.slice(0, 8)}…  event_score=${scores[i]}  pitch="${(r.pitch_suggestion ?? '').slice(0, 60)}…"`,
      );
    });
    console.log('  Mit --apply tatsächlich schreiben, mit --force auch Bewertetes überschreiben.');
    return;
  }

  // Überschreibschutz im WHERE (persist.ts): ein Update, das nichts trifft,
  // zählt als übersprungen.
  const written = await writeEventEvaluations(
    rows.map((r, i) => ({ id: r.id, result: results[i], cost: 0 })),
    { modelTag: sessionModel.tag, force },
  );
  const skipped = rows.length - written.length;
  console.log(
    `[apply-event-scores] applied ${written.length} · skipped ${skipped}${
      skipped > 0 && !force ? ' (bereits bewertet oder unbekannte id; --force überschreibt)' : ''
    } · target=${target}`,
  );
  // Den Drizzle-Pool schließen, sonst hält er den Prozess bis zum Idle-Timeout (20 s) offen.
  const { db } = await import('@/lib/server/db');
  await db.$client.end({ timeout: 5 });
}

main().catch((err: unknown) => {
  console.error('[apply-event-scores] failed:', err);
  captureScriptError(err);
  void flushAndExit(1);
});
