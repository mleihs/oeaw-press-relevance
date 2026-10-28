// Journal der Bewertungsläufe (Tabelle scoring_runs, Migration
// 20261028000001). Eine Zeile je Entität und Lauf: `running` beim Start,
// Zwischenstand nach jedem Chunk, Status/Einzeiler/Bericht am Ende. Gelesen von
// der Dashboard-Kachel (status.ts), der Nacht (Poll der Route) und der
// Nachkontrolle (CLI --report-latest).

import { desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { db, scoringRuns } from '@/lib/server/db';
import type { ScoringFatal, ScoringRunCounts, ScoringRunStatus } from '@/lib/shared/scoring/run-classify';
import { BATCH_DEADLINE_MINUTES } from './config';
import type { ScoringEntity, ScoringRunReport, ScoringTrigger } from './types';

/**
 * Eine Zeile, die so lange `running` steht, gehört zu einem Prozess, der nicht
 * mehr lebt (Deploy, Absturz). Sie wird nicht umgeschrieben (die Zeile bleibt
 * Beleg), aber beim Lesen als abgebrochen gemeldet. Die Frist hängt am
 * Auslöser: der Knopf ruft direkt und ist nach spätestens einer Stunde fertig;
 * Nacht und CLI gehen über die Batch-API und warten bis BATCH_DEADLINE_MINUTES,
 * plus Luft für das Stornieren und Abholen danach.
 */
export const STALE_RUNNING_MINUTES = { button: 120, batch: BATCH_DEADLINE_MINUTES + 30 } as const;

/** Ab wie vielen Minuten auf `running` ein Lauf dieses Auslösers als abgebrochen gilt. */
export function staleAfterMinutes(trigger: string): number {
  return trigger === 'button' ? STALE_RUNNING_MINUTES.button : STALE_RUNNING_MINUTES.batch;
}

export type ScoringRunRow = typeof scoringRuns.$inferSelect;

export interface RunStart {
  entity: ScoringEntity;
  trigger: ScoringTrigger;
  model: string;
  modelTag: string;
  effort: string;
  costCapUsd: number;
}

function countColumns(c: ScoringRunCounts) {
  return {
    candidates: c.candidates,
    scored: c.scored,
    failed: c.failed,
    skipped: c.skipped,
    haikuRejected: c.haikuRejected,
    lektoratFlags: c.lektoratFlags,
    lektoratChanges: c.lektoratChanges,
    costUsd: Math.round(c.costUsd * 10_000) / 10_000,
    costCapUsd: c.costCapUsd,
    costCapHit: c.costCapHit,
  };
}

export async function startRun(e: RunStart): Promise<string> {
  const [row] = await db.insert(scoringRuns).values(e).returning({ id: scoringRuns.id });
  return row.id;
}

/** Zwischenstand. Trifft nur eine noch laufende Zeile, damit ein verspäteter
 *  Fortschritt einen schon geschlossenen Lauf nicht wieder öffnet. */
export async function progressRun(id: string, counts: ScoringRunCounts, report: ScoringRunReport): Promise<void> {
  await db
    .update(scoringRuns)
    .set({ ...countColumns(counts), report })
    .where(sql`${scoringRuns.id} = ${id} AND ${scoringRuns.status} = 'running'`);
}

export async function finishRun(
  id: string,
  f: {
    status: Exclude<ScoringRunStatus, 'running'>;
    counts: ScoringRunCounts;
    summary: string;
    error: ScoringFatal | null;
    report: ScoringRunReport;
    medianScore: number | null;
  },
): Promise<void> {
  await db
    .update(scoringRuns)
    .set({
      ...countColumns(f.counts),
      status: f.status,
      finishedAt: sql`now()`,
      summary: f.summary,
      errorClass: f.error?.errorClass ?? null,
      errorMessage: f.error?.message ?? null,
      report: f.report,
      medianScore: f.medianScore === null ? null : Math.round(f.medianScore * 10_000) / 10_000,
    })
    .where(eq(scoringRuns.id, id));
}

/**
 * Schließt eine Zeile, deren Lauf gar nicht erst in den Kern kam (die
 * Nacht-Route legt die Zeilen vorab an). Zähler und Bericht bleiben, wie sie
 * sind; trifft nur eine noch laufende Zeile.
 */
export async function abandonRun(id: string, error: ScoringFatal): Promise<void> {
  await db
    .update(scoringRuns)
    .set({
      status: 'failed',
      finishedAt: sql`now()`,
      summary: `Lauf nicht begonnen: ${error.message}`,
      errorClass: error.errorClass,
      errorMessage: error.message,
    })
    .where(sql`${scoringRuns.id} = ${id} AND ${scoringRuns.status} = 'running'`);
}

/** Lauf-Zeile mit angewandter Stale-Regel: zu alte `running`-Zeilen als abgebrochen. */
export function applyStaleRule(row: ScoringRunRow, now: Date = new Date()): ScoringRunRow {
  if (row.status !== 'running') return row;
  const ageMinutes = (now.getTime() - new Date(row.startedAt).getTime()) / 60_000;
  if (ageMinutes <= staleAfterMinutes(row.trigger)) return row;
  return {
    ...row,
    status: 'failed',
    errorClass: 'aborted',
    errorMessage: `Lauf ohne Abschluss: steht seit ${Math.floor(ageMinutes)} Minuten auf running.`,
  };
}

/** Eine Zeile mit angewandter Stale-Regel, oder null bei unbekannter id. */
export async function getRun(id: string): Promise<ScoringRunRow | null> {
  const [row] = await db.select().from(scoringRuns).where(eq(scoringRuns.id, id)).limit(1);
  return row ? applyStaleRule(row) : null;
}

/**
 * Eine Zeile für die Routen (Poll der Nacht, Nachkontrolle). Den Bericht nur
 * auf Wunsch: der Nacht-Wrapper pollt alle 30 Sekunden und braucht ihn nicht.
 */
export function runToApi(row: ScoringRunRow, opts: { withReport?: boolean } = {}) {
  return {
    id: row.id,
    entity: row.entity,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    model: row.model,
    modelTag: row.modelTag,
    effort: row.effort,
    counts: {
      candidates: row.candidates,
      scored: row.scored,
      failed: row.failed,
      skipped: row.skipped,
      haikuRejected: row.haikuRejected,
      lektoratFlags: row.lektoratFlags,
      lektoratChanges: row.lektoratChanges,
    },
    costUsd: row.costUsd,
    costCapUsd: row.costCapUsd,
    costCapHit: row.costCapHit,
    medianScore: row.medianScore,
    summary: row.summary,
    errorClass: row.errorClass,
    errorMessage: row.errorMessage,
    ...(opts.withReport ? { report: row.report } : {}),
  };
}

export interface EntityRuns {
  /** Jüngster Lauf, der nicht mehr läuft (oder als abgebrochen gilt). */
  latest: ScoringRunRow | null;
  /** Der laufende Lauf, wenn es einen gibt. */
  running: ScoringRunRow | null;
}

/**
 * Je Entität der jüngste abgeschlossene und der laufende Lauf, in EINER
 * Abfrage: DISTINCT ON (entity, läuft-gerade) über die Zeilen, jüngste zuerst.
 *
 * Läufe, die wegen eines belegten Locks gar nicht begannen (`lock_busy`),
 * zählen nicht: sie sagen nichts über den Stand, der Lauf mit dem Lock hat
 * seine eigene Zeile. Sonst verdeckte ein Knopfdruck während der Nacht deren
 * Ergebnis, auch ein `failed`. Im Journal bleiben sie als Beleg stehen.
 */
export async function latestRuns(): Promise<Record<ScoringEntity, EntityRuns>> {
  // Die Minuten als Literal, nicht als Parameter: Postgres verlangt, dass die
  // DISTINCT-ON-Ausdrücke den ersten ORDER-BY-Ausdrücken gleichen, und zwei
  // Parameter ($1 dort, $3 hier) machen denselben Ausdruck ungleich (Fehler
  // 42P10, erst gegen die echte DB aufgefallen). Unbedenklich: Konstanten.
  const minutes = sql.raw(
    `CASE WHEN "trigger" = 'button' THEN ${STALE_RUNNING_MINUTES.button} ELSE ${STALE_RUNNING_MINUTES.batch} END`,
  );
  const live = sql<boolean>`(${scoringRuns.status} = 'running' AND ${scoringRuns.startedAt} > now() - make_interval(mins => ${minutes}))`;
  const rows = await db
    .selectDistinctOn([scoringRuns.entity, live], { ...getTableColumns(scoringRuns), live })
    .from(scoringRuns)
    .where(sql`${scoringRuns.errorClass} IS DISTINCT FROM 'lock_busy'`)
    .orderBy(scoringRuns.entity, live, desc(scoringRuns.startedAt));

  const out: Record<ScoringEntity, EntityRuns> = {
    publications: { latest: null, running: null },
    events: { latest: null, running: null },
  };
  const now = new Date();
  for (const { live: isLive, ...row } of rows) {
    const entry = out[row.entity as ScoringEntity];
    if (!entry) continue;
    if (isLive) entry.running = row;
    else entry.latest = applyStaleRule(row, now);
  }
  return out;
}
