// Lauf-Status für die Dashboard-Kachel „Bewertung" (Datenvertrag
// EntityScoringRun, Plan §5.5). Die Darstellung kommt mit dem Design-Zip
// (Plan §7.4); bis dahin reicht lib/server/ingest/status.ts die Daten nur durch.

import type { AuditCode, TextField } from '@/lib/shared/scoring/text-audit';
import type { ScoringErrorClass } from '@/lib/shared/scoring/run-classify';
import { scoringDisabledReason } from './gate';
import { latestRuns, type ScoringRunRow } from './journal';
import type { ScoringEntity, ScoringRunReport, ScoringTrigger } from './types';

export interface EntityScoringRun {
  runState: 'idle' | 'running' | 'ok' | 'partial' | 'failed' | 'disabled';
  /** ISO-Zeitpunkt: Ende des letzten Laufs, bei einem laufenden dessen Start. */
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunTrigger: ScoringTrigger | null;
  candidates: number;
  scored: number;
  failed: number;
  skipped: number;
  haikuRejected: number;
  lektoratFlags: number;
  lektoratChanges: number;
  costUsd: number | null;
  costCapUsd: number | null;
  costCapHit: boolean;
  medianScore: number | null;
  errorClass: ScoringErrorClass | null;
  errorMessage: string | null;
  /** Nur bei runState `running`: bearbeitet (bewertet oder gescheitert) von allen Kandidaten. */
  progress: { done: number; total: number } | null;
  haikuRejectedItems: Array<{ id: string; title: string }>;
  lektoratFlagItems: Array<{ id: string; title: string; field: TextField; code: AuditCode }>;
}

const IDLE: EntityScoringRun = {
  runState: 'idle',
  lastRunAt: null,
  lastRunDurationMs: null,
  lastRunTrigger: null,
  candidates: 0,
  scored: 0,
  failed: 0,
  skipped: 0,
  haikuRejected: 0,
  lektoratFlags: 0,
  lektoratChanges: 0,
  costUsd: null,
  costCapUsd: null,
  costCapHit: false,
  medianScore: null,
  errorClass: null,
  errorMessage: null,
  progress: null,
  haikuRejectedItems: [],
  lektoratFlagItems: [],
};

/**
 * Journal-Zeile → Kachel-Daten. `skipped` (keine Kandidaten, oder ein anderer
 * Lauf hielt den Lock) zeigt die Kachel als `ok`: es gab nichts zu tun, und
 * die Zusammenfassung sagt, warum. Ein laufender Lauf hat Vorrang.
 */
export function toEntityScoringRun(row: ScoringRunRow | null, running: ScoringRunRow | null): EntityScoringRun {
  const shown = running ?? row;
  if (!shown) return IDLE;
  const report = (shown.report ?? {}) as Partial<ScoringRunReport>;
  const end = shown.finishedAt ? new Date(shown.finishedAt).getTime() : null;
  const runState: EntityScoringRun['runState'] = running
    ? 'running'
    : shown.status === 'skipped'
      ? 'ok'
      : (shown.status as 'ok' | 'partial' | 'failed');
  return {
    runState,
    lastRunAt: shown.finishedAt ?? shown.startedAt,
    lastRunDurationMs: end === null ? null : end - new Date(shown.startedAt).getTime(),
    lastRunTrigger: shown.trigger as ScoringTrigger,
    candidates: shown.candidates,
    scored: shown.scored,
    failed: shown.failed,
    skipped: shown.skipped,
    haikuRejected: shown.haikuRejected,
    lektoratFlags: shown.lektoratFlags,
    lektoratChanges: shown.lektoratChanges,
    costUsd: shown.costUsd,
    costCapUsd: shown.costCapUsd,
    costCapHit: shown.costCapHit,
    medianScore: shown.medianScore,
    errorClass: (shown.errorClass as ScoringErrorClass | null) ?? null,
    errorMessage: shown.errorMessage,
    progress: running ? { done: running.scored + running.failed, total: running.candidates } : null,
    haikuRejectedItems: (report.haiku_rejected ?? []).map(({ id, title }) => ({ id, title })),
    lektoratFlagItems: (report.lektorat_flags ?? []).map(({ id, title, field, code }) => ({ id, title, field, code })),
  };
}

/**
 * Status beider Entitäten. Eine Instanz, die nicht automatisch bewertet
 * (Not-Aus, oder kein Anthropic-Key wie der Vercel-Standby), meldet `disabled`
 * und fragt das Journal gar nicht erst.
 */
export async function getScoringRunStatus(): Promise<Record<ScoringEntity, EntityScoringRun>> {
  if (scoringDisabledReason() !== null) {
    return { publications: { ...IDLE, runState: 'disabled' }, events: { ...IDLE, runState: 'disabled' } };
  }
  const runs = await latestRuns();
  return {
    publications: toEntityScoringRun(runs.publications.latest, runs.publications.running),
    events: toEntityScoringRun(runs.events.latest, runs.events.running),
  };
}
