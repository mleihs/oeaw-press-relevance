// Adapter der Events für den Bewertungskern (lib/server/scoring/run.ts):
// Kandidaten, Zwillinge, Modellaufruf, Texte, Schreiben. Gegenstück zu
// lib/server/analysis/scoring-adapter.ts. Unterschiede zu den Publikationen:
// kein Haiku, kein Eingangsfenster (siehe buildEventScopeWhere) und
// Zwillinge, weil dieselbe Veranstaltung oft mehrfach im Export steht: im
// selben Lauf als Gruppen (eventTwinGroups), über Läufe hinweg gegen die am
// selben Tag schon bewerteten Termine (withScoredSiblings, EVENT_TWIN_RULE);
// alignTwins gleicht die Dimensionen danach exakt an.

import { and, asc, isNotNull, sql, type SQL } from 'drizzle-orm';
import { db, events as eventsTable } from '@/lib/server/db';
import { log } from '@/lib/server/log';
import { eventScores, markEventsFailed, writeEventEvaluations } from '@/lib/server/scoring/persist';
import type { CandidateQuery, ScoringAdapter } from '@/lib/server/scoring/types';
import { EVENT_SCORE_DIMENSIONS } from '@/lib/shared/constants';
import { evaluationProblems } from '@/lib/shared/scoring/evaluation';
import { TEXT_FIELDS } from '@/lib/shared/scoring/text-audit';
import { analyzeEvents } from './analyze';
import { pickContent, siblingLabel, type EventAnalysisResult, type ScoredSibling } from './prompts';
import type { EventRow } from './to-api';

/** Ein Kandidat samt den am selben Tag schon bewerteten Terminen (Zwillingsabgleich im Prompt). */
export type EventCandidate = EventRow & { scoredSiblings?: ScoredSibling[] };

/** So viele schon bewertete Termine eines Tages sieht das Modell je Event höchstens. */
const MAX_SIBLINGS = 6;

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
export async function fetchEventCandidates(query: CandidateQuery): Promise<{ items: EventCandidate[]; skipped: number }> {
  const rows = await db
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
  const items = await withScoredSiblings(rows);
  return { items, skipped: query.ids ? query.ids.length - items.length : 0 };
}

const VIENNA_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const VIENNA_MINUTE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Vienna',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Hängt jedem Kandidaten die am selben Wiener Kalendertag schon bewerteten
 * Termine an, die nicht selbst im Lauf sind; gleiche Minute zuerst, dann
 * gleiches Institut, höchstens MAX_SIBLINGS. Ob einer davon derselbe Termin
 * ist, entscheidet das Modell (EVENT_TWIN_RULE): die Zentralseite stellt
 * Institutstermine mit neuem Titel und anderem Ortstext ein, Sprachfassungen
 * übersetzen den Titel, beides trifft keine Textregel sicher.
 */
async function withScoredSiblings(items: EventRow[]): Promise<EventCandidate[]> {
  if (items.length === 0) return items;
  const days = [...new Set(items.map((i) => VIENNA_DAY.format(new Date(i.eventAt))))];
  const scored = await db
    .select({
      id: eventsTable.id,
      title: eventsTable.title,
      eventAt: eventsTable.eventAt,
      locationTitle: eventsTable.locationTitle,
      institute: eventsTable.institute,
      public_appeal: eventsTable.publicAppeal,
      scientific_significance: eventsTable.scientificSignificance,
      reach: eventsTable.reach,
      timeliness: eventsTable.timeliness,
    })
    .from(eventsTable)
    .where(
      and(
        isNotNull(eventsTable.eventScore),
        // Der Tag als Text: ein date[]-Parameter scheitert in postgres-js
        // (kein Serializer, „Received an instance of Array"), text[] und uuid[] nicht.
        sql`to_char(${eventsTable.eventAt} AT TIME ZONE 'Europe/Vienna', 'YYYY-MM-DD') = ANY(${sql.param(days)}::text[])`,
        sql`${eventsTable.id} <> ALL(${sql.param(items.map((i) => i.id))}::uuid[])`,
      ),
    )
    .orderBy(asc(eventsTable.eventAt));

  const byDay = new Map<string, ScoredSibling[]>();
  for (const s of scored) {
    const { public_appeal, scientific_significance, reach, timeliness } = s;
    if (public_appeal === null || scientific_significance === null || reach === null || timeliness === null) continue;
    const day = VIENNA_DAY.format(new Date(s.eventAt));
    byDay.set(day, [...(byDay.get(day) ?? []), { ...s, public_appeal, scientific_significance, reach, timeliness }]);
  }
  return items.map((item) => {
    const siblings = byDay.get(VIENNA_DAY.format(new Date(item.eventAt)));
    if (!siblings?.length) return item;
    const minute = VIENNA_MINUTE.format(new Date(item.eventAt));
    const rank = (s: ScoredSibling) =>
      (VIENNA_MINUTE.format(new Date(s.eventAt)) === minute ? 0 : 2) + (s.institute === item.institute ? 0 : 1);
    return { ...item, scoredSiblings: [...siblings].sort((a, b) => rank(a) - rank(b)).slice(0, MAX_SIBLINGS) };
  });
}

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

/** Ohne Institut greift nur der Titel-Schlüssel. */
type TwinCandidate = Pick<EventRow, 'id' | 'title' | 'eventAt'> & Partial<Pick<EventRow, 'institute'>>;

/**
 * Die Zentralseite stellt verschiedene Termine mit derselben Uhrzeit ein
 * (Prod, 14.09.2026: zwei Vorträge um 09:00); für sie gilt der Minuten-Schlüssel nicht.
 */
