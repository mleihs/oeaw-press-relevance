import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/server/db';
import { SCORING_RECENT_DAYS } from '@/lib/shared/dashboard';

// Bewertungs-Status für die Dashboard-Kachel: pro Entität (Publikationen /
// Events) „zuletzt importiert am X" + „N unbewertet, älteste seit Y Tagen".
//
// Zählungen kommen aus den KANONISCHEN Views (publication_scoring_candidates /
// event_scoring_candidates) — dieselbe Wahrheit, die auch der „Bewerten"-Button
// (Server-Batch-Pfad) und der In-Chat-Pfad sehen. „Zuletzt importiert" kommt aus
// ingest_runs (applied_at des jüngsten Laufs je Feed); vor dem ersten Nacht-Lauf
// gibt es dort noch keine Zeile → Fallback auf den jüngsten Datensatz-Zeitstempel
// (publications.updated_at bzw. events.synced_at).
//
// BEWUSST kein unstable_cache: die Kachel muss nach einem „Bewerten"-Lauf (der
// router.refresh() auslöst) sofort die gesunkene Zahl zeigen.

// Feed-Cursor-Schlüssel — Spiegel von run-publications-delta.ts (DEFAULT_FEED)
// bzw. run-events-import.ts (EVENTS_FEED). Bewusst inline statt Import, damit die
// Dashboard-Abfrage nicht den ganzen Runner-Chain (undici/fetch-export) lädt.
const PUBLICATIONS_FEED = 'publications_incremental_change_2';
const EVENTS_FEED = 'event_news_grouped';

export interface EntityScoringStatus {
  /** Formatiert de-AT / Europe/Vienna (z. B. „16.07.2026"), oder null vor dem ersten Import. */
  lastImportAt: string | null;
  /** 'applied' | 'skipped' | 'failed' | null (kein ingest_runs-Eintrag → Fallback-Quelle). */
  lastImportStatus: string | null;
  lastImportFailed: boolean;
  /**
   * Unbewertete Kandidaten INNERHALB des Bewerten-Fensters (created_at jünger
   * als SCORING_RECENT_DAYS) — also exakt die Menge, die der Knopf daneben
   * auch erreicht. Die Zahl auf der Kachel und der Scope des Knopfes müssen
   * dasselbe meinen, sonst verspricht die Kachel etwas, das der Klick nicht
   * einlöst.
   */
  unscoredCount: number;
  /** Unbewertete Kandidaten AUSSERHALB des Fensters (Altbestand). Erreichbar
   *  nur über das In-Chat-Scoring; bei Events immer 0. */
  backlogCount: number;
  /** Alter der ältesten unbewerteten Entität IM FENSTER in Tagen, oder null bei
   *  0 frischen Kandidaten. Basis der Ampel: der Altbestand darf die Kachel
   *  nicht dauerhaft rot färben, er ist ja bewusst nicht Aufgabe des Knopfes. */
  oldestUnscoredDays: number | null;
}

export interface ScoringStatus {
  publications: EntityScoringStatus;
  events: EntityScoringStatus;
}

interface StatusRow {
  pub_unscored: number;
  pub_backlog: number;
  pub_oldest_days: number | null;
  pub_last_import: string | null;
  pub_last_status: string | null;
  ev_unscored: number;
  ev_oldest_days: number | null;
  ev_last_import: string | null;
  ev_last_status: string | null;
  // db.execute<T> verlangt T extends Record<string, unknown>.
  [key: string]: unknown;
}

const dateFmt = new Intl.DateTimeFormat('de-AT', {
  timeZone: 'Europe/Vienna',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
}

/** Ein Roundtrip: Kandidaten-Counts + älteste + letzter Import je Entität. */
export async function getScoringStatus(): Promise<ScoringStatus> {
  // Grenze des Bewerten-Fensters, einmal berechnet und dreifach verwendet.
  const cutoff = sql`now() - make_interval(days => ${SCORING_RECENT_DAYS}::int)`;
  const rows = await db.execute<StatusRow>(sql`
    SELECT
      (SELECT count(*)::int FROM publication_scoring_candidates
         WHERE created_at >= ${cutoff})                                                       AS pub_unscored,
      (SELECT count(*)::int FROM publication_scoring_candidates
         WHERE created_at IS NULL OR created_at < ${cutoff})                                  AS pub_backlog,
      (SELECT floor(extract(epoch FROM now() - min(created_at)) / 86400)::int
         FROM publication_scoring_candidates WHERE created_at >= ${cutoff})                   AS pub_oldest_days,
      COALESCE(
        (SELECT applied_at FROM ingest_runs WHERE feed = ${PUBLICATIONS_FEED}
           ORDER BY applied_at DESC LIMIT 1),
        (SELECT max(updated_at) FROM publications)
      )                                                                                        AS pub_last_import,
      (SELECT status FROM ingest_runs WHERE feed = ${PUBLICATIONS_FEED}
         ORDER BY applied_at DESC LIMIT 1)                                                     AS pub_last_status,
      (SELECT count(*)::int FROM event_scoring_candidates)                                     AS ev_unscored,
      (SELECT floor(extract(epoch FROM now() - min(created_at)) / 86400)::int
         FROM event_scoring_candidates)                                                        AS ev_oldest_days,
      COALESCE(
        (SELECT applied_at FROM ingest_runs WHERE feed = ${EVENTS_FEED}
           ORDER BY applied_at DESC LIMIT 1),
        (SELECT max(synced_at) FROM events)
      )                                                                                        AS ev_last_import,
      (SELECT status FROM ingest_runs WHERE feed = ${EVENTS_FEED}
         ORDER BY applied_at DESC LIMIT 1)                                                     AS ev_last_status
  `);

  const r = rows[0];
  return {
    publications: {
      lastImportAt: fmtDate(r.pub_last_import),
      lastImportStatus: r.pub_last_status,
      lastImportFailed: r.pub_last_status === 'failed',
      unscoredCount: Number(r.pub_unscored ?? 0),
      backlogCount: Number(r.pub_backlog ?? 0),
      oldestUnscoredDays: r.pub_oldest_days == null ? null : Number(r.pub_oldest_days),
    },
    events: {
      lastImportAt: fmtDate(r.ev_last_import),
      lastImportStatus: r.ev_last_status,
      lastImportFailed: r.ev_last_status === 'failed',
      unscoredCount: Number(r.ev_unscored ?? 0),
      // Events kennen keinen Altbestand: `event_at >= now()` begrenzt die
      // Kandidatenmenge von selbst (lib/server/events/analyze.ts).
      backlogCount: 0,
      oldestUnscoredDays: r.ev_oldest_days == null ? null : Number(r.ev_oldest_days),
    },
  };
}
