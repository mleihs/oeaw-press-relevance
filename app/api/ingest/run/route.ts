import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { withApiError } from '@/lib/server/http';
import { assertCronSecret } from '@/lib/server/ingest/cron-auth';
import { runPublicationsDeltaImport } from '@/lib/server/ingest/run-publications-delta';
import { runEventsImport, EVENTS_FEED } from '@/lib/server/ingest/run-events-import';
import { runEnrichmentImport } from '@/lib/server/ingest/run-enrichment';

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
// den anderen NICHT). HTTP 200, sobald die Route lief; `ok` fasst zusammen, ob
// ALLE Feeds sauber (applied/skipped, keine Warnungen) durchliefen — der
// VPS-Wrapper alarmiert per Mail bei `ok:false`/non-200/curl-Fehler.

export const maxDuration = 300;

interface FeedOutcome {
  status: string;
  [k: string]: unknown;
}

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

    const outcomes = Object.values(feeds);
    const allClean = outcomes.every(
      (f) => f.status === 'applied' || f.status === 'skipped',
    );
    const anyWarnings = outcomes.some(
      (f) => Array.isArray(f.warnings) && f.warnings.length > 0,
    );
    const ok = allClean && !anyWarnings;

    return NextResponse.json({
      ok,
      startedAt,
      durationMs: Date.now() - t0,
      feeds,
    });
  },
  { csrf: false },
);