const CENTRAL_PAGE = 'oeaw - home';

/** Die Schlüssel, über die zwei Events als derselbe Termin gelten (siehe eventTwinGroups). */
function twinKeys(item: TwinCandidate): string[] {
  const keys: string[] = [];
  const title = normalizeEventTitle(item.title);
  if (title && !PLACEHOLDER_TITLE.test(title)) keys.push(`titel|${VIENNA_DAY.format(new Date(item.eventAt))}|${title}`);
  const institute = item.institute?.trim().toLowerCase();
  if (institute && institute !== CENTRAL_PAGE) keys.push(`minute|${VIENNA_MINUTE.format(new Date(item.eventAt))}|${institute}`);
  return keys;
}

/**
 * Gruppen von Events im selben Lauf, die denselben Termin meinen. Zwei
 * Schlüssel, verbunden (ein Event mit beiden Schlüsseln verknüpft beide Gruppen):
 * - gleicher normalisierter Titel am selben Wiener Kalendertag: die
 *   TYPO3-Kopien und Sprachfassungen mit identischem Titel. Der Kalendertag
 *   statt der Uhrzeit, weil Kopien oft die Anlagezeit tragen; Platzhaltertitel
 *   gruppieren hier nie.
 * - gleiche Minute, gleiches Institut (seit 2026-10-28): die Sprachfassungen
 *   mit übersetztem Titel (Merenptah, NanoTrust, Phonetik) und die Kopien,
 *   die alle dieselbe Anlagezeit tragen. Der Ort zählt nicht, er ist oft leer
 *   oder mitübersetzt („1010 Wien, Seminarraum" gegen „1010 Vienna, Room").
 *   Auf Prod waren von rund 60 solchen Paaren aus 120 Tagen alle derselbe
 *   Termin, bis auf eines der Zentralseite (CENTRAL_PAGE, ausgenommen).
 * Neu betitelte Fassungen der Zentralseite erkennt erst das Modell, und nur
 * gegen schon bewertete Termine (withScoredSiblings).
 */
export function eventTwinGroups(items: ReadonlyArray<TwinCandidate>): string[][] {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };
  const firstByKey = new Map<string, string>();
  for (const item of items) {
    parent.set(item.id, item.id);
    for (const key of twinKeys(item)) {
      const first = firstByKey.get(key);
      if (first === undefined) firstByKey.set(key, item.id);
      else parent.set(find(item.id), find(first));
    }
  }
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const root = find(item.id);
    groups.set(root, [...(groups.get(root) ?? []), item.id]);
  }
  return [...groups.values()].filter((ids) => ids.length >= 2);
}

type EventDims = Pick<EventAnalysisResult, (typeof EVENT_SCORE_DIMENSIONS)[number]>;

function copyDims(into: EventAnalysisResult, from: EventDims): void {
  for (const dim of EVENT_SCORE_DIMENSIONS) into[dim] = from[dim];
}

/**
 * Gleicht die Dimensionen von Zwillingen an, nachdem das Modell bewertet hat:
 * 1. `twin_of` nennt einen am selben Tag schon bewerteten Termin (B1, B2 …):
 *    dessen Dimensionen exakt. Das Modell soll sie übernehmen; vertippte oder
 *    gerundete Werte gleicht das hier aus. Eine unbekannte Kennung zählt nicht.
 * 2. Zwillinge im selben Batch (`twins`, 1-basierte Positionen): alle wie das
 *    Mitglied mit Übernahme aus Schritt 1, sonst wie das erste Mitglied.
 * Texte bleiben, wie das Modell sie geschrieben hat. Liefert neue Objekte.
 */
export function alignTwins(
  batch: readonly EventCandidate[],
  results: readonly EventAnalysisResult[],
  twins: readonly (readonly number[])[],
): EventAnalysisResult[] {
  const out = results.map((r) => ({ ...r }));
  const byPosition = new Map<number, EventAnalysisResult>();
  out.forEach((r, i) => {
    const position = r.event_index ?? (results.length === batch.length ? i + 1 : undefined);
    if (position !== undefined && position >= 1 && position <= batch.length) byPosition.set(position, r);
  });

  const copied = new Set<number>();
  for (const [position, r] of byPosition) {
    const label = typeof r.twin_of === 'string' ? r.twin_of.trim().toUpperCase() : '';
    const item = batch[position - 1];
    const siblings = item.scoredSiblings ?? [];
    const index = siblings.findIndex((_, i) => siblingLabel(i) === label);
    if (index < 0) continue;
    copyDims(r, siblings[index]);
    copied.add(position);
    log.info('scoring_event_twin_copied', { id: item.id, from: siblings[index].id });
  }

  for (const group of twins) {
    const present = group.filter((p) => byPosition.has(p));
    if (present.length < 2) continue;
    const source = byPosition.get(present.find((p) => copied.has(p)) ?? present[0]) as EventAnalysisResult;
    for (const p of present) {
      const member = byPosition.get(p) as EventAnalysisResult;
      if (member !== source) copyDims(member, source);
    }
  }
  return out;
}

export const eventScoringAdapter: ScoringAdapter<EventCandidate, EventAnalysisResult> = {
  entity: 'events',
  requiresHaiku: false,
  fetchCandidates: fetchEventCandidates,
  analyze: async (batch, call, { twins }) => {
    const r = await analyzeEvents(batch, call, { twins });
    return { ...r, results: alignTwins(batch, r.results, twins) };
  },
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
