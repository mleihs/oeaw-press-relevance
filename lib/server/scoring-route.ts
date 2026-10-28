import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { createSSEStream, sseResponse, validateBody, withApiError } from '@/lib/server/http';
import { requireUser } from '@/lib/server/auth/require';
import { getEnv } from '@/lib/server/env';
import { runScoringButton } from '@/lib/server/scoring/button';
import { assertScoringPreconditions } from '@/lib/server/scoring/gate';
import type { ScoringTransport } from '@/lib/server/scoring/types';
import { DEFAULT_LLM_MODEL } from '@/lib/shared/constants';
import type { ScoringEntity } from '@/lib/shared/scoring/entity';
import { errorClassFor, type ScoringErrorClass } from '@/lib/shared/scoring/run-classify';
import { scoringBatchPayloadSchema } from '@/lib/shared/schemas';

// Gemeinsame Teile der Bewertungs-Routen: die 503-Antwort der Gates, die
// Stellschrauben aus der Env und die Knopf-Route für Publikationen und Events
// (app/api/analysis/batch, app/api/events/analyze). Muster wie
// lib/server/flag-route.ts: die beiden Knopf-Routen werden damit Einzeiler.
// Bewusst nicht in lib/server/scoring/: dort lädt das CLI jedes Modul unter
// tsx, und diese Datei braucht Next und die Anmeldung.

const GATE_CLASSES: ReadonlySet<ScoringErrorClass> = new Set(['provider_gate', 'model_gate', 'effort_gate']);

/**
 * Prüft Anbieter, Modell und Effort der Bewertung (lib/server/scoring/gate.ts).
 * Bei einem Verstoß die Antwort 503 mit Klartext und Fehlerklasse, sonst null.
 * Auf dem Vercel-Standby (kein ANTHROPIC_API_KEY) greift das immer.
 */
export function scoringGateResponse(): Response | null {
  try {
    assertScoringPreconditions({ model: DEFAULT_LLM_MODEL });
    return null;
  } catch (err) {
    const errorClass = errorClassFor(err);
    if (!GATE_CLASSES.has(errorClass)) throw err;
    return NextResponse.json(
      { error: `Bewertung auf dieser Instanz nicht verfügbar. ${(err as Error).message}`, errorClass },
      { status: 503 },
    );
  }
}

export interface ScoringRunConfig {
  limit: Record<ScoringEntity, number>;
  costCapUsd: number;
  batchSize: number;
  concurrency: number;
  /** Nur die Nacht; der Knopf ruft immer direkt. */
  transport: ScoringTransport;
}

/** Limits, Deckel, Batchgröße, Parallelität und Transport aus der Env (Defaults: SCORING_DEFAULTS). */
export function scoringRunConfig(): ScoringRunConfig {
  const env = getEnv();
  return {
    limit: { publications: env.SCORING_NIGHTLY_LIMIT_PUBS, events: env.SCORING_NIGHTLY_LIMIT_EVENTS },
    costCapUsd: env.SCORING_NIGHTLY_COST_CAP_USD,
    batchSize: env.SCORING_BATCH_SIZE,
    concurrency: env.SCORING_CONCURRENCY,
    transport: env.SCORING_TRANSPORT,
  };
}

/**
 * POST-Handler des Bewerten-Knopfes für eine Entität: Anmeldung, Gates,
 * Payload, dann der Kern im Hintergrund mit SSE-Frames
 * (lib/server/scoring/button.ts). Lock, Journal und Kostendeckel liegen im
 * Kern; ein belegter Lock oder eine leere Kandidatenmenge kommt als Frame
 * `skipped`, nicht mehr als 409 oder Plain-JSON.
 */
export function createScoringButtonRoute(entity: ScoringEntity) {
  return withApiError(async (req: NextRequest) => {
    // Gibt Anthropic-Guthaben aus → angemeldete Identität Pflicht.
    await requireUser();
    const unavailable = scoringGateResponse();
    if (unavailable) return unavailable;

    const payload = await validateBody(req, scoringBatchPayloadSchema);
    const config = scoringRunConfig();
    const { stream, send, close } = createSSEStream();
    // Läuft nach dem Return weiter; close() beendet den Stream, sobald der
    // Lauf fertig, gescheitert oder abgebrochen ist.
    void runScoringButton({
      entity,
      ids: payload.ids,
      force: payload.forceReanalyze,
      limit: payload.limit,
      batchSize: config.batchSize,
      concurrency: config.concurrency,
      costCapUsd: config.costCapUsd,
      abortSignal: req.signal,
      emit: send,
    }).finally(close);
    return sseResponse(stream);
  });
}
