import 'server-only';
import { estimateCost } from '@/lib/server/llm-client';
import type { TokenUsage } from '@/lib/server/llm-types';
import type { BridgeDraftRequest, BridgeDraftResponse } from './contract';
import { createDraftClient, DRAFT_APP_MODEL, generateDraft, sourceHashOf, type GeneratedDraft } from './draft';
import type { DraftSource } from './draft-prompt';
import {
  loadDraftSource,
  loadStoredDraft,
  saveDraft,
  type NewDraftRow,
  type StoredDraft,
} from './draft-store';

// Ablauf von /api/typo3-bridge/events/:id/draft. GET liest nur den
// gespeicherten Entwurf; POST gibt ihn zurück oder lässt einen neuen
// schreiben und speichert ihn. DB (./draft-
// store.ts) und Claude (./draft.ts) kommen als `deps`, damit der Test den
// Ablauf ohne DB und ohne kostenpflichtigen Aufruf prüft.
//
// Wann ein neuer Aufruf läuft:
//   - es gibt noch keinen Entwurf,
//   - `refresh: true` („Neu erzeugen" im Panel),
//   - ein Zusatzwunsch kommt mit, der vom gespeicherten abweicht. Das Panel
//     schickt beim ersten Klick `refresh: false`, auch wenn die Redakteurin
//     schon einen Wunsch eingetippt hat; ohne diese Regel bekäme sie den alten
//     Entwurf und ihr Wunsch verpuffte still.
// Sonst kommt der gespeicherte Entwurf (`cached: true`). Haben sich die
// Quelldaten seither geändert, sagt ein Hinweis das, statt still einen
// Entwurf zu älteren Daten als aktuell auszugeben.

export const STALE_SOURCE_NOTE =
  'Die Quelldaten des Events haben sich seit diesem Entwurf geändert. „Neu erzeugen" schreibt ihn aus dem aktuellen Stand.';

export interface DraftDeps {
  loadSource(eventId: string): Promise<DraftSource | null>;
  loadStored(eventId: string): Promise<StoredDraft | null>;
  generate(source: DraftSource, instructions: string | null): Promise<GeneratedDraft>;
  costOf(usage: TokenUsage): Promise<number>;
  /** Speichert und gibt den Zeitstempel der gespeicherten Zeile zurück. */
  save(row: NewDraftRow): Promise<string>;
}

export const dbDraftDeps: DraftDeps = {
  loadSource: loadDraftSource,
  loadStored: loadStoredDraft,
  // Der Client entsteht erst hier: ohne ANTHROPIC_API_KEY scheitert nur der
  // neue Entwurf (503), ein gespeicherter kommt weiter zurück.
  generate: (source, instructions) => generateDraft(source, instructions, createDraftClient()),
  costOf: (usage) => estimateCost(usage, DRAFT_APP_MODEL),
  save: saveDraft,
};

/** Leerer oder nur aus Leerraum bestehender Wunsch zählt als kein Wunsch. */
export function normalizeInstructions(raw: string | undefined): string | null {
  const t = raw?.trim();
  return t ? t : null;
}

/** Antwort aus einem gespeicherten Entwurf, mit Hinweis, falls die
 *  Quelldaten seither anders aussehen. */
function storedResponse(stored: StoredDraft, source: DraftSource): BridgeDraftResponse {
  const notes = stored.sourceHash === sourceHashOf(source) ? stored.notes : [...stored.notes, STALE_SOURCE_NOTE];
  return { draft: stored.draft, notes, model: stored.model, generated_at: stored.generatedAt, cached: true };
}

/**
 * GET: nur der gespeicherte Entwurf, nie ein Claude-Aufruf. Das Panel lädt
 * ihn beim Öffnen eines Events, das `has_draft` trägt; Öffnen kostet so nie
 * etwas. null: Event unbekannt; `{ draft: null }`: noch kein Entwurf.
 */
export async function readStoredDraft(
  eventId: string,
  deps: Pick<DraftDeps, 'loadSource' | 'loadStored'> = dbDraftDeps,
): Promise<{ draft: BridgeDraftResponse | null } | null> {
  const source = await deps.loadSource(eventId);
  if (!source) return null;
  const stored = await deps.loadStored(eventId);
  return { draft: stored ? storedResponse(stored, source) : null };
}

/** POST. null, wenn das Event unbekannt ist (Route: 404). */
export async function getOrCreateDraft(
  eventId: string,
  req: BridgeDraftRequest,
  deps: DraftDeps = dbDraftDeps,
): Promise<BridgeDraftResponse | null> {
  const source = await deps.loadSource(eventId);
  if (!source) return null;

  const instructions = normalizeInstructions(req.instructions);
  const stored = await deps.loadStored(eventId);

  if (stored && !req.refresh && (instructions === null || instructions === stored.instructions)) {
    return storedResponse(stored, source);
  }

  const generated = await deps.generate(source, instructions);
  const costUsd = await deps.costOf(generated.usage);
  const generatedAt = await deps.save({
    eventId: source.id,
    webdbUid: source.webdbUid,
    generated,
    instructions,
    sourceHash: sourceHashOf(source),
    costUsd,
  });
  return {
    draft: generated.draft,
    notes: generated.notes,
    model: generated.model,
    generated_at: generatedAt,
    cached: false,
  };
}
