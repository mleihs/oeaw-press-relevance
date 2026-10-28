// Schreibpfad der Bewertungen. Ersetzt die vier UPDATE-Stellen, die bisher
// nebeneinander lagen (Knopf Publikationen, Knopf Events, In-Chat-Apply der
// Publikationen, In-Chat-Apply der Events) und jeweils eigene Spaltenlisten
// und Überschreibregeln hatten. Der Knopf etwa überschrieb einen vorhandenen
// Score ohne jede Wache. Auch das Markieren gescheiterter Bewertungen steht
// hier, damit alle Schreibzugriffe der Bewertung an einer Stelle liegen.
//
// Überschreibschutz im WHERE, nicht im JS: atomar und unabhängig von einem
// Vor-SELECT. Ein Update, das nichts trifft (inzwischen anderweitig bewertet),
// fehlt in der Rückgabe; der Aufrufer zählt es als übersprungen.

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, events as eventsTable, publications } from '@/lib/server/db';
import { calculatePressScore } from '@/lib/server/analysis/score';
import { getCurrentEventScoreWeights } from '@/lib/server/events/score-weights';
import type { EventAnalysisResult } from '@/lib/server/events/prompts';
import { computeEventScore } from '@/lib/shared/scoring';
import type { AnalysisResult, EventScoreWeights } from '@/lib/shared/types';

export interface WriteOptions {
  /** Provenienz in llm_model (Kern: autoModelTag, In-Chat: session-model.json). */
  modelTag: string;
  /** Auch bereits bewertete Einträge überschreiben. */
  force: boolean;
}

/** Was eine Publikations-Bewertung ausmacht: fünf Dimensionen, vier Texte.
 *  Das Haiku kommt geprüft und getrennt (PublicationWrite.haiku). */
export type PublicationEvaluation = Omit<AnalysisResult, 'publication_index' | 'haiku'>;

export interface PublicationWrite {
  id: string;
  result: PublicationEvaluation;
  /** Das geprüfte Haiku oder null. */
  haiku: string | null;
  cost: number;
}

/**
 * Schreibt Publikations-Bewertungen. `pitchRevised`: Einträge, deren Pitch das
 * Lektorat umgeschrieben hat (pitch_revision = 1, sonst 0, denn eine neue
 * Bewertung bringt einen neuen Pitch). Liefert die ids, die geschrieben wurden.
 */
export async function writePublicationEvaluations(
  rows: readonly PublicationWrite[],
  ctx: WriteOptions & { pitchRevised: ReadonlySet<string> },
): Promise<string[]> {
  const written: string[] = [];
  for (const row of rows) {
    const r = row.result;
    const where = ctx.force
      ? eq(publications.id, row.id)
      : and(eq(publications.id, row.id), isNull(publications.pressScore));
    const res = await db
      .update(publications)
      .set({
        analysisStatus: 'analyzed',
        pressScore: calculatePressScore(r),
        publicAccessibility: r.public_accessibility,
        societalRelevance: r.societal_relevance,
        noveltyFactor: r.novelty_factor,
        storytellingPotential: r.storytelling_potential,
        mediaTimeliness: r.media_timeliness,
        pitchSuggestion: r.pitch_suggestion,
        targetAudience: r.target_audience,
        suggestedAngle: r.suggested_angle,
        reasoning: r.reasoning,
        haiku: row.haiku,
        llmModel: ctx.modelTag,
        analysisCost: row.cost,
        pitchRevision: ctx.pitchRevised.has(row.id) ? 1 : 0,
        // updated_at setzt der Trigger publications_set_updated_at.
      })
      .where(where)
      .returning({ id: publications.id });
    if (res.length > 0) written.push(row.id);
  }
  return written;
}

/**
 * Markiert Publikationen, deren Bewertung gescheitert ist, als `failed`; die
 * Kandidaten-View nimmt sie beim nächsten Lauf wieder auf. Nur Einträge ohne
 * Score: scheitert eine NEUbewertung, bleibt die bestehende Bewertung samt
 * Status stehen (vorher stand dann ein Score neben `failed`).
 */
export async function markPublicationsFailed(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(publications)
    .set({ analysisStatus: 'failed' })
    .where(and(inArray(publications.id, [...ids]), isNull(publications.pressScore)));
}

export interface EventWrite {
  id: string;
  result: EventAnalysisResult;
  cost: number;
}

const clamp01 = (n: unknown): number => Math.max(0, Math.min(1, Number(n) || 0));

/** Die vier Event-Dimensionen einer Bewertung, auf 0..1 begrenzt. */
export function eventDimensions(r: EventAnalysisResult) {
  return {
    public_appeal: clamp01(r.public_appeal),
    scientific_significance: clamp01(r.scientific_significance),
    reach: clamp01(r.reach),
    timeliness: clamp01(r.timeliness),
  };
}

/** Event-Scores mit der aktuell im Team eingestellten Gewichtung (wie write sie speichert). */
export async function eventScores(results: readonly EventAnalysisResult[]): Promise<number[]> {
  const weights = await getCurrentEventScoreWeights();
  return results.map((r) => computeEventScore(eventDimensions(r), weights));
}

/**
 * Schreibt Event-Bewertungen mit der aktuellen Gewichtung, sodass frisch
 * bewertete Events dieselben Gewichte tragen wie die Neuberechnung hinter der
 * Einstellungskarte. Liefert die ids, die geschrieben wurden.
 */
export async function writeEventEvaluations(
  rows: readonly EventWrite[],
  ctx: WriteOptions,
  weights?: EventScoreWeights,
): Promise<string[]> {
  const w = weights ?? (await getCurrentEventScoreWeights());
  const written: string[] = [];
  for (const row of rows) {
    const r = row.result;
    const dims = eventDimensions(r);
    const where = ctx.force
      ? eq(eventsTable.id, row.id)
      : and(eq(eventsTable.id, row.id), isNull(eventsTable.eventScore));
    const res = await db
      .update(eventsTable)
      .set({
        analysisStatus: 'analyzed',
        eventScore: computeEventScore(dims, w),
        publicAppeal: dims.public_appeal,
        scientificSignificance: dims.scientific_significance,
        reach: dims.reach,
        timeliness: dims.timeliness,
        pitchSuggestion: r.pitch_suggestion?.trim() || null,
        suggestedAngle: r.suggested_angle?.trim() || null,
        targetAudience: r.target_audience?.trim() || null,
        reasoning: r.reasoning?.trim() || null,
        llmModel: ctx.modelTag,
        analysisCost: row.cost,
        analyzedAt: sql`NOW()`,
      })
      .where(where)
      .returning({ id: eventsTable.id });
    if (res.length > 0) written.push(row.id);
  }
  return written;
}

/** Gegenstück zu markPublicationsFailed: nur Events ohne Score. */
export async function markEventsFailed(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(eventsTable)
    .set({ analysisStatus: 'failed' })
    .where(and(inArray(eventsTable.id, [...ids]), isNull(eventsTable.eventScore)));
}
