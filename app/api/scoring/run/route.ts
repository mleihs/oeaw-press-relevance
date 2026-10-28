import { NextResponse, type NextRequest } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { validateBody, withApiError } from '@/lib/server/http';
import { assertCronSecret } from '@/lib/server/ingest/cron-auth';
import { describeError } from '@/lib/server/ingest/describe-error';
import { scoringGateResponse, scoringRunConfig } from '@/lib/server/scoring-route';
import { SCORING_ADAPTERS } from '@/lib/server/scoring/adapters';
import { scoringDisabledReason } from '@/lib/server/scoring/gate';
import { abandonRun, startRun } from '@/lib/server/scoring/journal';
import { runScoring } from '@/lib/server/scoring/run';
import { DEFAULT_LLM_MODEL } from '@/lib/shared/constants';
import { autoModelTag } from '@/lib/shared/scoring/model-tag';
import { errorClassFor } from '@/lib/shared/scoring/run-classify';
import { scoringRunPayloadSchema } from '@/lib/shared/schemas';

// Nachtbewertung: startet den Bewertungskern (lib/server/scoring/run.ts) für
// Publikationen und Events und antwortet sofort mit 202 und den Journal-ids.
// Der Wrapper auf dem VPS (infra/metaspots/bin/oeaw-press-score.sh) pollt dann
// GET /api/scoring/runs/<id>, bis keine Zeile mehr `running` steht. Kein
// Stream: ein Lauf dauert länger, als Cloudflare eine stille Verbindung offen
// hält (100 s), und das Journal ist ohnehin die Quelle der Wahrheit.
//
// Auth wie beim Nacht-Ingest: Bearer INGEST_CRON_SECRET (assertCronSecret),
// gate-öffentlich (lib/shared/gate.ts), csrf:false (Maschinen-Cron ohne
// Browser-Origin).
//
// Die Journal-Zeilen legt die Route selbst an, bevor der Lauf beginnt: die
// Entitäten laufen nacheinander, und die Antwort soll beide ids nennen. Ein
// belegter Lock endet im Kern als `skipped` (lock_busy) in genau dieser Zeile.
// `dryRun` ruft kein Modell: Not-Aus, Gates, Konfiguration und die Zahl der
// Kandidaten, für den Handlauf und die Fehlersuche.

export const maxDuration = 60;

export const POST = withApiError(
  async (req: NextRequest) => {
    const authFail = assertCronSecret(req);
    if (authFail) return authFail;

    if (scoringDisabledReason() === 'switched_off') {
      return NextResponse.json(
        { error: 'Nachtbewertung abgeschaltet (SCORING_NIGHTLY_ENABLED=false).', errorClass: 'disabled' },
        { status: 503 },
      );
    }
    const unavailable = scoringGateResponse();
    if (unavailable) return unavailable;

    const body = await validateBody(req, scoringRunPayloadSchema);
    const config = scoringRunConfig();
    const limit = body.limit ? { publications: body.limit, events: body.limit } : config.limit;
    const head = { model: DEFAULT_LLM_MODEL, effort: 'max' as const, costCapUsd: config.costCapUsd, transport: config.transport };

    if (body.dryRun) {
      const candidates: Record<string, number> = {};
      for (const entity of body.entities) {
        const adapter = SCORING_ADAPTERS.find((a) => a.entity === entity);
        if (!adapter) continue;
        const { items } = await adapter.fetchCandidates({ limit: limit[entity], force: false });
        candidates[entity] = items.length;
      }
      return NextResponse.json({ ...head, dryRun: true, limit, candidates });
    }

    const modelTag = autoModelTag(DEFAULT_LLM_MODEL);
    const runs: Array<{ id: string; entity: (typeof body.entities)[number] }> = [];
    for (const entity of body.entities) {
      const id = await startRun({
        entity,
        trigger: 'nightly',
        model: DEFAULT_LLM_MODEL,
        modelTag,
        effort: 'max',
        costCapUsd: config.costCapUsd,
      });
      runs.push({ id, entity });
    }

    // Läuft nach der Antwort weiter (langlebiger Node-Prozess auf Coolify).
    // Was der Kern selbst nicht abfängt, ist ein Programmfehler: nach Sentry,
    // und die vorab angelegten Zeilen werden geschlossen, statt bis zur
    // Stale-Regel auf `running` zu stehen.
    void runScoring(
      {
        entities: body.entities,
        trigger: 'nightly',
        model: DEFAULT_LLM_MODEL,
        write: true,
        limit,
        batchSize: config.batchSize,
        concurrency: config.concurrency,
        transport: config.transport,
        costCapUsd: config.costCapUsd,
        runIds: Object.fromEntries(runs.map((r) => [r.entity, r.id])),
      },
      SCORING_ADAPTERS,
    ).catch(async (err: unknown) => {
      Sentry.captureException(err, { tags: { seam: 'scoring_run', trigger: 'nightly' } });
      const fatal = { errorClass: errorClassFor(err), message: describeError(err) };
      await Promise.all(runs.map((r) => abandonRun(r.id, fatal).catch(() => undefined)));
    });

    return NextResponse.json({ ...head, runs }, { status: 202 });
  },
  { csrf: false },
);
