// Adapter der Events für den Bewertungskern (lib/server/scoring/run.ts):
// Kandidaten, Zwillinge, Modellaufruf, Texte, Schreiben. Gegenstück zu
// lib/server/analysis/scoring-adapter.ts. Unterschiede zu den Publikationen:
// kein Haiku, kein Eingangsfenster (siehe buildEventScopeWhere) und
// Zwillingsgruppen, weil dieselbe Veranstaltung oft mehrfach im Export steht.

import { asc, sql, type SQL } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import { eventScores, markEventsFailed, writeEventEvaluations } from '@/lib/server/scoring/persist';
import type { CandidateQuery, ScoringAdapter } from '@/lib/server/scoring/types';
import { EVENT_SCORE_DIMENSIONS } from '@/lib/shared/constants';
import { evaluationProblems } from '@/lib/shared/scoring/evaluation';
import { TEXT_FIELDS } from '@/lib/shared/scoring/text-audit';
import { analyzeEvents } from './analyze';
import { pickContent, type EventAnalysisResult } from './prompts';
import type { EventRow } from './to-api';

export interface EventScope {
  /** Den ganzen Pool statt nur der offenen Kandidaten (überschreibt Bewertetes). */
  forceReanalyze?: boolean;
  /** Genau diese Events, geschnitten mit dem Pool. */
  ids?: string[];
  /** Nur Events mit diesem llm_model (Neubewertung einer Kohorte, impliziert den Pool). */
  rescoreTag?: string;
  /** Nur Events, die seit diesem Zeitpunkt bewertet wurden (ISO-Datum). */
  since?: string;
}

/**
 * Der Scope EINES Event-Bewertungslaufs. Symmetrisch zu
 * buildAnalysisScopeWhere in lib/server/analysis/scoring-adapter.ts, mit einem
 * begründeten Unterschied.
 *
 * Beide Gates sind Views, keine nachgebauten Prädikate (Migration
 * 20260721000002): non-force nimmt die offenen Kandidaten
 * (`event_scoring_candidates`: künftig + event_score IS NULL, inkl.
 * failed-Retry), force den ganzen Pool (`event_rescore_pool`: künftig, egal
 * ob schon bewertet). Bis 2026-07-21 stand die Force-Bedingung als
 * `event_at >= NOW()` im TypeScript und wäre damit hinter jeder künftigen
 * Verschärfung der Kandidaten-View zurückgeblieben.
 *
 * Bewusst KEIN created_at-Fenster (anders als bei den Publikationen, wo
 * SCORING_RECENT_DAYS den Altbestand fernhält): `event_at >= now()` begrenzt
 * die Menge hier schon von selbst; es gibt keinen Event-Altbestand, weil
 * vergangene Events nie wieder Kandidaten werden. Ein zusätzliches
 * Eingangsfenster würde nur frisch importierte, weit in der Zukunft liegende
 * Events willkürlich ausschließen.
 *
 * Eine Kohorte (`rescoreTag`) grenzt über llm_model ein, `since` über
 * analyzed_at (Events haben kein updated_at). Exportiert, damit
 * lib/server/events/scoring-adapter.test.ts das gerenderte SQL prüfen kann.
 */
export function buildEventScopeWhere(scope: EventScope): SQL {
  const view = sql.raw(scope.forceReanalyze || scope.rescoreTag ? 'event_rescore_pool' : 'event_scoring_candidates');
  const conditions: SQL[] = [sql`${eventsTable.id} IN (SELECT id FROM ${view})`];
  // Einzel-/Auswahl-Bewertung: die benannten ids, geschnitten mit dem Pool
  // (ein vergangenes Event bleibt also auch dann außen vor, wenn man es
  // ausdrücklich benennt). sql.param()::uuid[] wegen des Pooler-Bugs bei
  // barem ${array} (Memory drizzle-any-array-prod-bug).
  if (scope.ids?.length) conditions.push(sql`${eventsTable.id} = ANY(${sql.param(scope.ids)}::uuid[])`);
  if (scope.rescoreTag) conditions.push(sql`${eventsTable.llmModel} = ${scope.rescoreTag}`);
  if (scope.since) conditions.push(sql`${eventsTable.analyzedAt} >= ${scope.since}::timestamptz`);
  return sql.join(conditions, sql` AND `);
}

/** Kandidaten in Terminfolge; `skipped` = benannte ids, die an den Gates hängen blieben. */
export async function fetchEventCandidates(query: CandidateQuery): Promise<{ items: EventRow[]; skipped: number }> {
  const items = await db
    .select()
    .from(eventsTable)
    .where(
      buildEventScopeWhere({
        forceReanalyze: query.force,
        ids: query.ids,
        rescoreTag: query.rescoreTag,
        since: query.since,
      }),
    )
    .orderBy(asc(eventsTable.eventAt))
    .limit(query.ids?.length ?? query.limit);
  return { items, skipped: query.ids ? query.ids.length - items.length : 0 };
}

const VIENNA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Platzhaltertitel, die viele verschiedene Termine tragen („Title to be announced"). */
const PLACEHOLDER_TITLE = /^(?:title )?(?:to be announced|tba|tbd)$/;

/** Titel ohne Groß-/Kleinschreibung, Diakritika und Kopie-Vermerk („(Kopie 2)", „(copy)"). */
export function normalizeEventTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/\((?:copy|kopie)(?:\s*\d+)?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gruppen von Events, die denselben Termin meinen: gleicher normalisierter
 * Titel am selben Wiener Kalendertag. Das fängt die Sprachversionen (TYPO3
 * legt die EN-Fassung als eigenen Datensatz an, meist mit identischem Titel)
 * und die Kopien der TYPO3-Kopierfunktion, nicht aber die Einträge der
 * Zentralseite mit neu geschriebenem Titel (Memory events-dubletten-ursachen).
 * Der Kalendertag statt der Uhrzeit, weil Kopien oft die Anlagezeit statt der
 * Startzeit tragen; Platzhaltertitel gruppieren nie.
 */
export function eventTwinGroups(items: ReadonlyArray<Pick<EventRow, 'id' | 'title' | 'eventAt'>>): string[][] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const title = normalizeEventTitle(item.title);
    if (!title || PLACEHOLDER_TITLE.test(title)) continue;
    const key = `${VIENNA_DAY.format(new Date(item.eventAt))}|${title}`;
    groups.set(key, [...(groups.get(key) ?? []), item.id]);
  }
  return [...groups.values()].filter((ids) => ids.length >= 2);
}

export const eventScoringAdapter: ScoringAdapter<EventRow, EventAnalysisResult> = {
  entity: 'events',
  requiresHaiku: false,
  fetchCandidates: fetchEventCandidates,
  analyze: (batch, call, { twins }) => analyzeEvents(batch, call, { twins }),
  resultIndex: (r) => r.event_index,
  problemsOf: (r) => evaluationProblems(r, { dimensions: EVENT_SCORE_DIMENSIONS, texts: TEXT_FIELDS }),
  textsOf: (r) => ({
    pitch_suggestion: r.pitch_suggestion,
    suggested_angle: r.suggested_angle,
    target_audience: r.target_audience,
    reasoning: r.reasoning,
  }),
  withTexts: (r, texts) => ({ ...r, ...texts }),
  contentOf: (ev) => pickContent(ev),
  twinGroups: eventTwinGroups,
  scores: eventScores,
  write: (rows, ctx) =>
    writeEventEvaluations(
      rows.map((r) => ({ id: r.item.id, result: r.result, cost: r.cost })),
      { modelTag: ctx.modelTag, force: ctx.force },
    ),
  markFailed: markEventsFailed,
};
