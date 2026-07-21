import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withApiError } from '@/lib/server/http';
import { assertCronSecret } from '@/lib/server/ingest/cron-auth';
import { runPublicationsDeltaImport } from '@/lib/server/ingest/run-publications-delta';
import { runEventsImport, EVENTS_FEED } from '@/lib/server/ingest/run-events-import';
import { runEnrichmentImport } from '@/lib/server/ingest/run-enrichment';
import { classifyRun, type FeedOutcome } from '@/lib/server/ingest/classify-run';

// Unbeaufsichtigter Nacht-Ingest: zieht beide OeAW-JSON-Exporte (Publications-
// Delta + Events) und wendet sie an. KEIN Auto-Scoring — neue Zeilen landen als
// Kandidaten (analysis_status='pending' / event_score=NULL) und werden vom
// bevorzugten In-Chat-Scoring bzw. dem „Bewerten"-Fallback aufgegriffen.
//
// Auth: Bearer INGEST_CRON_SECRET (assertCronSecret), NICHT das Gate-Cookie
// (Route liegt in PUBLIC_PATHS) und NICHT requireUser() (Maschinen-Cron).
// csrf:false, weil der Cron keinen Browser-Origin trägt und per Bearer statt
// per Ambient-Cookie authentifiziert — die Same-Origin-Prüfung würde nur den
// legitimen Cron abweisen.
//
// Ablauf: beide Feeds SEQUENZIELL, je eigenes try/catch (ein Feed-Fehler stoppt
// den anderen NICHT). HTTP 200, sobald die Route lief.
//
// ZWEI STUFEN statt einer (vorher kippte JEDE Warnung den Lauf auf ok:false —
// am 2026-07-21 meldete das einen komplett erfolgreichen Import als Fehlschlag,
// nur weil eine Junction auf eine im Feed fehlende Person zeigte):
//   ok:false    — mindestens ein Feed steht auf error/failed, ODER die Drift
//                 überschreitet DRIFT_ALARM_THRESHOLD. Echter Alarm.
//   degraded    — alles angewandt, aber vereinzelte Drift-Signale (Orphans,
//                 unaufgelöste Lookups). Wird journalisiert, löst KEINEN Alarm
//                 und KEINE Mail aus: der Export liefert regelmäßig eine
//                 Verknüpfung auf einen Personensatz, den er selbst leer
//                 ausliefert. Ein Upstream-Defekt, den wir nicht beheben können
//                 und für den niemand nachts geweckt werden will.
// `summary` ist die vorformulierte Einzeilen-Diagnose: der VPS-Wrapper nimmt sie
// als Sentry-Titel, statt den JSON-Body abzuschneiden.

export const maxDuration = 300;

export const POST = withApiError(
  async (req: NextRequest) => {
    const authFail = assertCronSecret(req);
    if (authFail) return authFail;

    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const feeds: Record<string, FeedOutcome> = {};

    // --- Feed 1: Publications-Delta ------------------------------------------
    try {
      const r = await runPublicationsDeltaImport();
      feeds[r.feed] = {
        status: r.status,
        report: r.report,
        warnings: r.warnings,
        driftTotal: r.driftTotal,
        matviewRefreshed: r.matviewRefreshed,
        durationMs: r.durationMs,
      };
    } catch (err) {
      Sentry.captureException(err, {
        tags: { seam: 'ingest_run', feed: 'publications_incremental_change_2' },
      });
      feeds.publications_incremental_change_2 = {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // --- Feed 2: Events ------------------------------------------------------
    try {
      const r = await runEventsImport();
      feeds[r.feed] = {
        status: r.status,
        imported: r.imported,
        updated: r.updated,
        parsed: r.parsed,
        reason: r.reason,
        durationMs: r.durationMs,
      };
    } catch (err) {
      Sentry.captureException(err, {
        tags: { seam: 'ingest_run', feed: EVENTS_FEED },
      });
      feeds[EVENTS_FEED] = {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    // --- Feed 3: Enrichment (Vorstufe zum Bewerten) --------------------------
    // Läuft ZULETZT: die externen API-Calls (~10 s/Pub) sind der längste Teil;
    // ein langsamer/fehlschlagender Enrich-Lauf soll die Importe + ihre Journale
    // oben nicht blockieren. Reichert ausstehende Pubs an, damit sie das
    // Content-Gate der Kandidaten-View erfüllen und danach bewertbar sind.
    try {
      const r = await runEnrichmentImport();
      feeds[r.feed] = {
        status: r.status,
        pubs: r.pubs,
        successful: r.successful,
        partial: r.partial,
        failed: r.failed,
        durationMs: r.durationMs,
      };
    } catch (err) {
      Sentry.captureException(err, {
        tags: { seam: 'ingest_run', feed: 'enrichment' },
      });
      feeds.enrichment = {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const verdict = classifyRun(feeds);

    return NextResponse.json({
      ...verdict,
      startedAt,
      durationMs: Date.now() - t0,
      feeds,
    });
  },
  { csrf: false },
);
