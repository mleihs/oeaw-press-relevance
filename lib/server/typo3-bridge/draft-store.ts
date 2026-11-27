import 'server-only';
import { eq } from 'drizzle-orm';
import { db, events as eventsTable, eventTypo3Drafts } from '@/lib/server/db';
import { toIso, type BridgeDraft } from './contract';
import type { GeneratedDraft } from './draft';
import type { DraftSource } from './draft-prompt';

// DB-Zugriffe des TYPO3-Entwurfs: Quelldaten aus `events` lesen, den
// Entwurf je Event in `event_typo3_drafts` lesen und schreiben
// (supabase/migrations/20261127000001_event_typo3_drafts.sql). In `events`
// schreibt die Bridge nie.

export interface StoredDraft {
  draft: BridgeDraft;
  notes: string[];
  model: string;
  instructions: string | null;
  sourceHash: string;
  generatedAt: string;
}

export interface NewDraftRow {
  eventId: string;
  webdbUid: number;
  generated: GeneratedDraft;
  instructions: string | null;
  sourceHash: string;
  costUsd: number;
}

/** Quelldaten eines Events für den Prompt; null, wenn die id unbekannt ist. */
export async function loadDraftSource(eventId: string): Promise<DraftSource | null> {
  const [row] = await db
    .select({
      id: eventsTable.id,
      webdbUid: eventsTable.webdbUid,
      title: eventsTable.title,
      teaser: eventsTable.teaser,
      bodytext: eventsTable.bodytext,
      eventInformation: eventsTable.eventInformation,
      eventAt: eventsTable.eventAt,
      eventEndAt: eventsTable.eventEndAt,
      locationTitle: eventsTable.locationTitle,
      organizerTitle: eventsTable.organizerTitle,
      institute: eventsTable.institute,
      url: eventsTable.url,
      lang: eventsTable.lang,
      availableLangs: eventsTable.availableLangs,
    })
    .from(eventsTable)
    .where(eq(eventsTable.id, eventId))
    .limit(1);
  return row ? { ...row, availableLangs: row.availableLangs ?? [] } : null;
}

export async function loadStoredDraft(eventId: string): Promise<StoredDraft | null> {
  const [row] = await db
    .select()
    .from(eventTypo3Drafts)
    .where(eq(eventTypo3Drafts.eventId, eventId))
    .limit(1);
  if (!row) return null;
  return {
    draft: row.draft as BridgeDraft,
    notes: Array.isArray(row.notes) ? (row.notes as string[]) : [],
    model: row.model,
    instructions: row.instructions,
    sourceHash: row.sourceHash,
    generatedAt: toIso(row.generatedAt),
  };
}

/** Speichert den Entwurf (ein neuer überschreibt den alten) und gibt den
 *  Zeitstempel der gespeicherten Zeile zurück. */
export async function saveDraft(row: NewDraftRow): Promise<string> {
  const update = {
    webdbUid: row.webdbUid,
    draft: row.generated.draft,
    notes: row.generated.notes,
    model: row.generated.model,
    effort: row.generated.effort,
    instructions: row.instructions,
    sourceHash: row.sourceHash,
    inputTokens: row.generated.usage.promptTokens,
    outputTokens: row.generated.usage.completionTokens,
    costUsd: row.costUsd,
    generatedAt: new Date().toISOString(),
  };
  const [saved] = await db
    .insert(eventTypo3Drafts)
    .values({ eventId: row.eventId, ...update })
    .onConflictDoUpdate({ target: eventTypo3Drafts.eventId, set: update })
    .returning({ generatedAt: eventTypo3Drafts.generatedAt });
  return toIso(saved?.generatedAt ?? update.generatedAt);
}
